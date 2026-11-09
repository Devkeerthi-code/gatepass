"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { rateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/slug";
import { endSession, hashPassword, startSession, verifyPassword } from "@/server/auth";
import { track } from "@/server/usage";

export type AuthState = { error?: string; fieldErrors?: Record<string, string[] | undefined> } | null;

// bcrypt hash of a random string: compared against when the email is unknown, to equalise timing.
const DUMMY_HASH = "$2b$11$Y1K33BS3K/DaDTke5T2fkuP9R0BUlYiN6jlEpC.QVzkumuD8NS6U2";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
const password = z.string().min(8, "Use at least 8 characters.").max(200);
const name = z.string().trim().min(2, "Enter your name.").max(80);

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

const signupSchema = z.object({
  name,
  email,
  password,
  orgName: z.string().trim().min(2, "Name your club or crew.").max(80),
});

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  if (!(await rateLimit(`signup:${await clientKey()}`, 10, 60 * 60_000))) {
    return { error: "Too many sign-ups from this network. Try again in an hour." };
  }
  const { orgName, ...user } = parsed.data;
  try {
    const passwordHash = await hashPassword(user.password);
    const created = await db.$transaction(async (tx) => {
      const org = await tx.organisation.create({
        data: { name: orgName, slug: `${slugify(orgName)}-${Math.random().toString(36).slice(2, 6)}` },
      });
      const u = await tx.user.create({ data: { name: user.name, email: user.email, passwordHash } });
      await tx.membership.create({ data: { userId: u.id, orgId: org.id, role: "ADMIN" } });
      return { userId: u.id, orgId: org.id };
    });
    await startSession(created.userId, created.orgId);
    track("org.created", { orgId: created.orgId });
  } catch (err) {
    if (isUniqueViolation(err)) return { fieldErrors: { email: ["An account with this email already exists. Log in instead."] } };
    throw err;
  }
  redirect("/host");
}

const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.") });

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { email: mail, password: pw } = parsed.data;
  if (!(await rateLimit(`login:${await clientKey()}:${mail}`, 8, 15 * 60_000))) {
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }
  const user = await db.user.findUnique({ where: { email: mail }, include: { memberships: true } });
  // Same message and roughly the same time either way, so the form can't reveal who has an account.
  const valid = await verifyPassword(pw, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "That email and password don't match." };
  const membership = user.memberships.find((m) => m.role === "ADMIN") ?? user.memberships[0];
  if (!membership) return { error: "This account isn't part of any team yet. Ask your organiser for an invite." };
  await startSession(user.id, membership.orgId);
  redirect(membership.role === "VOLUNTEER" ? "/scan" : "/host");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

const acceptSchema = z.object({ token: z.string().min(10), name: name.optional(), password });

export async function acceptInvite(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = acceptSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const invite = await db.invite.findUnique({ where: { tokenHash: sha256(parsed.data.token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return { error: "This invite link has expired or was already used. Ask your organiser for a new one." };
  }
  const existing = await db.user.findUnique({ where: { email: invite.email } });
  let userId: string;
  if (existing) {
    if (!(await verifyPassword(parsed.data.password, existing.passwordHash))) {
      return { error: "You already have an account with this email. Enter that password to join." };
    }
    userId = existing.id;
  } else {
    if (!parsed.data.name) return { fieldErrors: { name: ["Enter your name."] } };
    const created = await db.user.create({
      data: { email: invite.email, name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password) },
    });
    userId = created.id;
  }
  await db.$transaction([
    db.membership.upsert({
      where: { userId_orgId: { userId, orgId: invite.orgId } },
      create: { userId, orgId: invite.orgId, role: invite.role },
      update: { role: invite.role },
    }),
    db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  await startSession(userId, invite.orgId);
  redirect(invite.role === "VOLUNTEER" ? "/scan" : "/host");
}
