export * as schema from "./schema/index";
export type { WebsiteSection, WebsiteSectionType } from "./schema/tenancy";
export {
  owner, appDb, withTenant, closeConnections, sql, setTenantObserver,
  type Db, type Tx, type TenantContext, type TenantObserver,
} from "./client";
export {
  TENANT_ROLES, type TenantRole, PERMISSIONS, PERMISSION_GROUPS, ROLE_PERMISSIONS,
  type Permission, type PermissionGroup, type Who,
  can, rolesWith, canReadConfidentialNotes, canReadGivingAmounts, canManageGiving,
  canManageHouseholds, CAN_MANAGE_HOUSEHOLDS,
  CAN_READ_CONFIDENTIAL_NOTES, CAN_READ_GIVING_AMOUNTS,
  canEditPeople, canArchivePeople, canAnswerMessages, canWriteNotes,
  CAN_EDIT_PEOPLE, CAN_ARCHIVE_PEOPLE, PermissionError,
  needsTwoStep, TWO_STEP_PERMISSIONS,
  type PermissionAction,
} from "./roles";
export {
  listRoles, createRole, renameRole, setPermissions, archiveRole, countArchivedRoles,
  permissionsFor, ensureBuiltIns, withinReach, type ChurchRole,
} from "./repo/tenant-roles";
export {
  listHouseholdRows, countArchivedHouseholds,
  createHousehold, renameHousehold, setHouseholdArchived, mergeHouseholds,
  peopleWithoutHousehold, addToHousehold, removeFromHousehold, setHouseholdRole,
  householdAddress, setHouseholdAddress, addressesOfMembers, postalRows,
  type HouseholdRow, type HouseholdAddress, type PostalRow,
} from "./repo/households";
export {
  feedFor, listAnnouncements, countArchivedAnnouncements, getAnnouncement,
  writeAnnouncement, updateAnnouncement, setAnnouncementArchived, dismissAnnouncement,
  type Announcement, type AnnouncementInput,
} from "./repo/announcements";
export { InvalidInputError, NameTakenError } from "./errors";
export { encryptNote, decryptNote } from "./crypto";
export {
  listPeople, getPerson, countPeopleByStatus, listTags, listTagsForPerson,
  resolveTenantBySlug, listChurches, type PersonRow,
  createPerson, updatePerson, setPersonArchived, getPersonForEdit, listHouseholds,
  type HouseholdOption,
  bulkSetArchived, bulkSetStatus, countPeople, countArchivedPeople, householdFor, addressFor, addressesFor, PER_PAGE,
  peopleToInvite, updateOwnProfile, setOwnPhoto, setAnniversary, anniversaryOf, addressPartsFor,
  type AddressInput,
  type DirectoryQuery, type HouseholdCard,
  LIFECYCLE_STATUSES, HOUSEHOLD_ROLES,
  type LifecycleStatus, type HouseholdRole, type PersonInput, type PersonEditValues, type WriteActor,
} from "./repo/members";
export * from "./repo/reports";
export * from "./repo/report-spec";
export * from "./repo/report-compiler";
export * from "./repo/mailers";
export * from "./repo/messages";
export * from "./repo/saved-reports";
export * from "./repo/accounts";
export {
  listContacts, addContact, removeContact, makeContactPrimary, leadWith, listAddresses,
  addAddress, removeAddress, makeAddressPrimary,
  CONTACT_LABELS,
  type PersonContact, type PersonAddress, type ContactKind, type ContactLabel,
} from "./repo/contacts";
export {
  listTagsWithCounts, createTag, renameTag, setTagHue, deleteTag, mergeTags, setPersonTag,
  canManageTags, CAN_MANAGE_TAGS, normaliseTagName, TAG_HUES, bulkSetPersonTag,
  type TagRow, type TagHue,
} from "./repo/tags";
export {
  listCustomFields, createCustomField, updateCustomField, deleteCustomField,
  getCustomValues, setCustomValues, setOwnCustomValues, coerceCustomValue,
  canManageCustomFields, keyFor,
  CAN_MANAGE_CUSTOM_FIELDS, CUSTOM_FIELD_TYPES, CUSTOM_FIELD_ENTITIES,
  type CustomFieldDef, type CustomFieldType, type CustomFieldEntity, type CustomValue,
} from "./repo/custom-fields";
export {
  mergePeople, mergeCluster, undoMerge, listMerges, countMerges,
  findDuplicatePairs, findDuplicateClusters, pairsFrom, MERGE_UNDO_WINDOW_DAYS,
  type MergePlan, type MergeResult, type MergeSummary,
  type DuplicatePair, type DuplicateCluster,
} from "./repo/merge";
export * from "./repo/relationships";
export * from "./repo/milestones";
export * from "./repo/church";
export * from "./repo/label-layout";
export * from "./repo/campuses";
export * from "./repo/provisional";
export * from "./repo/public-groups";
export * from "./repo/website";
// HRT-377. The website as a document, with a draft and a live copy.
export * from "./repo/site-doc";
export * from "./repo/site-sections";
export * from "./repo/site-palettes";
export * from "./repo/church-site";
export * from "./repo/site-data";
export * from "./repo/public-forms";
export * from "./repo/form-matching";
export * from "./repo/public-events";
export * from "./repo/forms";
export * from "./repo/form-templates";
export * from "./repo/events";
export * from "./repo/services";
export * from "./repo/attendance";
export * from "./repo/rooms";
export * from "./repo/stations";
export * from "./repo/lookup";
export * from "./repo/checkin";
export * from "./repo/offline";
export * from "./repo/roster";
export * from "./repo/supervisor";
export * from "./repo/incidents";
export * from "./repo/checkin-mine";
export * from "./repo/domains";
export * from "./repo/push";
export * from "./repo/push-send";
export * from "./repo/groups";
export * from "./repo/followups";
export * from "./repo/checks";
export * from "./repo/celebrations";
export * from "./repo/serving";
export * from "./repo/schedule";
export * from "./repo/respond";
export * from "./repo/plans";
export * from "./repo/item-kinds";
export * from "./repo/gift-status";
export * from "./repo/funds";
export * from "./repo/giving";
export * from "./repo/email-sends";
export * from "./repo/email-queue";
export * from "./repo/email-templates";
export * from "./repo/providers";
export * from "./repo/stripe-accounts";
export * from "./repo/public-giving";
export * from "./repo/statements";
export * from "./repo/giving-reports";
export * from "./repo/group-reports";
export * from "./repo/serving-reports";
export * from "./repo/people-reports";
export * from "./domain/preflight";
export * from "./messaging/contract";
export { dnsResolver } from "./domain/resolver";
export * from "./repo/recurring";
export * from "./repo/campaigns";
export * from "./repo/plan-templates";
export * from "./repo/live";
export * from "./repo/plan-history";
export * from "./repo/directory";
export * from "./repo/setup";
export * from "./repo/value";
export * from "./repo/directory-rules";
export * from "./repo/check-rules";
export * from "./repo/scope";
export * from "./repo/group-attendance";
export * from "./repo/group-finder";
export * from "./repo/meeting-dates";
export * from "./repo/match";
export * from "./repo/checkout";
export * from "./repo/which-service";
export * from "./repo/storage";
export * from "./demo/load";
export * from "./demo/church";
export { DEMO_PEOPLE, DEMO_TAGS } from "./demo/members";
export { listNotesForPerson, createNote, type NoteView } from "./repo/notes";
export {
  personTimeline, TIMELINE_LIMIT,
  type TimelineEntry, type TimelineKind,
} from "./repo/timeline";
export {
  listSavedLists, countArchivedSavedLists, getSavedList, createStaticList, createRuleList, renameList,
  setListArchived, addToList, removeFromList, resolveList, listsForPerson,
  cleanRule, RULE_KEYS,
  type SavedList, type ListRule, type RuleKey,
} from "./repo/lists";
export {
  membershipsForUser, verifyMembership, syncUserAndAcceptInvitations,
  createInvitation, revokeInvitation, createChurch, slugify, isKnownTimezone, linkOrCreatePerson, setAccountName,
  listTeam, listInvitations, invitationToSend, setMemberRole, memberRole, removeMember,
  leaveChurch, anotherOwns,
  RESERVED_SLUGS,
  type Membership, type TeamMember, type PendingInvitation, type InvitationToSend,
} from "./repo/membership";
export {
  twoStepFor, markTwoStepOn, markTwoStepOff, issueRecoveryCodes, spendRecoveryCode,
  RECOVERY_CODE_COUNT, TWO_STEP_REQUIRED_FROM, type TwoStepState,
} from "./repo/two-step";
export {
  churchForSelfSignup, joinChurch, setSelfSignup,
  type JoinTarget, type JoinOutcome,
} from "./repo/joining";
export { readSheet, readImportFile, parseDelimited, detectDelimiter, type Sheet } from "./import/csv";
export {
  GROUP_FIELDS, isGroupSheet, guessGroupMapping, parseGroupRole,
} from "./import/group-columns";
export {
  planGroups, commitGroups, rollbackGroupImport,
  type GroupPlan, type PlannedGroupRow, type GroupCommitResult,
} from "./import/run-groups";
export {
  IMPORT_SOURCES, SOURCE_KEYS, detectSource, sourceMapping,
  type SourceKey, type ImportSource,
} from "./import/sources";
export { readWorkbook, isWorkbookName } from "./import/xlsx";
export {
  PERSON_FIELDS, IGNORE, guessMapping, parseImportedDate, parseLifecycle, parseHouseholdRole,
  type TargetField,
} from "./import/columns";
export {
  buildMatchIndex, buildDuplicateIndex, indexPeople, findMatches, indexNewPerson,
  normaliseName, normaliseEmail, normalisePhone, type ExistingPerson,
  type Match, type MatchIndex, type Candidate, type Confidence,
} from "./import/match";
export {
  plan, commit, type Plan, type PlannedRow, type DuplicateStrategy, type CommitResult,
} from "./import/run";
export {
  listImports, rollbackImport, ROLLBACK_WINDOW_DAYS,
  type BatchSummary, type RollbackResult,
} from "./import/rollback";
export { buildArchive, ARCHIVE_FORMAT, EXPORT_TABLES, type Archive, type ExportTable } from "./export/archive";
export { buildView, EXPORT_VIEWS } from "./export/views";
export { zipArchive } from "./export/zip";
export { toCsv, CSV_BOM } from "./export/csv";
export { withAuditTriggersOff, deleteTenants, deleteTenantsLike } from "./maintenance";
export { loadEnv } from "./env";
export * from "./repo/notifications";
export * as platform from "./repo/platform";
export * as platformHealth from "./repo/platform-health";
export { bearerHolds } from "./bearer";
