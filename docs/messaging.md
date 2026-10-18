# In-app messages

R16.9, R17.1. The part of communication a church can run with no provider,
no credentials and nothing resold: a message written here and read here.

The public website has a separate support contact form. It sends messages to
`support@connectapp.church` through the configured Gmail Workspace mailbox and
limits submissions through Upstash Redis. SMTP authenticates as the mailbox
owner and uses the support address as its From address. Add the support address
as a Gmail send-as alias for the authenticated mailbox. Keep credentials in the
deployment environment; `.env.example` lists the required names.

## Why this and not email

F16 is deferred because email, SMTP and SMS all mean holding somebody's
credentials and paying for delivery. A message that never leaves the product
costs nothing to deliver, so it is the one kind this platform can give a church
outright. It is also the one a church asks for first: a member replies to a
serving request, a group leader asks the office a question, the office answers
a prayer request without putting a phone number in a group chat.

It is deliberately not a chat app. A church of 50 to 500 is not going to run
its life here, and a product that tries becomes a worse WhatsApp. What it has
to do is carry a short exchange between a member and the office, keep it
against the member's record, and make sure neither side has to remember where
it was.

## What a thread is

One thread between the church office and one member. The office is not a
person: whoever is on staff this month answers, and the thread stays with the
church rather than with whoever happened to reply. A member who writes in
August and again in March is writing into the same thread.

Groups and teams come later, on the same tables, by giving a conversation a
group rather than a member. Nothing in the first build may make that harder.

## The tables

**`conversations`** carries the church, the member it is with, when it was last
written to, and two read marks: one for the member and one for the office.
Archived rather than deleted, like everything else a church made.

**`messages`** carries the conversation, which side wrote it, who wrote it, the
words as markdown, and when. A message is never edited after it is sent and
never hard deleted.

Two read marks rather than a row per reader, because one side of this is "the
office", which is a role rather than a person. A church where a question
disappeared off the unread list because a volunteer opened it by accident on a
phone is a church that stops using it.

## Unread

For the member: messages from the church since their read mark.
For the office: messages from members since the office read mark.

The bell carries one line per thread with something unread, pointing at that
thread, under the rule already in force: one unread line per thing, rather than
one per message.

## The screens

**The mark in the bar.** Messages sit beside the bell on the platform and
beside the account in the portal, because a message is the same kind of thing
as a notification: something waiting, read where it is noticed. Pressing it
opens the whole inbox in a panel: Inbox, Sent, Drafts, and the way to write a
new one.

**The screen.** `/messages` and `/home/messages` are the same three pieces with
room: conversations down the left, the one being read beside them.

**The conversation itself** is a list of blocks, each with who wrote it, when,
and the words. That is the shape every mail client and support inbox settled
on, because it stays legible when a line runs to five sentences and it does not
lean on colour to say who is speaking. Two columns of coloured bubbles is a
phone chat, and this is a church writing to somebody about a hall booking.

## Addresses

A conversation is addressed by who it is with: `/messages/jane-smith`, or
`office` from the member's side. A row id never appears in a link.

## Keeping current

The panel asks the server what the inbox says every few seconds while it is
open, and on every return to the window, so a reply lands on the other side
without anybody reloading. Realtime is not in this version and a church of 50
to 500 does not need it.

## A group's own thread

R9.7. A group and a team each have one, named on the conversation rather than
copied into a roster. Who is in it is whoever is in the group at the moment
they open it, so a leader who adds somebody on Tuesday has added them to the
conversation too, and somebody who leaves stops seeing it.

A read mark is still per person, written the first time that person reads it,
so a group of thirty does not carry thirty rows nobody has used.

Its address is the group's own: `/messages/group/tuesday-night`.

A group's conversation belongs to the group rather than to the church, so it
is not in the office's inbox. Thirty groups talking among themselves is not a
church's post, and a church where the office reads every group's chatter is a
church whose groups stop using it. The office can still write to any group,
and from the line it writes the thread is in its inbox like any other.

Where the office writes into a group it is not in, it writes as the church.
Where it is in the group, it writes as itself: a leader who happens to be on
staff is in their own group as themselves.

## Marks against a message

R16.9. Six of them: yes, thank you, praying, that made me laugh,
congratulations, I am sorry. A group thread gets eleven lines of "thanks"
under every notice and they bury it; eleven marks against it say the same
thing and leave it readable.

One row a person a mark, so the same press puts it on and takes it off, and
nobody can stack one twice or remove somebody else's. The box has its own
short grid of emoji, written in at the caret.

## Answering one line

R16.9. A group thread of thirty lines is read out of order, and "yes, that
one" is not an answer anybody can follow. A message may name the one it
answers, carried in the line rather than pasted into the words, and pressing
the quote takes the reader to it.

The line a message answers is kept when that line is taken back, because the
answer is still somebody's: the quote goes blank and the answer stands.

## What this is not, in this build

No attachments, no read receipts beyond the unread mark, no typing indicator,
and no message to several people who are not already a group. Each of those is
a line on the board rather than a thing left out quietly.

## The emails ConnectApp sends itself

Separate from everything above, which is a church writing to its own people
through its own provider. These eight go out under our name, through our
Resend account, and are written in `packages/mail`:

| Message | Written in | Sent from |
|---|---|---|
| Confirm your email address | `supabase.ts` | the auth hook |
| Confirm your new email address | `supabase.ts` | the auth hook |
| Set a new password | `supabase.ts` | the auth hook |
| Sign in to ConnectApp | `supabase.ts` | the auth hook |
| ConnectApp team invitation | `supabase.ts` | the auth hook |
| Welcome | `messages.ts` | `create-church/actions.ts` |
| Church approved | `messages.ts` | the admin portal |
| Invitation to a church | `apps/web/lib/invite-mail.ts` | the invitation screens |

All eight are drawn from one shell in `packages/mail/src/brand.ts`, and
`packages/mail/tests/brand.test.ts` holds them to it: the shell, the voice
rules in [ux-writing.md](ux-writing.md), and the one that matters most, that
no link in any of them carries a Supabase host.

### The auth send hook

HRT-392. The five authentication messages would otherwise be Supabase's, both
the wording and the link. Supabase mints the token behind a confirmation link
and will not hand it to anything without the service role key, which never
enters a request path here. Its send hook is the way through: it posts the
token to `/api/auth/email` and sends nothing itself.

It is **project configuration, not code**, and it is on for both:

| Project | Endpoint |
|---|---|
| ConnectApp Dev | `https://dev.connectapp.church/api/auth/email` |
| ChurchMgt (production) | `https://connectapp.church/api/auth/email` |

Supabase dashboard, Authentication, Auth Hooks. The secret is
`AUTH_SEND_HOOK_SECRET` and the route refuses anything it has not signed, so
an unsigned call answers 401.

**Turning the hook off does not stop the emails, it changes who writes them.**
Supabase falls back to its own dashboard templates, whose `{{ .ConfirmationURL }}`
resolves to `<project>.supabase.co`. The markup in `supabase.ts` is written to
be pasted into those templates for exactly that case, but the link is Supabase's
and cannot be ours. A ConnectApp email whose button points at a supabase.co
address is the shape a phishing mail takes, so the hook being on is the thing
to check first if a link ever looks wrong.

**Working on a laptop.** The hook endpoint belongs to the Supabase project, not
to the machine that triggered the email, so an authentication email raised from
`localhost` is still sent by the development project and still links to
`dev.connectapp.church`. That is the development deployment behaving correctly
rather than a bug, and it means the link in such an email cannot be followed
back to a laptop.
