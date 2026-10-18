"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MailPlus, UserMinus, X } from "lucide-react";
import {
  Badge, Banner, Button, Dialog, DialogContent, DialogFooter, DialogTrigger,
  Field, IconButton, Input,
} from "@connectapp/ui";
import { inviteTeamMember, revokeAdmin, withdrawInvite } from "@/app/actions";
import { useStepUp } from "@/app/step-up";

export interface WaitingRow {
  id: string;
  email: string;
  name: string;
  invitedBy: string;
  expires: React.ReactNode;
}

export interface TeamMemberRow {
  userId: string;
  name: string;
  email: string;
  grantedBy: string | null;
  granted: React.ReactNode;
  revoked: boolean;
}

/** R21.x, HRT-401. The team, the asks nobody has answered, and what changes them. */
export function TeamMembers({
  me, rows, waiting,
}: {
  me: string;
  rows: TeamMemberRow[];
  waiting: WaitingRow[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const [open, setOpen] = React.useState(false);
  /* The row whose access is about to go, which is what the confirmation is
     asking about. One box driven by state rather than one per row. */
  const [losing, setLosing] = React.useState<TeamMemberRow>();
  const [dropping, setDropping] = React.useState<WaitingRow>();
  const [pending, startTransition] = React.useTransition();

  /* HRT-442, R1.8, R21.4. Handing somebody the portal, and taking it away,
     each ask for the code again before they run. */
  const { go: askOn, dialog: askBox } = useStepUp(inviteTeamMember);
  const { go: revokeOn, dialog: revokeBox } = useStepUp(revokeAdmin);

  const live = rows.filter((one) => !one.revoked);
  const gone = rows.filter((one) => one.revoked);

  return (
    <div className="flex flex-col gap-5" aria-busy={pending}>
      {askBox}
      {revokeBox}

      {error ? <Banner tone="danger" title="That didn't work">{error}</Banner> : null}

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><MailPlus /> Invite a team member</Button>
          </DialogTrigger>
          <DialogContent title="Invite a team member" closeLabel="Close">
            <form
              noValidate
              className="flex flex-col gap-4"
              action={(data) => {
                startTransition(async () => {
                  const result = await askOn(data);
                  /* Null means the code box was closed, so nothing happened
                     and the form keeps what was typed into it. */
                  if (!result) return;
                  setError(result.error);
                  if (!result.error) setOpen(false);
                  /* Refreshed either way. A refusal is often the list being
                     out of date rather than the press being wrong, and a
                     screen that argues with a server it has not re-read is
                     the most confusing thing it can do. */
                  router.refresh();
                });
              }}
            >
              <Field label="Email address" required>
                <Input name="email" type="email" autoComplete="off" autoFocus />
              </Field>
              <Field label="Name" required>
                <Input name="name" autoComplete="off" />
              </Field>
              <p className="text-[13px] text-fg-muted">
                They get one email. Opening it signs them in and puts them on the team.
              </p>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>Send the invitation</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
        {live.map((one) => (
          <li key={one.userId} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
              <span className="font-semibold text-fg">{one.name}</span>
              <span className="text-[12px] text-fg-subtle">{one.email}</span>
            </span>
            <span className="text-[13px] text-fg-muted">
              since {one.granted}
              {one.grantedBy ? `, by ${one.grantedBy}` : ""}
            </span>
            {one.userId === me ? (
              <Badge tone="neutral">You</Badge>
            ) : (
              <IconButton
                label={`Revoke ${one.name}'s access`}
                variant="ghost"
                disabled={pending}
                onClick={() => setLosing(one)}
              >
                <UserMinus />
              </IconButton>
            )}
          </li>
        ))}
      </ul>

      {/* Reaching every church is the most access this product hands out, so
          revoking it is asked about rather than done on one press. */}
      <Dialog open={losing !== undefined} onOpenChange={(to) => { if (!to) setLosing(undefined); }}>
        <DialogContent alert title={`Revoke ${losing?.name ?? ""}'s access?`}>
          <p className="text-[length:var(--d-text-body)] text-fg-muted">
            Their ConnectApp account is kept. They lose access to every church on the platform.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setLosing(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                const who = losing;
                if (!who) return;
                startTransition(async () => {
                  const result = await revokeOn(who.userId);
                  if (!result) return;
                  setError(result.error);
                  setLosing(undefined);
                  router.refresh();
                });
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {waiting.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-label text-fg-muted">Invited, waiting</h2>
          <ul className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-[16px] border border-dashed border-line bg-surface p-0">
            {waiting.map((one) => (
              <li key={one.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                  <span className="font-semibold text-fg">{one.name}</span>
                  <span className="text-[12px] text-fg-subtle">{one.email}</span>
                </span>
                <span className="text-[13px] text-fg-muted">
                  by {one.invitedBy}, until {one.expires}
                </span>
                <IconButton
                  label={`Withdraw the invitation to ${one.name}`}
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setDropping(one)}
                >
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* An invitation is a live way into every church on the platform, so
          withdrawing one is asked about the same way revoking is. */}
      <Dialog
        open={dropping !== undefined}
        onOpenChange={(to) => { if (!to) setDropping(undefined); }}
      >
        <DialogContent alert title={`Withdraw the invitation to ${dropping?.name ?? ""}?`}>
          <p className="text-[length:var(--d-text-body)] text-fg-muted">
            The link already sent to {dropping?.email} stops working.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDropping(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                const one = dropping;
                if (!one) return;
                startTransition(async () => {
                  const result = await withdrawInvite(one.id);
                  setError(result.error);
                  setDropping(undefined);
                  router.refresh();
                });
              }}
            >
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {gone.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-label text-fg-muted">No longer on the team</h2>
          {gone.map((one) => (
            <span key={one.userId} className="text-[length:var(--d-text-body)] text-fg-muted">
              {one.name} · {one.email}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
