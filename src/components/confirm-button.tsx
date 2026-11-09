"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Icon } from "./icon";
import { useToast } from "./toaster";

type Result = { ok: boolean; message: string };

/** A button that asks for confirmation in an in-app dialog before running a server action. */
export function ConfirmButton({
  label,
  title,
  body,
  confirmLabel,
  action,
  danger = false,
  className = "btn btn-sm",
  disabled,
}: {
  label: React.ReactNode;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  action: () => Promise<Result>;
  danger?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = () =>
    start(async () => {
      const res = await action();
      toast(res.message, { error: !res.ok });
      if (res.ok) {
        dialog.current?.close();
        router.refresh();
      }
    });

  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current?.showModal()} disabled={disabled}>
        {label}
      </button>
      <dialog ref={dialog} className="sheet" aria-labelledby={`cf-${title}`}>
        <div className="dlg-h">
          <h2 id={`cf-${title}`}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialog.current?.close()} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="dlg-b small">{body}</div>
        <div className="dlg-f">
          <button type="button" className="btn" onClick={() => dialog.current?.close()} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-accent"}`} onClick={run} disabled={pending} autoFocus>
            {pending ? <span className="spinner" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
