import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { InviteForm } from "../../auth-forms";

export const metadata: Metadata = { title: "Join the crew" };

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.invite.findUnique({ where: { tokenHash: sha256(token) }, include: { org: true } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return (
      <div className="stack">
        <h1 className="display auth-title">Link expired</h1>
        <p className="muted">This invite was already used or is more than 7 days old. Ask your organiser to send a new one.</p>
        <Link className="btn" href="/login">
          Go to log in
        </Link>
      </div>
    );
  }
  const existing = await db.user.findUnique({ where: { email: invite.email }, select: { id: true } });
  return (
    <div className="stack">
      <p className="label">
        {invite.org.name} invited {invite.email}
      </p>
      <h1 className="display auth-title">{invite.role === "VOLUNTEER" ? "Gate crew" : "Join as admin"}</h1>
      <p className="small muted">
        {invite.role === "VOLUNTEER"
          ? "Volunteers can scan tickets and search the guest list. Nothing else."
          : "Admins can edit concerts, payments, promotions and the team."}
      </p>
      <InviteForm token={token} needsName={!existing} />
    </div>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="auth-card">
      <Suspense fallback={<div className="sk" style={{ height: 280 }} />}>
        <Invite params={params} />
      </Suspense>
    </div>
  );
}
