"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, HelpCircle, Send } from "lucide-react";
import {
  Avatar, Badge, Banner, Button, Combobox, IconButton, Card, CardTitle, Field, Input,
  Separator, Spinner,
  Dialog, DialogContent, DialogFooter,
  Sheet, SheetTrigger, SheetContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Thead, Tr, Th, Td,
} from "@connectapp/ui";
import { t, type MessageKey } from "@connectapp/i18n";
import { useFormError } from "@/lib/form-error";
import { usePanelGuard } from "@/components/panel-guard";
import { Confirm } from "@/components/confirm";
import { Said } from "@/components/said";
import { Searching } from "@/components/searching";
import {
  invite, invitees, withdraw, changeRole, removeAccess, sendAgain,
} from "./actions";
import { ResizableTable } from "@/components/resizable-columns";
import { StepUpDialog } from "@/components/step-up";
import type { StepUp } from "@/lib/step-up";

export interface ChurchRoleOption {
  id: string;
  /** The built-in's own name, such as "staff", or a slug for a custom role. */
  key: string;
  name: string;
  builtin: boolean;
  /** R1.6. Archived: still held by whoever holds it, never offered again. */
  archived: boolean;
  permissions: string[];
}

export interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  /** R1.6. The church's own role they hold, where they hold one. */
  roleId: string | null;
  roleName: string | null;
  isSelf: boolean;
  /** Already written the way this church reads a date, or null. */
  lastSignedIn: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

const roleName = (role: string) => t(`role.${role}` as never);

/** A built-in's name is ours to write; a church's own role carries its own. */
function titleOf(role?: ChurchRoleOption): string {
  if (!role) return "";
  return role.builtin ? roleName(role.key) : role.name;
}

/** The row standing for a built-in, for a member who is on one. */
function idFor(roles: ChurchRoleOption[], key: string): string {
  return roles.find((role) => role.builtin && role.key === key)?.id ?? "";
}


/**
 * HRT-370, HRT-372, R1.7, R16.4. The invitation is written down and nothing
 * was sent.
 *
 * It goes through ConnectApp's own account, so this is our end failing rather
 * than anything the church can configure. It still leaves an address invited
 * and nobody told, which somebody has to go and do something about rather than
 * a line that puts itself away, so it is said in the middle of the screen.
 */
function Unsent({
  email,
  said,
  onClose,
}: {
  email: string;
  said?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(on) => (on ? undefined : onClose())}>
      <DialogContent alert title={t("invite.unsent.title")}>
        <p className="text-[length:var(--d-text-body)] text-fg-muted">
          {said
            ? `${said} ${t("invite.unsent.recorded", { email })}`
            : t("invite.unsent.body", { email })}
        </p>
        <DialogFooter>
          <Button data-dismiss onClick={onClose}>
            {t("invite.unsent.later")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * R1.4, R1.7. Who can get in, and what they may do.
 *
 * An invitation is matched to a verified address when that person signs in, so
 * inviting somebody is not the same as giving them access: it is saying that
 * whoever proves this address may have it.
 */
export function Team({
  church,
  roles,
  members,
  invitations,
  approved,
  mine,
}: {
  church: string;
  /** R1.6. Every role this church has, built-in and its own. */
  roles: ChurchRoleOption[];
  members: Member[];
  invitations: Invitation[];
  /** R1.1. Whether a human has looked at this church yet. */
  approved: boolean;
  /**
   * R1.5, R1.6, R21.2. What the reader holds themselves.
   *
   * A role that can do more than they can is not theirs to hand out. Admin
   * runs the church and does not hold the money, so an Admin who could put
   * themselves on Finance would be reading the giving on the next page load.
   */
  mine: string[];
}) {
  const router = useRouter();
  const [message, setMessage] = React.useState<string>();
  const [changing, setChanging] = React.useState<{ member: Member; role: string } | null>(null);
  const [error, setError] = useFormError(changing);
  const [removing, setRemoving] = React.useState<Member | null>(null);
  /** HRT-370. An invitation sent again that nothing could take. */
  const [unsent, setUnsent] = React.useState<{ email: string; said?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  /** R1.4. Whether the person reading this holds the church's own keys. */
  const iAmOwner = members.some((one) => one.isSelf && one.role === "owner");

  /*
   * R1.7. An invitation is taken up somewhere else.
   *
   * Whoever was invited accepts in their own browser, or on their phone, and
   * this screen has no way of hearing about it: it was drawn when it was
   * opened and the row sat under Invited until somebody reloaded. The church
   * sends an invitation, watches for it to land, and the screen it is watching
   * is the one that cannot tell them.
   *
   * So it reads again when the tab comes back, which is exactly when somebody
   * has gone to look. Only while an invitation is outstanding, and at most
   * once every ten seconds, so alt-tabbing is not a way to make the server
   * work.
   */
  const outstanding = invitations.length > 0;
  React.useEffect(() => {
    if (!outstanding) return;
    let last = Date.now();
    const look = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 10_000) return;
      last = Date.now();
      router.refresh();
    };
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", look);
    return () => {
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", look);
    };
  }, [outstanding, router]);

  /** R1.6. Whether every permission this role holds is one the reader holds. */
  const reachable = (role: ChurchRoleOption) =>
    role.permissions.every((permission) => mine.includes(permission));

  /*
   * Which row's action is running. Both of these are confirmed in a dialog
   * that closes before the write lands, so the row's own control carries it.
   */
  const [doing, setDoing] = React.useState<string>();

  React.useEffect(() => {
    if (!pending) setDoing(undefined);
  }, [pending]);

  /*
   * R1.8, R21.4. Changing a role is changing what somebody can read, so it
   * asks for the code again and the same press is repeated once it has one.
   */
  const [need, setNeed] = React.useState<StepUp | null>(null);
  const again = React.useRef<(() => void) | null>(null);

  const run = (
    key: string,
    work: () => Promise<{ error?: string; unsent?: boolean; said?: string; stepUp?: StepUp }>,
    said?: string,
    /** HRT-370. Whose invitation this was, for the notice when it does not go. */
    email?: string,
  ) => {
    setDoing(key);
    startTransition(async () => {
      const result = await work();
      if (result.stepUp) {
        again.current = () => run(key, work, said, email);
        setNeed(result.stepUp);
        return;
      }
      setError(result.error);
      if (result.unsent && email) setUnsent({ email, said: result.said });
      setMessage(result.error || result.unsent ? undefined : said);
      if (!result.error) router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6" aria-busy={pending}>
      <StepUpDialog
        need={need}
        onDone={() => {
          setNeed(null);
          const waiting = again.current;
          again.current = null;
          waiting?.();
        }}
        onCancel={() => {
          setNeed(null);
          again.current = null;
        }}
      />

      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Said message={message} onClose={() => setMessage(undefined)} />

      {unsent ? (
        <Unsent email={unsent.email} said={unsent.said} onClose={() => setUnsent(null)} />
      ) : null}

      {/* R1.4. Both of these change what somebody may do, and neither is
          obvious from the row afterwards, so both are asked and both answer. */}
      <Dialog open={changing !== null} onOpenChange={(on) => setChanging(on ? changing : null)}>
        <DialogContent
          alert
          title={
            changing
              ? t("team.roleTitle", {
                  name: changing.member.name ?? changing.member.email,
                  role: titleOf(roles.find((r) => r.id === changing.role)),
                })
              : ""
          }
        >
          <DialogFooter>
            <Button variant="ghost" data-dismiss onClick={() => setChanging(null)}>
              {t("team.roleKeep")}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                const next = changing;
                setChanging(null);
                if (next) {
                  run(
                    `role:${next.member.userId}`,
                    () => {
                      const picked = roles.find((r) => r.id === next.role);
                      return picked?.builtin
                        ? changeRole(next.member.userId, picked.key as never, church, null)
                        : changeRole(next.member.userId, "member" as never, church, next.role);
                    },
                    t("team.roleChanged"),
                  );
                }
              }}
            >
              {t("action.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(on) => setRemoving(on ? removing : null)}>
        <DialogContent
          alert
          title={
            removing
              ? t("team.removeTitle", { name: removing.name ?? removing.email })
              : ""
          }
        >
          <DialogFooter>
            <Button variant="ghost" data-dismiss onClick={() => setRemoving(null)}>
              {t("team.removeKeep")}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                const who = removing;
                setRemoving(null);
                if (who) {
                  run(
                    `remove:${who.userId}`,
                    () => removeAccess(who.userId),
                    t("team.removed", { name: (who.name ?? who.email).split(" ")[0]! }),
                  );
                }
              }}
            >
              {t("team.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* R1.1. A church nobody has looked at yet cannot reach outside itself,
          so it is told why rather than left with a press that is refused. The
          press itself is at the top of Settings, where every screen puts the
          thing it is for. */}
      {approved ? null : (
        <Banner tone="info" title={t("team.waiting")}>{t("team.waitingBody")}</Banner>
      )}

      {/* R1.4. A row per person: who they are, what they may do, and when they
          were last here. The three a church checks when somebody leaves. */}
      <ResizableTable id="access" className="rounded-[14px] border border-line bg-surface">
        <table className="w-full border-collapse text-left">
          {/* R24.6. The shared heading and cell, so a row is the height the
              density says and not the height this screen once chose. */}
          <Thead>
            <Tr className="border-t-0">
              <Th className="px-5">{t("team.person")}</Th>
              <Th className="w-66 px-5">
                <span className="flex items-center gap-1">
                  {t("team.roleColumn")}
                  <RoleGuide roles={roles} />
                </span>
              </Th>
              <Th className="w-44 px-5">{t("team.lastSignedIn")}</Th>
              <Th className="w-12 px-2" />
            </Tr>
          </Thead>

          <tbody>
            {members.map((member) => (
              <Tr key={member.userId}>
                <Td className="px-5 py-3">
                  <span className="flex items-center gap-3">
                    <Avatar
                      name={member.name ?? member.email}
                      id={member.userId}
                      className="size-8 shrink-0 text-[12px] font-semibold"
                    />
                    <span className="flex min-w-0 flex-col leading-[18px]">
                      <span className="truncate font-medium text-fg">
                        {member.name ?? member.email}
                      </span>
                      {member.name ? (
                        <span className="truncate text-[12px] text-fg-subtle">{member.email}</span>
                      ) : null}
                    </span>
                  </span>
                </Td>

                <Td className="px-5 py-3">
                  {/* R1.4. An owner's row is only an owner's to change. There
                      is nobody above them to undo it. */}
                  {member.isSelf || (member.role === "owner" && !iAmOwner) ? (
                    <Badge tone="neutral">{member.roleName ?? roleName(member.role)}</Badge>
                  ) : (
                    /* R1.4. Promoting somebody to owner, or demoting the person
                       who set the church up, was one stray click on a dropdown.
                       It is asked for now. */
                    <Select
                      value={member.roleId ?? idFor(roles, member.role)}
                      onValueChange={(role) => setChanging({ member, role })}
                    >
                      <SelectTrigger aria-label={t("team.role")} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* The church's live roles, and the one this member is
                            on where the church has since archive it. */}
                        {roles
                          .filter(
                            (role) =>
                              (reachable(role) || role.id === (member.roleId ?? idFor(roles, member.role)))
                              && (!role.archived
                                || role.id === (member.roleId ?? idFor(roles, member.role))),
                          )
                          .map((role) => (
                            <SelectItem key={role.id} value={role.id}>{titleOf(role)}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </Td>

                <Td className="px-5 py-3 text-[length:var(--d-text-body)] text-fg-muted">
                  {member.lastSignedIn ?? t("team.neverSignedIn")}
                </Td>

                <Td className="px-2 py-3">
                  {member.isSelf || member.role === "owner" ? null : (
                    <IconButton
                      label={t("team.remove")}
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setRemoving(member)}
                    >
                      {doing === `remove:${member.userId}` ? (
                        <Spinner label={t("team.remove")} />
                      ) : (
                        <X />
                      )}
                    </IconButton>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </ResizableTable>

      {invitations.length > 0 ? (
        <Card>
          <CardTitle>{t("team.invited")}</CardTitle>
          <Separator className="my-4" />
          <ul className="flex flex-col">
            {invitations.map((invitation, i) => (
              <li key={invitation.id}>
                {i > 0 ? <Separator className="my-3" /> : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[length:var(--d-text-body)] text-fg">
                    {invitation.email}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{roleName(invitation.role)}</Badge>
                    <span className="text-caption text-fg-muted">
                      {t("team.until", { day: invitation.expiresAt })}
                    </span>
                    {/* HRT-370. The one that never arrived, sent again. */}
                    <IconButton
                      label={t("team.sendAgain")}
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          `again:${invitation.id}`,
                          () => sendAgain(invitation.id),
                          t("team.sentAgain", { email: invitation.email }),
                          invitation.email,
                        )
                      }
                    >
                      {doing === `again:${invitation.id}` ? (
                        <Spinner label={t("team.sendAgain")} />
                      ) : (
                        <Send />
                      )}
                    </IconButton>

                    {/* R24.x. Withdrawing an invitation takes away the only
                        way that address has in, so it asks first. */}
                    <Confirm
                      title={t("team.withdrawTitle", { email: invitation.email })}
                      body={t("team.withdrawBody")}
                      confirmLabel={t("team.withdraw")}
                      disabled={pending}
                      onConfirm={() =>
                        run(`withdraw:${invitation.id}`, () =>
                          withdraw(invitation.id),
                        )
                      }
                      trigger={
                        <IconButton
                          label={t("team.withdraw")}
                          variant="ghost"
                          disabled={pending}
                        >
                          {doing === `withdraw:${invitation.id}` ? (
                            <Spinner label={t("team.withdraw")} />
                          ) : (
                            <X />
                          )}
                        </IconButton>
                      }
                    />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * R1.4, R1.6. What each role can see.
 *
 * The dropdown offers a column of words and no way to tell them apart, which
 * leaves an administrator guessing what they are handing somebody. The question
 * mark on the Role column opens this: the roles down a single line, each
 * listing what it actually reaches.
 *
 * Read from the permissions each role holds rather than from a sentence written
 * beside it, so a role this church wrote describes itself, and a built-in whose
 * permissions a church has changed describes what it now does.
 *
 * A hue per role, from the same twelve the rest of the product assigns, so a
 * role reads the same here as it does anywhere a role is shown.
 */
const ROLE_HUES: Record<string, string> = {
  owner: "violet",
  admin: "indigo",
  staff: "sky",
  pastoral: "teal",
  finance: "fern",
  group_leader: "citron",
  team_leader: "amber",
  checkin_volunteer: "coral",
  member: "clay",
};

/** The hue for a role this church wrote, picked from its name so it is stable. */
function hueOf(role: ChurchRoleOption): string {
  if (ROLE_HUES[role.key]) return ROLE_HUES[role.key]!;
  const hues = Object.values(ROLE_HUES);
  let sum = 0;
  for (const ch of role.key) sum += ch.charCodeAt(0);
  return hues[sum % hues.length]!;
}

/**
 * R1.6. The areas a permission belongs to, in the order a summary reads them.
 *
 * A role is summarised by what it touches rather than by its eighteen
 * permissions listed out, because a wall of names is a wall nobody reads and
 * the question being asked is "what does this role get into".
 */
const AREAS: Array<[MessageKey, string[]]> = [
  ["area.people", ["members.edit", "members.archive"]],
  ["area.notes", ["members.notes.confidential"]],
  ["area.giving", ["giving.amounts"]],
  ["area.settings", ["church.manage", "church.fields", "church.tags"]],
  ["area.checkin", ["checkin.rooms", "checkin.stations", "checkin.run", "checkin.supervise"]],
  ["area.safeguarding", ["checkin.incidents", "checkin.checks"]],
  ["area.followups", ["followups.manage"]],
  ["area.groups", ["groups.manage"]],
  ["area.services", ["services.manage"]],
  ["area.teams", ["teams.manage", "teams.lead"]],
];

/** What this role reaches, in one line, from the permissions it holds. */
function summarise(role: ChurchRoleOption, everything: number): string {
  if (role.permissions.length === 0) return t("roles.nothing");
  if (role.permissions.length === everything) return t("roles.everything");

  const held = AREAS.filter(([, permissions]) =>
    permissions.some((one) => role.permissions.includes(one)),
  ).map(([key]) => t(key));

  if (held.length === 0) return t("roles.nothing");
  if (held.length === 1) return `${sentence(held[0]!)}.`;

  const last = held.pop()!;
  return `${sentence(t("roles.and", { list: held.join(", "), last }))}.`;
}

/** The summary opens a line, so it opens with a capital. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function RoleGuide({ roles }: { roles: ChurchRoleOption[] }) {
  // The widest set any role holds is the whole catalogue, which the Owner has.
  const everything = Math.max(...roles.map((role) => role.permissions.length), 0);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <IconButton
          label={t("roles.title")}
          variant="ghost"
          className="size-6 min-h-0 [&_svg]:size-4"
        >
          <HelpCircle />
        </IconButton>
      </SheetTrigger>

      <SheetContent title={t("roles.title")} closeLabel={t("common.close")}>
        {/* The line runs behind the dots, so the roles read as one ladder from
            the whole church down to one person's own record. */}
        <ol className="relative flex flex-col gap-5 pl-6">
          <span
            aria-hidden
            className="absolute top-2 bottom-2 left-[5px] w-px bg-line-strong"
          />

          {roles.map((role) => (
            <li key={role.id} className="relative">
              <span
                aria-hidden
                className="absolute top-1.5 -left-6 size-[11px] rounded-full border-2 border-canvas"
                style={{ background: `var(--hue-${hueOf(role)}-500)` }}
              />
              <span className="block font-semibold text-fg">{titleOf(role)}</span>
              <span className="block text-[13px] leading-[18px] text-fg-muted">
                {summarise(role, everything)}
              </span>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  );
}

export function InvitePerson({
  church,
  roles,
  mine,
  pending,
  onDone,
}: {
  church: string;
  /** R1.6. Every role this church has, taken up or still on the shelf. */
  roles: ChurchRoleOption[];
  /** R1.5, R1.6. What the reader holds, which is the most they can hand out. */
  mine: string[];
  pending: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  /** HRT-370. The invitation that was written down and did not go. */
  const [unsent, setUnsent] = React.useState<{ email: string; said?: string } | null>(null);
  /*
   * R1.4, R1.6. What this reader may give.
   *
   * Two rules and no third. A role is giveable when every permission it holds
   * is one the reader holds, so an Admin cannot hand out Finance, and an Owner
   * can hand out anything, Owner included: a church with two pastors should be
   * able to say so without handing the church over. And it has to be a role
   * this church actually runs, which means live.
   *
   * Eight of the nine built-ins are written down archived, because the roles
   * screen is the shelf they are taken up from. Offering them here handed out
   * a role the church had never looked at and could not find on its own
   * screen, so the guide sends a new church to take one up first.
   */
  const giveable = roles.filter(
    (one) =>
      one.permissions.every((permission) => mine.includes(permission))
      && !one.archived,
  );
  const [role, setRole] = React.useState(giveable[0]?.id ?? "");
  const [failed, setFailed] = React.useState<string>();
  const [saving, startTransition] = React.useTransition();
  /* R1.8, R21.4. An invitation hands out a role, so the code is asked for in
     front of it. The form stays open behind the box. */
  const [needCode, setNeedCode] = React.useState<StepUp | null>(null);

  /*
   * R1.7. Most members a church gives an account to are already in People, with
   * an address the church typed once. Picking them fills the box and ties the
   * account to their record, so a volunteer becomes somebody a follow-up can
   * land on without anybody retyping an address.
   */
  const [person, setPerson] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<{ id: string; name: string; email: string }[]>([]);
  const [searching, setSearching] = React.useState(false);
  // An answer that arrives after a newer one was asked for is dropped.
  const ticket = React.useRef(0);
  const [email, setEmail] = React.useState("");

  const look = React.useCallback(
    (search: string) => {
      setQuery(search);
      if (!search.trim()) {
        ticket.current++;
        setSearching(false);
        setFound([]);
        return;
      }
      const mine = ++ticket.current;
      setSearching(true);
      void invitees(search).then((people) => {
        if (mine !== ticket.current) return;
        setSearching(false);
        setFound(people);
      });
    },
    [church],
  );

  const formId = React.useId();
  const [dirty, setDirty] = React.useState(false);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPerson("");
      setEmail("");
      setQuery("");
      setFound([]);
      setRole(giveable[0]?.id ?? "");
      setFailed(undefined);
      setDirty(false);
    }
  };
  const { onOpenChange, guard } = usePanelGuard({ dirty, setOpen: close });

  return (
    <>
      <StepUpDialog
        need={needCode}
        onDone={() => {
          setNeedCode(null);
          /* The form is still filled in, so the one thing left is the press.
             Submitted here rather than asking for it again. */
          (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
        }}
        onCancel={() => setNeedCode(null)}
      />

      {unsent ? (
        <Unsent email={unsent.email} said={unsent.said} onClose={() => setUnsent(null)} />
      ) : null}

    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button data-guide="invite-person"><Plus /> {t("team.invite")}</Button>
      </SheetTrigger>
      <SheetContent
        title={t("team.invite")}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button
              data-guide="invite-send"
              type="submit"
              form={formId}
              loading={saving}
              disabled={pending || saving || !dirty || !role || !email.trim()}
            >
              {t("team.send")}
            </Button>
          </>
        }
      >
        {guard}

        <form
          id={formId}
          noValidate
          onInput={() => setDirty(true)}
          action={(data) => {
            data.set("role", role);
            startTransition(async () => {
              const result = await invite(data);
              if (result.stepUp) {
                /* R1.8, R21.4. The form keeps what was typed, so the code box
                   opens over it and the press is repeated. */
                setNeedCode(result.stepUp);
                return;
              }
              setFailed(result.error);
              if (!result.error) {
                /* HRT-370. The row is written either way, so the panel closes
                   and the notice says what did not happen. */
                if (result.unsent) setUnsent({ email, said: result.said });
                close(false);
                onDone();
              }
            });
          }}
          className="flex flex-col gap-4"
        >
          {/* Inside the box. A banner at the top of the page is behind the
              dialog that is still open, which is nothing at all. */}
          {failed ? <Banner tone="danger">{failed}</Banner> : null}

          <input type="hidden" name="memberId" value={person} />

          <Field label={t("team.fromPeople")}>
            <Searching on={searching}>
              <Combobox
                options={found.map((one) => ({
                  value: one.id,
                  label: one.name,
                  keywords: one.email,
                }))}
                value={person}
                onChange={(id) => {
                  setPerson(id);
                  setEmail(found.find((one) => one.id === id)?.email ?? "");
                }}
                onQueryChange={look}
                placeholder={t("team.findPerson")}
                emptyLabel={query.trim() ? t("team.noPerson") : t("team.typeName")}
                clearLabel={t("date.clear")}
                aria-label={t("team.fromPeople")}
              />
            </Searching>
          </Field>

          <Field label={t("team.email")} required>
            <Input
              name="email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // An address typed by hand is no longer the picked person's.
                setPerson("");
              }}
            />
          </Field>

          {/* R24.6. The form refuses a blank, so the asterisk says so. */}
          <Field label={t("team.role")} required>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {giveable.map((one) => (
                  <SelectItem key={one.id} value={one.id}>{titleOf(one)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

        </form>
      </SheetContent>
    </Sheet>
    </>
  );
}
