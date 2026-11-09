import Link from "next/link";
import { FlingTicket } from "@/components/fling-ticket";
import { Icon } from "@/components/icon";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-art">
        <Link className="brand" href="/">
          <Icon name="logo" className="brand-mark" />
          GatePass
        </Link>
        <div aria-hidden="true">
          <FlingTicket />
        </div>
        <p className="label" aria-hidden="true">
          Drag the pass. Let go.
        </p>
      </aside>
      <main id="main" className="auth-main">
        {children}
      </main>
    </div>
  );
}
