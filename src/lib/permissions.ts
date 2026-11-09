export type Role = "ADMIN" | "VOLUNTEER";

export type Action =
  | "event:manage"
  | "promo:manage"
  | "payments:manage"
  | "team:manage"
  | "dashboard:view"
  | "attendees:view"
  | "attendees:export"
  | "checkin";

const VOLUNTEER_ACTIONS: ReadonlySet<Action> = new Set(["checkin"]);

/** Admins can do everything; volunteers can only check people in. */
export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  if (role === "ADMIN") return true;
  return VOLUNTEER_ACTIONS.has(action);
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Your role can't do this (${action}).`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role | null | undefined, action: Action): void {
  if (!can(role, action)) throw new ForbiddenError(action);
}
