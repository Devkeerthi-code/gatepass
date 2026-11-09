"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toaster";
import { formatShort } from "@/lib/format";
import { changeRole, createInvite, removeMember, revokeInvite, type TeamResult } from "./actions";

type Member = { id: string; userId: string; name: string; email: string; role: "ADMIN" | "VOLUNTEER"; scans: number };
type Invite = { id: string; email: string; role: "ADMIN" | "VOLUNTEER"; expiresAt: string };

export function TeamPanel({ me, members, invites }: { me: string; members: Member[]; invites: Invite[] }) {
  const [form, setForm] = useState<{ email: string; role: "ADMIN" | "VOLUNTEER" }>({ email: "", role: "VOLUNTEER" });
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const run = (fn: () => Promise<TeamResult>) =>
    start(async () => {
      const res = await fn();
      toast(res.message, { error: !res.ok });
      if (res.ok) {
        if (res.link) setLink(res.link);
        router.refresh();
      }
    });

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const res = await createInvite(form);
            if (res.ok) setForm({ ...form, email: "" });
            return res;
          });
        }}
      >
        <div className="sec-h">
          <h2>Invite someone</h2>
          <span className="label">Volunteers can only scan tickets</span>
        </div>
        <div className="row wrap" style={{ alignItems: "end" }}>
          <div className="field grow">
            <label htmlFor="inv-email">Email</label>
            <input
              id="inv-email"
              className="input"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="ravi@college.edu"
            />
          </div>
          <div className="seg" role="radiogroup" aria-label="Role">
            {(["VOLUNTEER", "ADMIN"] as const).map((r) => (
              <label key={r}>
                <input type="radio" name="role" checked={form.role === r} onChange={() => setForm({ ...form, role: r })} />
                <span>{r === "ADMIN" ? "Admin" : "Gate crew"}</span>
              </label>
            ))}
          </div>
          <button className="btn btn-accent" type="submit" disabled={pending || !form.email}>
            {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" small />} Create invite link
          </button>
        </div>
        {link ? (
          <div className="linkbox">
            <code>{link}</code>
            <button
              type="button"
              className="btn"
              aria-label="Copy invite link"
              onClick={() =>
                navigator.clipboard.writeText(link).then(
                  () => toast("Copied"),
                  () => toast("Couldn't copy", { error: true }),
                )
              }
            >
              <Icon name="copy" />
            </button>
          </div>
        ) : null}
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <caption className="sr-only">Team members</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Role</th>
              <th scope="col">Check-ins</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.name}</b>
                  {m.userId === me ? (
                    <span className="chip" style={{ marginLeft: 6 }}>
                      You
                    </span>
                  ) : null}
                  <div className="xs muted">{m.email}</div>
                </td>
                <td>
                  {m.userId === me ? (
                    <span className="chip chip-ink">{m.role === "ADMIN" ? "Admin" : "Gate crew"}</span>
                  ) : (
                    <select
                      className="select"
                      style={{ minHeight: 34, width: "auto" }}
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      disabled={pending}
                      onChange={(e) => run(() => changeRole(m.id, e.target.value as Member["role"]))}
                    >
                      <option value="VOLUNTEER">Gate crew</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  )}
                </td>
                <td className="mono">{m.scans}</td>
                <td style={{ textAlign: "right" }}>
                  {m.userId !== me ? (
                    <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => run(() => removeMember(m.id))}>
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invites.length ? (
        <div className="card stack">
          <h2>Pending invites</h2>
          <ul className="stack" role="list" style={{ listStyle: "none", padding: 0 }}>
            {invites.map((i) => (
              <li key={i.id} className="row between wrap">
                <span>
                  <b>{i.email}</b> · {i.role === "ADMIN" ? "Admin" : "Gate crew"}{" "}
                  <span className="xs muted">expires {formatShort(i.expiresAt)}</span>
                </span>
                <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => run(() => revokeInvite(i.id))}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
