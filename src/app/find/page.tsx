import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { FindForm } from "./find-form";

export const metadata: Metadata = { title: "Find my tickets", robots: { index: false } };

export default function FindPage() {
  return (
    <main className="container narrow stack">
      <Link className="brand" href="/">
        <Icon name="logo" className="brand-mark" />
        GatePass
      </Link>
      <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
        Find my tickets
      </h1>
      <p className="small muted">Lost the link? Enter the email and mobile number you used at checkout. Both must match.</p>
      <FindForm />
    </main>
  );
}
