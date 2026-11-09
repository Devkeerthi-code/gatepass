"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container narrow stack" role="alert">
      <Icon name="alert" />
      <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
        Something broke on our side
      </h1>
      <p className="small muted">If you were paying, don&apos;t pay again. Any held seats stay held for 10 minutes, and paid orders still get their tickets.</p>
      <div className="row wrap">
        <button className="btn btn-accent" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="btn" href="/find">
          Find my tickets
        </Link>
      </div>
    </main>
  );
}
