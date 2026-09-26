import type {
  AccessibleLanguageProject,
  PermissionAuditRecord,
  ProjectMember,
} from "./admin-store";

export function projectListDto(
  projects: AccessibleLanguageProject[],
  systemAdministrator: boolean,
): Array<{
  canManageAccess: boolean;
  caretaker: boolean;
  id: string;
  name: string;
  role: "maintainer" | "reader" | "writer" | null;
}> {
  return projects.map(({ caretaker, project, role }) => ({
    canManageAccess: systemAdministrator || role === "maintainer",
    caretaker,
    id: project.id,
    name: project.name,
    role,
  }));
}

export function projectMembersDto(members: ProjectMember[]): Array<{
  caretaker: boolean;
  createdAt: Date;
  email: string;
  role: "maintainer" | "reader" | "writer";
  systemAdministrator: boolean;
  updatedAt: Date;
  userId: string;
}> {
  return members.map((member) => ({
    caretaker: member.caretaker,
    createdAt: member.createdAt,
    email: member.user.email,
    role: member.role,
    systemAdministrator: member.user.systemAdministrator,
    updatedAt: member.updatedAt,
    userId: member.userId,
  }));
}

export function permissionAuditDto(audit: PermissionAuditRecord[]): Array<{
  action: PermissionAuditRecord["action"];
  actor: { email: string; id: string } | null;
  id: string;
  newState: PermissionAuditRecord["newState"];
  occurredAt: Date;
  oldState: PermissionAuditRecord["oldState"];
  requestId: string;
  target: { email: string; id: string } | null;
}> {
  return audit.map((record) => ({
    action: record.action,
    actor: record.actorUserId && record.actorEmail
      ? { email: record.actorEmail, id: record.actorUserId }
      : null,
    id: record.id,
    newState: record.newState,
    occurredAt: record.occurredAt,
    oldState: record.oldState,
    requestId: record.requestId,
    target: record.targetUserId && record.targetEmail
      ? { email: record.targetEmail, id: record.targetUserId }
      : null,
  }));
}
