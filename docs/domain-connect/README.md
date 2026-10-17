# One press instead of three records

HRT-289. What it takes for a church to put its three sending settings in place without typing
anything, and what has to happen outside this repository first.

## The mechanism

Domain Connect is an open standard, MIT licensed, with about twenty DNS companies implementing it,
GoDaddy, IONOS, Cloudflare and Squarespace Domains among them. A church presses one button here,
lands on its own DNS company's screen, approves, and the records are written. Nothing is pasted and
nothing is typed.

Entri sells the same thing for $249 a month. What Entri is selling is the onboarding below, already
done.

## The catch, said plainly

**The press only works where our template has already been onboarded with that DNS company.** The
spec is explicit: a DNS company applies a template it already holds, named by `providerId` and
`serviceId`. It will not apply one it has never seen.

So the sequence is: publish the template, submit it, wait for companies to pick it up, and until
then a church reads the three settings and types them. The screen never shows a press that cannot
work, because it asks the domain first.

## The template

[`connectapp.church.email.json`](connectapp.church.email.json), named `providerId.serviceId.json` as
the repository requires.

Three records, matching what a sending account generates:

| | |
|---|---|
| `TXT` at `resend._domainkey` | `p=%dkim%`, the signature that proves the mail is the church's |
| `CNAME` at `rsend` | the path the mail leaves by |
| `CNAME` at `send` | the path a bounce comes back on |

The values are variables because every church's key is its own. `txtConflictMatchingMode` is set on
the TXT record, so a company that already holds a signature at that name replaces it rather than
leaving two.

## What has to happen outside this repository

Three things, in order. The first two are yours.

### 1. A signing key, and a DNS record for its public half

The synchronous flow is signed, so a DNS company can tell our request from somebody else's. That
needs a key pair and the public half published on `connectapp.church`:

```
openssl genrsa -out domain-connect.key 2048
openssl rsa -in domain-connect.key -pubout -out domain-connect.pub
```

Publish the public key at `_dck1.connectapp.church` as **several TXT records, one per chunk**, each
carrying the header Domain Connect reads:

```
_dck1.connectapp.church  TXT  "p=1,a=RS256,d=<first 200 characters of the base64>"
_dck1.connectapp.church  TXT  "p=2,a=RS256,d=<the rest>"
```

Take the base64 between the PEM header and footer with the newlines removed, cut it into pieces
small enough that `p=N,a=RS256,d=` plus the piece stays under the 255 characters a TXT string
allows, and publish each piece as its own record, numbered from 1 in order. The pieces are
concatenated back by whoever reads it, so they have to join to exactly the original base64.

**Published 13 October 2026 as one record holding the bare base64, which is the wrong shape**, and
Cloudflare refused to onboard the template over it on 17 October: `dc-debug-pubkey` reported "txt
record is not split to short enough p= chunks" and "txt record token missing '='". A single 392
character record also exceeds what one TXT string can hold, so DNS had split it at 255 into two
quoted strings with no headers on either. The key itself is good and does not need replacing, only
republishing in this shape.

The private half in `.env.local` signs a query that verifies against it. The same key goes in the production secrets at
deploy. Keep the private key out of the repository: it goes in the deployment's
own secrets as `DOMAIN_CONNECT_PRIVATE_KEY`, and the record's name goes in
`DOMAIN_CONNECT_KEY_ID` (`_dck1`).

### 2. The submission

1. Open the [online editor](https://domainconnect.paulonet.eu/dc/free/templateedit), load the
   template, and test it against an apex domain and a host. Copy the test-results link it gives you.
   **Done, 13 October 2026.** Both tests pass, with `dkim`, `rsendhost` and `sendhost` filled in, and
   the link the editor gave back is in [test-results.md](test-results.md). A pull request without it
   is refused, and a link that does not match the template submitted is refused too, so it is
   regenerated whenever the template changes.
2. Lint it: `dc-template-linter -tolerate warn connectapp.church.email.json`, which must exit 0.
   `-merge-or-fail` exiting 0 means it qualifies for the fast track.
3. Open a pull request against `Domain-Connect/Templates` using their own pull request template
   unaltered, with the test-results links in the field they ask for. **Merged, 14 October 2026:**
   [Domain-Connect/Templates#2318](https://github.com/Domain-Connect/Templates/pull/2318).

   **Nobody holds it yet, as of 14 October 2026.** An earlier note here said IONOS answered for it
   the same day; that was wrong, and checking again by hand is what found it. IONOS, GoDaddy, Domain
   Chief and Glauca all answer for the standard's own example template and return 404 for ours, which
   is the shape of a company that implements the protocol and has not loaded us. Cloudflare and
   Vercel answer for nothing, the canonical example included, so they do not serve the template
   question at all.

   Domain Connect publishes no sync schedule and the repository's own guidance says onboarding is
   never automatic: each company pulls when it chooses. So the screen asks the domain before it
   offers the press, and a church at a company that has not loaded us sees the three settings
   instead. Nobody meets a button that fails.

   Asking by hand, for one company:

   ```
   curl -s https://api.domainconnect.ionos.com/v2/domainTemplates/providers/connectapp.church/services/email
   ```

   Two things cost a round each, worth knowing if the template is ever resubmitted. The repository
   wants **two** links, one with a host and one without, and it refuses a token it cannot decode
   with plain gzip: one of ours was truncated in copying and the only sign was a one-line warning in
   the workflow log. Decode a token before pasting it:

   ```
   python3 -c "import base64,gzip,urllib.parse,sys;gzip.decompress(base64.b64decode(urllib.parse.unquote(sys.argv[1])));print('ok')" '<token>'
   ```

### 3. The emails, one a DNS company

**This is the step that was missed.** The merge publishes the template and installs it nowhere. Every
company has to load ours, and the published route is an email to each of them.
[onboarding.md](onboarding.md) has what the daily check says about each one and what GoDaddy told
another service provider in October 2026; [outreach.md](outreach.md) has the wording to send.

### 4. Then it lights up on its own

A church whose domain is at a company that holds our template sees one press. Everywhere else the
three settings stay as they are, with the right page and the right words, which is what every church
gets today.

## Why not an API token instead

A church could paste a Cloudflare or Vercel token and we would write the records in a second. It
works today and needs nobody's permission. It is also a church being asked to make an API token,
which is the exact thing this whole screen exists to avoid.
