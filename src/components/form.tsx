"use client";

import { useFormStatus } from "react-dom";

/** Submit button that disables itself while its form's action is pending (no double submits). */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-accent",
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export type FieldErrors = Record<string, string[] | undefined>;

export function FieldError({ errors, name }: { errors?: FieldErrors; name: string }) {
  const message = errors?.[name]?.[0];
  if (!message) return null;
  return (
    <span className="err" id={`${name}-error`}>
      {message}
    </span>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | null }) {
  if (!state) return null;
  if (state.error)
    return (
      <p className="notice notice-no" role="alert">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p className="notice notice-ok" role="status">
        {state.ok}
      </p>
    );
  return null;
}
