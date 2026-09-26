import type { AdminStore, LanguageProject, ProjectMembership } from "./admin-store";
import { AdminAuthorizationError, AdminNotFoundError } from "./errors";

export type ProjectManagementAuthority = {
  membership: ProjectMembership | null;
  project: LanguageProject;
  systemAdministrator: boolean;
};

/**
 * Local roster guard only. It must never be substituted for PLAID project or
 * corpus authorization when that integration is later enabled.
 */
export async function requireProjectManagementAuthority(
  store: AdminStore,
  actorUserId: string,
  projectId: string,
): Promise<ProjectManagementAuthority> {
  const project = await store.findLanguageProject(projectId);
  if (!project) throw new AdminNotFoundError("language_project");

  const [systemAdministrator, membership] = await Promise.all([
    store.isSystemAdministrator(actorUserId),
    store.findProjectMembership(projectId, actorUserId),
  ]);
  if (!systemAdministrator && membership?.role !== "maintainer") {
    throw new AdminAuthorizationError();
  }
  return { membership, project, systemAdministrator };
}

export async function requireSystemAdministrator(
  store: AdminStore,
  actorUserId: string,
): Promise<void> {
  if (!(await store.isSystemAdministrator(actorUserId))) {
    throw new AdminAuthorizationError();
  }
}

/**
 * Capability guard for future language-care work. A system administrator or
 * project maintainer does not implicitly become a caretaker: the capability
 * must be explicitly recorded on this local project alongside writer or
 * maintainer access.
 */
export async function requireLanguageCaretaker(
  store: AdminStore,
  userId: string,
  projectId: string,
): Promise<ProjectMembership> {
  if (!(await store.findLanguageProject(projectId))) {
    throw new AdminNotFoundError("language_project");
  }
  const membership = await store.findProjectMembership(projectId, userId);
  if (
    !membership ||
    !membership.caretaker ||
    (membership.role !== "writer" && membership.role !== "maintainer")
  ) {
    throw new AdminAuthorizationError();
  }
  return membership;
}
