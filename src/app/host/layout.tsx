import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireViewer } from "@/server/auth";
import { logout } from "../(auth)/actions";
import { HostNav, MobileTabs } from "./host-nav";

async function WhoAmI() {
  const viewer = await requireViewer("dashboard:view");
  return (
    <div className="side-foot stack" style={{ marginTop: 0 }}>
      <div>
        <b style={{ color: "var(--ink)" }}>{viewer.orgName}</b>
        <div>
          {viewer.name} · {viewer.role === "ADMIN" ? "Admin" : "Volunteer"}
        </div>
      </div>
      <ThemeToggle />
      <form action={logout}>
        <button className="btn btn-ghost btn-sm" type="submit">
          Log out
        </button>
      </form>
    </div>
  );
}

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="hside" aria-label="Host navigation">
        <Link className="brand" href="/host">
          <Icon name="logo" className="brand-mark" />
          GatePass
        </Link>
        <Suspense fallback={<div className="sk" style={{ height: 160 }} />}>
          <HostNav />
        </Suspense>
        <div style={{ marginTop: "auto" }}>
          <Suspense fallback={<div className="sk" style={{ height: 64 }} />}>
            <WhoAmI />
          </Suspense>
        </div>
      </aside>
      <div>
        <div className="mtop">
          <div className="row between">
            <Link className="brand" href="/host">
              <Icon name="logo" className="brand-mark" />
              GatePass
            </Link>
            <form action={logout}>
              <button className="btn btn-ghost btn-sm" type="submit">
                Log out
              </button>
            </form>
          </div>
          <Suspense fallback={<div style={{ height: 40 }} />}>
            <MobileTabs />
          </Suspense>
        </div>
        <main className="main" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}
