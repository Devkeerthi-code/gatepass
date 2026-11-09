import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { can, type Action, type Role } from "@/lib/permissions";

const COOKIE = "gp_session";
const SESSION_DAYS = 30;

export { hashPassword, verifyPassword } from "./password";

/** Only a SHA-256 of the token is stored, so a DB leak can't be replayed as cookies. */
export async function startSession(userId: string, orgId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { tokenHash: sha256(token), userId, orgId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE);
}

export type Viewer = {
  userId: string;
  name: string;
  email: string;
  orgId: string;
  orgName: string;
  role: Role;
};

/** The signed-in person and their role in the active organisation, or null. Memoised per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { memberships: { include: { org: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  // Membership is re-checked on every request, so removing a volunteer logs them out immediately.
  const membership = session.user.memberships.find((m) => m.orgId === session.orgId);
  if (!membership) return null;
  return {
    userId: session.userId,
    name: session.user.name,
    email: session.user.email,
    orgId: membership.orgId,
    orgName: membership.org.name,
    role: membership.role,
  };
});

/** For pages: redirects to login, or to the scanner when a volunteer opens an admin page. */
export async function requireViewer(action?: Action): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (action && !can(viewer.role, action)) redirect(viewer.role === "VOLUNTEER" ? "/scan" : "/host");
  return viewer;
}

/** For server actions and API routes: returns null instead of redirecting. */
export async function viewerWith(action: Action): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer && can(viewer.role, action) ? viewer : null;
}

/** Ensures an event belongs to the viewer's organisation (prevents cross-org access by id). */
export async function ownedEvent(viewer: Viewer, eventId: string) {
  return db.event.findFirst({ where: { id: eventId, orgId: viewer.orgId } });
}
