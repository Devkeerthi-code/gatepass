import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireViewer } from "@/server/auth";
import { TeamPanel } from "./team-panel";

export const metadata: Metadata = { title: "Team" };

async function Team() {
  const viewer = await requireViewer("team:manage");
  const [members, invites, scans] = await Promise.all([
    db.membership.findMany({ where: { orgId: viewer.orgId }, include: { user: { select: { name: true, email: true } } }, orderBy: { role: "asc" } }),
    db.invite.findMany({ where: { orgId: viewer.orgId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    db.checkInLog.groupBy({ by: ["volunteerId"], where: { event: { orgId: viewer.orgId }, result: "OK" }, _count: { _all: true } }),
  ]);
  const scanCount = new Map(scans.map((s) => [s.volunteerId, s._count._all]));
  return (
    <TeamPanel
      me={viewer.userId}
      members={members.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, scans: scanCount.get(m.userId) ?? 0 }))}
      invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
    />
  );
}

export default function TeamPage() {
  return (
    <>
      <div className="head">
        <div>
          <div className="crumbs">Settings</div>
          <h1>Team</h1>
        </div>
      </div>
      <Suspense fallback={<div className="sk" style={{ height: 300, borderRadius: 18 }} />}>
        <Team />
      </Suspense>
    </>
  );
}
