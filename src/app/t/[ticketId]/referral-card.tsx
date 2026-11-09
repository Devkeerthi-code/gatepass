"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toaster";
import { getReferral } from "./actions";

/** Fan-ambassador link: created on demand so we don't make links for people who never share. */
export function ReferralCard({ ticketId }: { ticketId: string }) {
  const [data, setData] = useState<{ url: string; sold: number; rewardAfter: number } | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const create = () =>
    start(async () => {
      const res = await getReferral(ticketId);
      if (!res) return toast("Referrals aren't available for this ticket.", { error: true });
      setData({ ...res, url: `${window.location.origin}${res.path}` });
    });

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Select the link and copy it.", { error: true });
    }
  };

  return (
    <div className="card ref">
      <div className="row between">
        <h2 style={{ fontSize: "var(--t-md)" }}>Bring friends, get noticed</h2>
        <span className="chip chip-accent">Referral</span>
      </div>
      {data ? (
        <>
          <div className="prog" aria-label={`${data.sold} of ${data.rewardAfter} friends bought`}>
            {Array.from({ length: data.rewardAfter }, (_, i) => (
              <i key={i} className={i < data.sold ? "on" : ""} />
            ))}
          </div>
          <p className="xs muted" style={{ marginBottom: 12 }}>
            {data.sold} of {data.rewardAfter} bought with your link. The host sees a leaderboard and rewards top fans.
          </p>
          <div className="linkbox">
            <code>{data.url.replace(/^https?:\/\//, "")}</code>
            <button className="btn" type="button" onClick={copy} aria-label="Copy referral link">
              <Icon name="copy" />
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="xs muted" style={{ margin: "8px 0 12px" }}>
            Get your own link. Every ticket bought through it counts towards your fan-ambassador reward.
          </p>
          <button className="btn btn-sm" type="button" onClick={create} disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="link" small />} Get my link
          </button>
        </>
      )}
    </div>
  );
}
