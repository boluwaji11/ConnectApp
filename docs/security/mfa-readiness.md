# MFA readiness

An engineering handoff for implementing multifactor authentication. Written
during the October 2026 security review, which deliberately did not implement
any of it.

## What has since been built (HRT-437, 18 October 2026)

Step 2 of the rollout below is done: **two-step verification is available to
anybody and required of nobody.**

- **The factor is Supabase's TOTP.** `/settings/security` holds a card that
  enrols, shows Supabase's own QR, offers the setup key for typing by hand, and
  takes the first code out of the app.
- **Recovery codes are ours**, because this Supabase version has none. Ten
  codes, issued at enrolment in the same call that turns two-step on, hashed
  with SHA-256 and spent once. `packages/db/src/repo/two-step.ts`.
- **The gate is in `requireSession`**, not on the sign-in action, so a bookmark
  is refused the same way a form is. A session at `aal1` whose mirror says
  enrolled goes to `/sign-in/code` and reaches nothing else.
- **The mirror is `app_users.mfa_enrolled_at`**, read beside the memberships so
  no navigation asks Supabase.
- **A recovery code turns two-step off** rather than letting one session
  through. Supabase raises the assurance level only for the factor itself, and
  the factor is on the phone that is gone.

**One defect worth keeping in mind**, found by driving the flow in a browser
and fixed before it shipped: the factor list was collapsed to an empty array
when Supabase could not be reached, and the challenge screen read an empty list
as "the factor is gone", cleared the mirror and let the person through. A
failed read must never be allowed to disable a second factor.
`apps/web/tests/two-step.test.ts` is that bug.

**Still to do: step 1, step 3 and step 4 below.** The operator portal has no
MFA, no role is required to enrol, and there is no step-up.

### The order agreed on 18 October 2026

The owner set this, and it moves the portal behind the product, which reverses
the recommendation further down this page. The reason is that pilot churches
start within weeks and a church signing up is the path that has to be right
first; nine operators are a known, reachable group.

1. **HRT-438, required of anybody who can read member information, at sign-up.**
   An owner meets it while creating their church, and an invited person meets
   it while setting their account up. Required rather than offered, and part of
   the sign-up rather than a thing to come back to.
2. **HRT-440, the deploy script.**
3. **HRT-439, the operator portal.**

**The rule is about permissions, not role names.** A church writes its own
roles, so "can read member information" has to resolve through the matrix in
`packages/db/src/permissions.ts` rather than through the nine built-in names.
The `members` group there is `members.edit`, `members.archive`,
`members.households` and `members.notes.confidential`, and `rolesWith()` in
`packages/db/src/roles.ts` already resolves a permission to the roles holding
it. Note that reading the directory is not itself one of those permissions, so
the first question to settle in that story is which permission, or which read,
is the line.

**The thing to be most careful about:** this is the first rule that can stop
somebody finishing their own church's sign-up. Recovery has to work before it
turns on, and a church's first owner has nobody above them to reset it, so the
operator reset path in step 3 of the rollout below stops being optional.

R1.8 says password auth plus TOTP, **mandatory for Owner, Admin and Finance**.
R21.4 repeats it. PRD section 13.9 records TOTP as one of the reasons Supabase
was chosen, so the mechanism is bought rather than built.

Anything below marked **confirmed** was read in the code. Anything marked
**recommendation** is a judgement for whoever implements this.

## What exists today

**Confirmed: no MFA, anywhere.** A repository-wide search for `mfa`, `totp`,
`aal`, `factor` and `challenge` across both apps returns nothing. Supabase's MFA
endpoints are not called, no factor is enrolled, and no assurance level is ever
read.

**Confirmed: how a session is established and checked.**

| Piece | Where | What it does |
|---|---|---|
| Sign-in with a password | `apps/web/app/sign-in/actions.ts` | `signInWithPassword`, then mirror the user and accept invitations, then land |
| Sign-in with an email link | same file | `signInWithOtp`, landing on `/auth/callback` |
| The link's landing | `apps/web/app/auth/callback/route.ts` | Exchanges a code or verifies a token hash, then accepts invitations |
| Reading the user | `apps/web/lib/session.ts`, `currentUser` | `getClaims()`: the token's signature and expiry are verified locally with WebCrypto against a published key set, cached ten minutes |
| Refreshing | `apps/web/middleware.ts` | `getClaims()` on every request the matcher covers |
| The session id | `session.ts`, `currentSessionId` | Read from the access token's own `session_id` claim |
| Deciding the church | `session.ts`, `requireSession` | Host, then a query parameter, then a cookie; the membership is always verified against `tenant_members` |
| The portal's own door | `apps/admin/app/actions.ts` | Password only, then `platform_admins`, with a per-address lockout of five attempts for fifteen minutes |

**Confirmed: the two apps do not share a session.** The product writes the
default Supabase cookie scoped to the parent domain; the portal uses a cookie
named `connectapp-admin-auth`. So a church session is not merely refused at the
portal, it is not sent there. That matters for MFA because it means the portal
needs its own enforcement rather than inheriting the product's.

**Confirmed: the one claim already read from the token** is `session_id`, parsed
from the payload in `currentSessionId` and compared only against session ids the
database returned. There is no existing place that reads an assurance level, so
there is nothing to extend; this will be a new read.

## What has to change

### 1. Read the assurance level

Supabase expresses MFA state as AAL: `aal1` is a password or a link, `aal2` is a
second factor presented. It is a claim on the access token and it is also
answered by `getAuthenticatorAssuranceLevel()`.

**Recommendation:** read it from the token in `currentUser`, beside the claims
already read there, so it costs nothing. The existing comment in that function
explains why the token is trusted locally and that reasoning carries over: the
signature and expiry are verified, and every screen decides what a reader may
see from `tenant_members` on the request itself.

Add `assurance: "aal1" | "aal2"` to the `Session` interface. That one field is
what everything else below keys on.

### 2. Decide where enrolment is required

R1.8 says mandatory for Owner, Admin and Finance. The question the requirement
does not answer is what happens to somebody who holds one of those roles and has
not enrolled yet.

**Recommendation:** `requireSession` already redirects for the cases where a
reader cannot proceed, and that is the right place. A role that requires a
second factor and has `aal1` goes to an enrolment screen rather than to the
dashboard, and the enrolment screen is the only thing reachable until it is
done. That keeps the rule in one place, which is the same reason the spelling
and the church are settled there.

**Watch:** a church's first Owner meets this on their very first screen, before
they have created anything. That is the right moment to ask and the wrong moment
to lose them, so the enrolment screen has to be the best screen in the product.

**Watch:** a church can write its own roles. A custom role holding
`giving.amounts` or `church.manage` is as privileged as Finance or Admin, so the
rule wants to be about permissions rather than about the nine built-in role
names. `rolesWith()` in `packages/db/src/roles.ts` already resolves a
permission to the roles that hold it and is the natural hinge.

### 3. Enrolment, verification and recovery

Supabase provides `mfa.enroll`, `mfa.challenge`, `mfa.verify` and
`mfa.unenroll`. The flows are thin wrappers; the decisions are not.

- **Enrolment** returns a TOTP secret and a QR code. The secret must not be
  logged, must not reach a server component's props beyond the screen that
  renders it, and must not survive the request.
- **Verification** at sign-in is a second step after
  `signInWithPassword`. Both sign-in paths and the email-link landing reach
  `syncUserAndAcceptInvitations`, which accepts pending invitations. **Decide
  whether an invitation should be accepted at `aal1` or only at `aal2`.**
  Accepting at `aal1` means a factor challenge that is never completed has
  already granted a membership.
- **Recovery is the hard part and the real risk.** A volunteer treasurer who
  loses their phone cannot be left outside the church's giving records, and a
  recovery path weaker than the factor makes the factor decorative. Options, in
  the order I would consider them: recovery codes shown once at enrolment;
  another Owner of the same church being able to reset a member's factor, which
  is auditable and needs no support contact; and a platform operator being able
  to reset an Owner's, which is the last resort and must write a
  `platform_events` row.

**Recommendation:** do not ship enrolment without shipping recovery. The
support cost of the alternative lands on the one person maintaining this, and
PRD section 5.6 is explicit that support is the real cost.

### 4. Step-up for sensitive actions

Separate from enrolment: an action that deserves a *fresh* factor rather than a
session that presented one this morning. The review found these, and each is
now permission-checked, so each is a one-line addition when step-up exists.

| Action | Where | Why |
|---|---|---|
| Connect or relink the church's Stripe account | `settings/online/actions.ts`, `connectStripe` | The link it returns can change the bank account the money settles to |
| Issue a refund | `giving/actions.ts`, `giveBack` | Moves real money out of the church's balance |
| Change a member's role, or invite at a role | `settings/manage-accesses/actions.ts` | Grants reach |
| Grant or revoke a platform operator | `apps/admin/app/actions.ts` | Cross-church reach |
| Connect or withdraw a messaging provider | `settings/email/actions.ts`, the Resend callback | Full access to the church's sending account |
| Set a custom domain | `settings/church/domain-actions.ts` | Decides which church a host resolves to |
| Run the complete export | `api/export/route.ts` | Every record the church holds, in one file |
| Read a confidential note | `repo/notes.ts` | Already audited on read; step-up is the next layer |
| Change an email address or a password | `settings/security/actions.ts` | Already re-proves the password |

**Recommendation:** implement step-up as one helper that takes the session and a
maximum age, and refuses with a typed error the screens already know how to
render, in the same shape `PermissionError` uses. Do not spread
`getAuthenticatorAssuranceLevel` calls through the actions.

### 5. The admin portal

**Confirmed:** password only, with a lockout per address and no per-IP counter,
and every sign-in attempt recorded in `platform_sign_ins` with its outcome.

The portal has cross-church reach by design, so it is the place where MFA
matters most and also the easiest: there are nine operators, not nine hundred
churches, and no onboarding funnel to protect. **Recommendation: require `aal2`
in `requireTeamMember()` with no grace period, and do the portal first.** It is
a smaller change than the product's and it closes the larger hole.

### 6. What MFA does not fix

Worth writing down so it is not assumed. A session that presented a second
factor is still a session: the token lives an hour, and somebody taken out of a
church meets that decision on their next press from `tenant_members` rather than
from their token. MFA raises the cost of getting in; it changes nothing about
what a session may then reach, which is still decided per request.

## Testing

- Enrol, challenge, verify and unenrol, against a real Supabase project. The
  suite that signs in through Supabase Auth already skips itself in CI, which
  runs a plain Postgres container, so these belong with it.
- A privileged role at `aal1` is sent to enrolment and can reach nothing else.
- An unprivileged role is unaffected.
- A custom role holding a privileged permission is treated as privileged.
- Each recovery path, including the one that needs another Owner.
- Every step-up action refuses a stale factor and accepts a fresh one.
- An invitation is accepted at whichever assurance level you decide, and not the
  other.
- The portal refuses `aal1` outright.

## Rollout

1. The portal first, with no grace period. Few people, highest reach.
2. Enrolment and recovery in the product, available to anybody, required of
   nobody.
3. Then required for the privileged roles, which is the step that can lock
   somebody out of their own church, so it wants recovery proven first and a way
   for an operator to intervene.
4. Step-up last. It is the layer that assumes the rest works.

No church is running on the platform yet, which makes this the cheapest it will
ever be to require.

## Required at sign-up (HRT-438, 18 October 2026)

Who: anybody holding one of `TWO_STEP_PERMISSIONS` in
`packages/db/src/roles.ts`. That is the people, children, money and
church-settings permissions, plus leading a group or a team. It catches owner,
admin, staff, finance, pastoral, checkin_volunteer, group_leader and
team_leader, and any role a church wrote that holds one of them.

A plain member is never asked. Their role holds nothing, and `/members`,
`/checkin` and `/reports` all refuse them, which was checked in a browser
rather than assumed.

When: accounts made on or after `TWO_STEP_REQUIRED_FROM` in
`packages/db/src/repo/two-step.ts`. Widening the rule to everybody is moving
that date back; narrowing it is moving it forward.

Where: `requireSession`, after the church is settled, because the answer
depends on the role in this church rather than on the account.

**Two things to know if this is ever debugged.** Both cost an hour.

The gate appeared not to fire on page navigations while firing correctly on
API routes. It was the dev server: Turbopack could not resolve
`@vercel/turbopack-next/internal/font/google/font`, page renders were failing
and falling back to the client, and nothing server-side ran. Against a build
it worked first time. A gate that seems to work on one kind of request and
not another is worth suspecting the server before the code.

Finishing enrolment re-renders the page the action was called from, so a
`redirect()` on that page fires the instant the code is accepted and the
recovery codes are never shown. Both the product's screen and the portal's had
that bug. Neither sends anybody away once enrolled.
