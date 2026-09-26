import { describe, expect, it } from "vitest";
import { InMemoryAuthStore } from "../../../server/auth/memory-auth-store";
import { AuthAccountStateError } from "../../../server/auth/auth-store";
import { AdminService } from "../../../server/admin/admin-service";
import { requireLanguageCaretaker } from "../../../server/admin/guards";
import {
  AdminAuthorizationError,
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
} from "../../../server/admin/errors";

const passwordHash = "scrypt-v1$32768$8$1$A0bbwQFplbLZHxJt3ltmdg$XmFvFYHMDndXafW6gLj0_np7GbPL0Ys6Y7U7cedxAqhUKqyRANKKV2foea-wRwfHdB2cVGJC6DALValYruGCkg";
const startedAt = new Date("2026-09-17T00:00:00.000Z");

const ids = {
  caretaker: "00000000-0000-4000-8000-000000000104",
  manager: "00000000-0000-4000-8000-000000000102",
  otherAdministrator: "00000000-0000-4000-8000-000000000106",
  owner: "00000000-0000-4000-8000-000000000101",
  pending: "00000000-0000-4000-8000-000000000105",
  reader: "00000000-0000-4000-8000-000000000103",
};

async function createActiveUser(
  store: InMemoryAuthStore,
  id: string,
  email: string,
): Promise<void> {
  await store.createUser({
    activatedAt: startedAt,
    email,
    id,
    now: startedAt,
    passwordHash,
    status: "active",
  });
}

async function createFixture() {
  const store = new InMemoryAuthStore();
  await createActiveUser(store, ids.owner, "owner@example.test");
  await createActiveUser(store, ids.manager, "manager@example.test");
  await createActiveUser(store, ids.reader, "reader@example.test");
  await createActiveUser(store, ids.caretaker, "caretaker@example.test");
  await createActiveUser(store, ids.otherAdministrator, "global@example.test");
  await store.createUser({
    email: "pending@example.test",
    id: ids.pending,
    now: startedAt,
    passwordHash: null,
    status: "pending_activation",
  });

  let milliseconds = startedAt.getTime();
  const service = new AdminService(store, {
    clock: () => new Date(milliseconds += 1_000),
  });
  await store.bootstrapSystemAdministrator({
    now: startedAt,
    requestId: "bootstrap_owner",
    targetEmail: "owner@example.test",
  });
  const project = await service.createProject({
    actorUserId: ids.owner,
    languageKey: "catalog:Tahitian",
    requestId: "req_create",
  });
  return { project, service, store };
}

describe("local language-project administration", () => {
  it("requires a global system administrator to select a catalog language for a project and gives its creator maintainer plus caretaker", async () => {
    const { project, service } = await createFixture();

    expect(project).toMatchObject({ languageKey: "catalog:Tahitian", name: "Tahitian" });
    const access = await service.getProjectAccess({
      actorUserId: ids.owner,
      projectId: project.id,
    });
    expect(access.systemAdministrator).toBe(true);
    expect(access.members).toMatchObject([
      {
        caretaker: true,
        role: "maintainer",
        user: { email: "owner@example.test", id: ids.owner },
      },
    ]);
    expect(access.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "language_project_created",
        actorEmail: "owner@example.test",
        projectId: project.id,
        requestId: "req_create",
        targetEmail: "owner@example.test",
      }),
      expect.objectContaining({
        action: "membership_granted",
        newState: { caretaker: true, role: "maintainer" },
        oldState: null,
        projectId: project.id,
      }),
    ]));

    await expect(service.createProject({
      actorUserId: ids.reader,
      languageKey: "catalog:English",
      requestId: "req_denied",
    })).rejects.toBeInstanceOf(AdminAuthorizationError);
  });

  it("searches catalog languages and preserves custom-language provenance through selection", async () => {
    const { service, store } = await createFixture();

    await expect(service.searchLanguages("tahi")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "catalog:Tahitian", name: "Tahitian", source: "catalog" }),
      ]),
    );

    const added = await service.createCustomLanguage({
      actorUserId: ids.owner,
      name: "Te Reo Vāna",
      regionOrCountry: "Te Moana-nui-a-Kiwa",
      requestId: "req_add_custom_language",
    });
    expect(added).toMatchObject({
      id: expect.stringMatching(/^custom:/u),
      name: "Te Reo Vāna",
      regionOrCountry: "Te Moana-nui-a-Kiwa",
      source: "custom",
    });
    const customId = added.id.slice("custom:".length);
    await expect(store.findCustomLanguage(customId)).resolves.toMatchObject({
      createdAt: expect.any(Date),
      createdByUserId: ids.owner,
      id: customId,
      name: "Te Reo Vāna",
      regionOrCountry: "Te Moana-nui-a-Kiwa",
    });
    await expect(service.searchLanguages("vana")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: added.id, source: "custom" })]),
    );

    const project = await service.createProject({
      actorUserId: ids.owner,
      languageKey: added.id,
      requestId: "req_create_custom_project",
    });
    expect(project).toMatchObject({ languageKey: added.id, name: "Te Reo Vāna" });

    await expect(service.createCustomLanguage({
      actorUserId: ids.owner,
      name: "Te Reo Vana",
      regionOrCountry: "A different spelling must not bypass duplicate detection",
      requestId: "req_duplicate_custom_language",
    })).rejects.toMatchObject<Partial<AdminConflictError>>({ code: "LANGUAGE_EXISTS" });
    await expect(service.createCustomLanguage({
      actorUserId: ids.owner,
      name: "Tahitian",
      regionOrCountry: "French Polynesia",
      requestId: "req_catalog_duplicate",
    })).rejects.toMatchObject<Partial<AdminConflictError>>({ code: "LANGUAGE_EXISTS" });
    await expect(service.createCustomLanguage({
      actorUserId: ids.reader,
      name: "Unauthorised language",
      regionOrCountry: "Nowhere",
      requestId: "req_unauthorised_custom_language",
    })).rejects.toBeInstanceOf(AdminAuthorizationError);
    await expect(service.createProject({
      actorUserId: ids.owner,
      languageKey: "catalog:not-a-language",
      requestId: "req_unknown_catalog_language",
    })).rejects.toBeInstanceOf(AdminNotFoundError);
  });

  it("allows only a maintainer or separate global administrator to manage a local roster", async () => {
    const { project, service, store } = await createFixture();
    await service.grantMembership({
      actorUserId: ids.owner,
      caretaker: false,
      email: "manager@example.test",
      projectId: project.id,
      requestId: "req_manager",
      role: "maintainer",
    });
    await service.grantMembership({
      actorUserId: ids.manager,
      caretaker: false,
      email: "reader@example.test",
      projectId: project.id,
      requestId: "req_reader",
      role: "reader",
    });

    await expect(service.getProjectAccess({
      actorUserId: ids.reader,
      projectId: project.id,
    })).rejects.toBeInstanceOf(AdminAuthorizationError);
    await expect(service.grantMembership({
      actorUserId: ids.reader,
      caretaker: false,
      email: "caretaker@example.test",
      projectId: project.id,
      requestId: "req_reader_denied",
      role: "writer",
    })).rejects.toBeInstanceOf(AdminAuthorizationError);

    await store.bootstrapSystemAdministrator({
      now: new Date(startedAt.getTime() + 10_000),
      requestId: "bootstrap_global",
      targetEmail: "global@example.test",
    });
    await service.grantMembership({
      actorUserId: ids.otherAdministrator,
      caretaker: false,
      email: "caretaker@example.test",
      projectId: project.id,
      requestId: "req_global_grant",
      role: "writer",
    });
    const listed = await service.listAccessibleProjects(ids.otherAdministrator);
    expect(listed.systemAdministrator).toBe(true);
    expect(listed.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        caretaker: false,
        project: expect.objectContaining({ id: project.id }),
        role: null,
      }),
    ]));
  });

  it("enforces caretaker as a separate language-project capability", async () => {
    const { project, service, store } = await createFixture();
    await service.grantMembership({
      actorUserId: ids.owner,
      caretaker: false,
      email: "reader@example.test",
      projectId: project.id,
      requestId: "req_reader",
      role: "reader",
    });
    await service.grantMembership({
      actorUserId: ids.owner,
      caretaker: false,
      email: "manager@example.test",
      projectId: project.id,
      requestId: "req_writer",
      role: "writer",
    });
    await service.grantMembership({
      actorUserId: ids.owner,
      caretaker: true,
      email: "caretaker@example.test",
      projectId: project.id,
      requestId: "req_caretaker",
      role: "writer",
    });

    await expect(requireLanguageCaretaker(store, ids.reader, project.id))
      .rejects.toBeInstanceOf(AdminAuthorizationError);
    await expect(requireLanguageCaretaker(store, ids.manager, project.id))
      .rejects.toBeInstanceOf(AdminAuthorizationError);
    await expect(requireLanguageCaretaker(store, ids.caretaker, project.id))
      .resolves.toMatchObject({ caretaker: true, role: "writer" });
    await expect(requireLanguageCaretaker(store, ids.owner, project.id))
      .resolves.toMatchObject({ caretaker: true, role: "maintainer" });
    await expect(service.grantMembership({
      actorUserId: ids.owner,
      caretaker: true,
      email: "pending@example.test",
      projectId: project.id,
      requestId: "req_invalid_caretaker",
      role: "reader",
    })).rejects.toBeInstanceOf(AdminValidationError);
  });

  it("allows a pending administrator-created account to receive local access and records permission old/new state", async () => {
    const { project, service } = await createFixture();
    await expect(service.grantMembership({
      actorUserId: ids.owner,
      caretaker: false,
      email: "pending@example.test",
      projectId: project.id,
      requestId: "req_pending",
      role: "reader",
    })).resolves.toMatchObject({ userId: ids.pending, role: "reader" });

    const granted = await service.grantMembership({
      actorUserId: ids.owner,
      caretaker: false,
      email: "reader@example.test",
      projectId: project.id,
      requestId: "req_grant_reader",
      role: "reader",
    });
    const changed = await service.changeMembership({
      actorUserId: ids.owner,
      caretaker: true,
      projectId: project.id,
      requestId: "req_change_reader",
      role: "writer",
      targetUserId: granted.userId,
    });
    expect(changed).toMatchObject({ caretaker: true, role: "writer" });

    const access = await service.getProjectAccess({ actorUserId: ids.owner, projectId: project.id });
    expect(access.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "membership_changed",
        actorUserId: ids.owner,
        newState: { caretaker: true, role: "writer" },
        oldState: { caretaker: false, role: "reader" },
        requestId: "req_change_reader",
        targetUserId: ids.reader,
      }),
    ]));
    const audit = access.audit.find((record) => record.requestId === "req_change_reader");
    if (!audit?.newState) throw new Error("Expected an immutable audit record.");
    audit.newState.role = "reader";
    const reread = await service.getProjectAccess({ actorUserId: ids.owner, projectId: project.id });
    expect(reread.audit.find((record) => record.requestId === "req_change_reader")?.newState)
      .toEqual({ caretaker: true, role: "writer" });
  });

  it("prevents the last maintainer from being demoted or revoked", async () => {
    const { project, service } = await createFixture();
    await expect(service.changeMembership({
      actorUserId: ids.owner,
      caretaker: false,
      projectId: project.id,
      requestId: "req_demote_last",
      role: "writer",
      targetUserId: ids.owner,
    })).rejects.toMatchObject<Partial<AdminConflictError>>({ code: "LAST_MAINTAINER" });
    await expect(service.revokeMembership({
      actorUserId: ids.owner,
      projectId: project.id,
      requestId: "req_revoke_last",
      targetUserId: ids.owner,
    })).rejects.toMatchObject<Partial<AdminConflictError>>({ code: "LAST_MAINTAINER" });
  });

  it("limits local user listing to the separate global capability", async () => {
    const { service } = await createFixture();
    await expect(service.listUsers(ids.reader)).rejects.toBeInstanceOf(AdminAuthorizationError);
    await expect(service.listUsers(ids.owner)).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          languageKey: "catalog:Tahitian",
          name: "Tahitian",
        }),
      ]),
      users: expect.arrayContaining([
        expect.objectContaining({
          caretakerProjectIds: [expect.any(String)],
          email: "owner@example.test",
          id: ids.owner,
          systemAdministrator: true,
        }),
        expect.objectContaining({
          caretakerProjectIds: [],
          email: "reader@example.test",
          id: ids.reader,
          systemAdministrator: false,
        }),
      ]),
    });
  });

  it("updates global user type and an exact project caretaker set with audited writer promotion", async () => {
    const { project, service, store } = await createFixture();
    const secondProject = await service.createProject({
      actorUserId: ids.owner,
      languageKey: "catalog:English",
      requestId: "req_second_project",
    });
    await service.grantMembership({
      actorUserId: ids.owner,
      caretaker: false,
      email: "reader@example.test",
      projectId: project.id,
      requestId: "req_reader_membership",
      role: "reader",
    });

    const updated = await service.updateUser({
      actorUserId: ids.owner,
      caretakerProjectIds: [secondProject.id, project.id],
      requestId: "req_user_permissions",
      systemAdministrator: true,
      targetUserId: ids.reader,
    });
    expect(updated).toMatchObject({
      caretakerProjectIds: [project.id, secondProject.id].sort(),
      id: ids.reader,
      systemAdministrator: true,
    });
    await expect(store.isSystemAdministrator(ids.reader)).resolves.toBe(true);
    await expect(store.findProjectMembership(project.id, ids.reader))
      .resolves.toMatchObject({ caretaker: true, role: "writer" });
    await expect(store.findProjectMembership(secondProject.id, ids.reader))
      .resolves.toMatchObject({ caretaker: true, role: "writer" });

    await expect(store.listProjectPermissionAudit(project.id, 200)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "membership_changed",
          newState: { caretaker: true, role: "writer" },
          oldState: { caretaker: false, role: "reader" },
          requestId: "req_user_permissions",
          targetUserId: ids.reader,
        }),
      ]),
    );
    await expect(store.listProjectPermissionAudit(secondProject.id, 200)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "membership_granted",
          newState: { caretaker: true, role: "writer" },
          oldState: null,
          requestId: "req_user_permissions",
          targetUserId: ids.reader,
        }),
      ]),
    );
    await expect(store.listUserPermissionAudit(ids.reader, 200)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "system_administrator_granted",
          actorKind: "user",
          actorUserId: ids.owner,
          newState: { systemAdministrator: true },
          oldState: { systemAdministrator: false },
          projectId: null,
          requestId: "req_user_permissions",
          targetUserId: ids.reader,
        }),
      ]),
    );

    await service.updateUser({
      actorUserId: ids.owner,
      caretakerProjectIds: [secondProject.id],
      requestId: "req_remove_first_caretaker",
      systemAdministrator: true,
      targetUserId: ids.reader,
    });
    await expect(store.findProjectMembership(project.id, ids.reader))
      .resolves.toMatchObject({ caretaker: false, role: "writer" });
    await expect(store.findProjectMembership(secondProject.id, ids.reader))
      .resolves.toMatchObject({ caretaker: true, role: "writer" });

    await service.updateUser({
      actorUserId: ids.owner,
      caretakerProjectIds: [],
      requestId: "req_revoke_user_administrator",
      systemAdministrator: false,
      targetUserId: ids.reader,
    });
    await expect(store.isSystemAdministrator(ids.reader)).resolves.toBe(false);
    await expect(store.findProjectMembership(secondProject.id, ids.reader))
      .resolves.toMatchObject({ caretaker: false, role: "writer" });
    await expect(store.listUserPermissionAudit(ids.reader, 200)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "system_administrator_revoked",
          actorUserId: ids.owner,
          newState: { systemAdministrator: false },
          oldState: { systemAdministrator: true },
          projectId: null,
          requestId: "req_revoke_user_administrator",
        }),
      ]),
    );
  });

  it("rejects invalid user permission updates without partial changes and preserves an active administrator", async () => {
    const { project, service, store } = await createFixture();
    const unknownProjectId = "00000000-0000-4000-8000-000000000199";

    await expect(service.updateUser({
      actorUserId: ids.owner,
      caretakerProjectIds: [unknownProjectId],
      requestId: "req_unknown_caretaker_project",
      systemAdministrator: true,
      targetUserId: ids.reader,
    })).rejects.toBeInstanceOf(AdminNotFoundError);
    await expect(store.isSystemAdministrator(ids.reader)).resolves.toBe(false);
    await expect(store.findProjectMembership(project.id, ids.reader)).resolves.toBeNull();

    await expect(service.updateUser({
      actorUserId: ids.owner,
      caretakerProjectIds: [project.id, project.id],
      requestId: "req_duplicate_caretaker_project",
      systemAdministrator: false,
      targetUserId: ids.reader,
    })).rejects.toBeInstanceOf(AdminValidationError);
    await expect(service.updateUser({
      actorUserId: ids.reader,
      caretakerProjectIds: [],
      requestId: "req_non_admin_user_update",
      systemAdministrator: false,
      targetUserId: ids.owner,
    })).rejects.toBeInstanceOf(AdminAuthorizationError);

    await store.bootstrapSystemAdministrator({
      now: new Date(startedAt.getTime() + 20_000),
      requestId: "bootstrap_pending_administrator",
      targetEmail: "pending@example.test",
    });
    await expect(service.updateUser({
      actorUserId: ids.owner,
      caretakerProjectIds: [],
      requestId: "req_demote_final_active_administrator",
      systemAdministrator: false,
      targetUserId: ids.owner,
    })).rejects.toMatchObject<Partial<AdminConflictError>>({
      code: "LAST_SYSTEM_ADMINISTRATOR",
    });
    await expect(store.isSystemAdministrator(ids.owner)).resolves.toBe(true);
    await expect(store.findProjectMembership(project.id, ids.owner))
      .resolves.toMatchObject({ caretaker: true, role: "maintainer" });

    const disabledUserId = "00000000-0000-4000-8000-000000000107";
    await store.createUser({
      email: "disabled@example.test",
      id: disabledUserId,
      now: startedAt,
      passwordHash: null,
      status: "disabled",
    });
    await expect(service.updateUser({
      actorUserId: ids.owner,
      caretakerProjectIds: [],
      requestId: "req_disabled_user_update",
      systemAdministrator: true,
      targetUserId: disabledUserId,
    })).rejects.toBeInstanceOf(AuthAccountStateError);
  });
});

describe("user deletion", () => {
  it("deletes administrators, revokes memberships, and preserves project history", async () => {
    const { service, store, project } = await createFixture();
    await service.updateUser({ actorUserId: ids.owner, targetUserId: ids.otherAdministrator,
      systemAdministrator: true, caretakerProjectIds: [], requestId: "promote" });
    await service.deleteUser({ actorUserId: ids.otherAdministrator, targetUserId: ids.owner, requestId: "delete" });
    expect(await store.isSystemAdministrator(ids.owner)).toBe(false);
    expect(await store.findUserByEmail("owner@example.test")).toBeNull();
    expect(await store.findProjectMembership(project.id, ids.owner)).toBeNull();
    expect(await store.findLanguageProject(project.id)).not.toBeNull();
    expect((await service.listUsers(ids.otherAdministrator)).users.some((user) => user.id === ids.owner)).toBe(false);
    expect(await store.listUserPermissionAudit(ids.owner, 100)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "user_deleted", actorUserId: ids.otherAdministrator }),
    ]));
    await expect(service.deleteUser({ actorUserId: ids.otherAdministrator, targetUserId: ids.owner, requestId: "repeat" }))
      .rejects.toBeInstanceOf(AdminNotFoundError);
  });

  it("requires an administrator and preserves the last active administrator", async () => {
    const { service } = await createFixture();
    await expect(service.deleteUser({ actorUserId: ids.reader, targetUserId: ids.manager, requestId: "forbidden" }))
      .rejects.toBeInstanceOf(AdminAuthorizationError);
    await expect(service.deleteUser({ actorUserId: ids.owner, targetUserId: ids.owner, requestId: "last" }))
      .rejects.toMatchObject({ code: "LAST_SYSTEM_ADMINISTRATOR" });
  });

  it("deletes pending accounts and allows their email to be reused", async () => {
    const { service, store } = await createFixture();
    await service.deleteUser({ actorUserId: ids.owner, targetUserId: ids.pending, requestId: "pending" });
    await createActiveUser(store, "00000000-0000-4000-8000-000000000199", "pending@example.test");
    expect((await store.findUserByEmail("pending@example.test"))?.id).not.toBe(ids.pending);
  });
});
