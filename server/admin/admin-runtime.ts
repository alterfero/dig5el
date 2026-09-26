import type { LocalAuthRuntime } from "../auth/auth-runtime";
import { AdminService } from "./admin-service";

export type AdminRuntime = {
  service: AdminService;
};

/** Shares the authenticated local-account persistence boundary; no second identity silo. */
export function createAdminRuntime(authRuntime: LocalAuthRuntime): AdminRuntime {
  return { service: new AdminService(authRuntime.persistence.store) };
}
