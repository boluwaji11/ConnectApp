import { t } from "@connectapp/i18n";
import { can, rolesWith, type TenantRole, type Who, type Permission } from "./permissions";

export {
  TENANT_ROLES, PERMISSIONS, PERMISSION_GROUPS, ROLE_PERMISSIONS, can, rolesWith,
  type TenantRole, type Permission, type PermissionGroup, type Who,
} from "./permissions";

/**
 * R1.5 and R21.2. Field-level permissions, enforced here at the query layer
 * rather than in a template. If data is hidden only by the view, it is not
 * hidden, so every repository assumes its consumer is the API.
 */
export const CAN_READ_CONFIDENTIAL_NOTES: readonly TenantRole[] = rolesWith("members.notes.confidential");

/** Giving amounts arrive in 0.3. The rule is recorded now so it is not forgotten. */
export const CAN_READ_GIVING_AMOUNTS: readonly TenantRole[] = rolesWith("giving.amounts");

export const canReadConfidentialNotes = (role: Who): boolean =>
  can(role, "members.notes.confidential");

export const canReadGivingAmounts = (role: Who): boolean =>
  can(role, "giving.amounts");

/** R13.1, R13.9, R13.10. Who runs the giving: the funds, the batches, Stripe. */
export const CAN_MANAGE_GIVING: readonly TenantRole[] = rolesWith("giving.manage");

export const canManageGiving = (role: Who): boolean => can(role, "giving.manage");

/**
 * R2.x writes. Who may change a person's record.
 *
 * Staff can edit, because a church with two paid staff cannot route every
 * correction through the Owner. Archiving is narrower: it removes someone from
 * every list at once, so it stays with Owner and Admin.
 */
export const CAN_EDIT_PEOPLE: readonly TenantRole[] = rolesWith("members.edit");
export const CAN_ARCHIVE_PEOPLE: readonly TenantRole[] = rolesWith("members.archive");

/** R2.1. Who may name, merge and archived a household. */
export const CAN_MANAGE_HOUSEHOLDS: readonly TenantRole[] = rolesWith("members.households");

export const canEditPeople = (role: Who): boolean => can(role, "members.edit");

/**
 * R2.7, R6.2. Who may write a note about somebody.
 *
 * Two different errands reach the same box. Staff who keep the record write
 * down what happened; pastoral care writes down a visit. Pastoral holds
 * `members.notes.confidential` and not `members.edit`, so gating the note on
 * editing people took the note away from the role whose work it mostly is.
 *
 * Which tier a note may be written at is still decided separately: a general
 * note from either, a confidential one only from whoever can read one back.
 */
export const canWriteNotes = (role: Who): boolean =>
  can(role, "members.edit") || can(role, "members.notes.confidential");
/** R16.9. Whoever answers what members write to the church. */
export const canAnswerMessages = (role: Who): boolean => can(role, "messages.office");
export const canArchivePeople = (role: Who): boolean => can(role, "members.archive");
export const canManageHouseholds = (role: Who): boolean => can(role, "members.households");

/**
 * Thrown when a role is not permitted to perform a write.
 *
 * Writes are refused in the repository, not in the page, for the same reason
 * reads are filtered there: a check that lives in a template is a check that the
 * next caller forgets. A page hiding the edit button is courtesy. This is the
 * control.
 */
export class PermissionError extends Error {
  readonly role: TenantRole;
  /** The catalogue key naming the refused action, such as "archivePerson". */
  readonly action: PermissionAction;
  constructor(role: TenantRole, action: PermissionAction) {
    super(t("error.permission", { role, action: t(`error.permission.${action}`) }));
    this.name = "PermissionError";
    this.role = role;
    this.action = action;
  }
}

/** Every action a role can be refused. Adding one without a message will not compile. */
export type PermissionAction =
  | "addPerson" | "editPerson" | "archivePerson" | "restorePerson"
  | "createTag" | "renameTag" | "recolourTag" | "deleteTag" | "mergeTags" | "tagPerson"
  | "addField" | "editField" | "deleteField" | "setFieldValue"
  | "rollbackImport" | "exportEverything" | "mergePeople"
  | "editRelationship" | "liftDoNotContact"
  | "addMilestone" | "removeMilestone"
  | "editChurch" | "manageDemoData" | "manageServices" | "recordAttendance"
  | "manageRooms" | "manageStations" | "checkIn"
  | "fileIncident" | "readIncidents" | "manageGroups" | "recordGroupAttendance"
  | "manageEvents"
  | "manageFollowUps" | "editPipelines" | "seeChecks" | "editDirectoryPrivacy"
  | "manageTeams" | "manageTeamRoster" | "schedule" | "managePlans"
  | "manageForms" | "editRoles" | "manageHouseholds" | "buildReports"
  | "manageGiving" | "recordGift" | "readGivingAmounts" | "manageWebsite"
  | "readPeople" | "readReports";

/**
 * HRT-438, R1.8, R21.4. The permissions that make a second factor mandatory.
 *
 * "Anyone who can see member information." A plain member holds none of
 * these: their role is empty and every screen that reads the directory, the
 * children's records, the giving or the church's settings refuses them. So
 * the rule catches the people whose account is worth stealing and leaves a
 * volunteer on a phone alone.
 *
 * Children's check-in is in the list because a station shows allergies,
 * pickup lists and the codes that release a child. Giving is in it because
 * the amounts name the giver. `church.manage` is in it because somebody who
 * can change roles can grant themselves the rest.
 */
export const TWO_STEP_PERMISSIONS: readonly Permission[] = [
  "members.edit",
  "members.archive",
  "members.households",
  "members.notes.confidential",
  "checkin.run",
  "checkin.supervise",
  "checkin.incidents",
  "checkin.checks",
  "giving.amounts",
  "giving.manage",
  "church.manage",
  /*
   * A group or team leader reads the roster of the group they lead and its
   * attendance history, which is member information even though it is a
   * narrower slice of it than the staff directory. Included because the rule
   * was asked for with no exception, and because the cost of being wrong the
   * other way is somebody's records.
   *
   * It is the line most worth arguing about: these are volunteers, and the
   * product is built not to lose volunteers to friction. Taking them out is
   * deleting two lines.
   */
  "groups.lead",
  "teams.lead",
];

/**
 * HRT-438. Whether this membership has to have a second factor.
 *
 * Asked of the permissions rather than of the nine built-in names, because a
 * church writes its own roles and one of them holding `members.edit` is as
 * much reach as Admin.
 */
export const needsTwoStep = (role: Who): boolean =>
  TWO_STEP_PERMISSIONS.some((one) => can(role, one));
