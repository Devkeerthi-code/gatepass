"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { viewerWith } from "@/server/auth";
import { emailInviteLater } from "@/server/email";

export type TeamResult = { ok: true; message: string; link?: string } | { ok: false; message: string };

const INVITE_DAYS = 7;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(["ADMIN", "VOLUNTEER"]),
});

export async function createInvite(input: z.input<typeof inviteSchema>): Promise<TeamResult> {
  const viewer = await viewerWith("team:manage");
  if (!viewer) return { ok: false, message: "Only admins can invite people." };
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const already = await db.membership.findFirst({ where: { orgId: viewer.orgId, user: { email: parsed.data.email } } });
  if (already) return { ok: false, message: "That person is already on your team." };
  const token = randomToken(24);
  await db.invite.create({
    data: {
      orgId: viewer.orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  revalidatePath("/host/settings/team");
  const link = `${env().APP_URL}/invite/${token}`;
  emailInviteLater({ to: parsed.data.email, orgName: viewer.orgName, role: parsed.data.role, link });
  return {
    ok: true,
    message:
      "Invite created and emailed (if email is set up). You can also send this link on WhatsApp; it works once and expires in 7 days.",
    link,
  };
}

export async function revokeInvite(inviteId: string): Promise<TeamResult> {
  const viewer = await viewerWith("team:manage");
  if (!viewer) return { ok: false, message: "Only admins can manage the team." };
  await db.invite.deleteMany({ where: { id: inviteId, orgId: viewer.orgId, acceptedAt: null } });
  revalidatePath("/host/settings/team");
  return { ok: true, message: "Invite revoked." };
}

export async function changeRole(membershipId: string, role: "ADMIN" | "VOLUNTEER"): Promise<TeamResult> {
  const viewer = await viewerWith("team:manage");
  if (!viewer) return { ok: false, message: "Only admins can manage the team." };
  const m = await db.membership.findFirst({ where: { id: membershipId, orgId: viewer.orgId } });
  if (!m) return { ok: false, message: "Member not found." };
  if (m.userId === viewer.userId) return { ok: false, message: "You can't change your own role." };
  await db.membership.update({ where: { id: m.id }, data: { role: z.enum(["ADMIN", "VOLUNTEER"]).parse(role) } });
  revalidatePath("/host/settings/team");
  return { ok: true, message: "Role updated. It applies on their next tap." };
}

export async function removeMember(membershipId: string): Promise<TeamResult> {
  const viewer = await viewerWith("team:manage");
  if (!viewer) return { ok: false, message: "Only admins can manage the team." };
  const m = await db.membership.findFirst({ where: { id: membershipId, orgId: viewer.orgId } });
  if (!m) return { ok: false, message: "Member not found." };
  if (m.userId === viewer.userId) return { ok: false, message: "You can't remove yourself." };
  await db.$transaction([
    db.membership.delete({ where: { id: m.id } }),
    db.session.deleteMany({ where: { userId: m.userId, orgId: viewer.orgId } }),
  ]);
  revalidatePath("/host/settings/team");
  return { ok: true, message: "Removed. They were signed out immediately." };
}
