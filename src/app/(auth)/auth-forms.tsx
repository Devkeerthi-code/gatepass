"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FieldError, FormMessage, SubmitButton } from "@/components/form";
import { acceptInvite, login, signup, type AuthState } from "./actions";

function Field({
  name,
  label,
  type = "text",
  state,
  autoComplete,
  hint,
}: {
  name: string;
  label: string;
  type?: string;
  state: AuthState;
  autoComplete?: string;
  hint?: string;
}) {
  const invalid = !!state?.fieldErrors?.[name];
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        className="input"
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        aria-invalid={invalid}
        aria-describedby={invalid ? `${name}-error` : hint ? `${name}-hint` : undefined}
      />
      {hint && !invalid ? (
        <span className="hint" id={`${name}-hint`}>
          {hint}
        </span>
      ) : null}
      <FieldError errors={state?.fieldErrors} name={name} />
    </div>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="stack" noValidate>
      <FormMessage state={state} />
      <Field name="email" label="Email" type="email" autoComplete="email" state={state} />
      <Field name="password" label="Password" type="password" autoComplete="current-password" state={state} />
      <SubmitButton className="btn btn-accent btn-lg btn-block" pendingLabel="Checking…">
        Log in
      </SubmitButton>
      <p className="small muted">
        New here? <Link href="/signup">Create a host account</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signup, null);
  return (
    <form action={action} className="stack" noValidate>
      <FormMessage state={state} />
      <Field name="name" label="Your name" autoComplete="name" state={state} />
      <Field name="orgName" label="Club, crew or venue" state={state} hint="Shown on your concert pages, e.g. “DIT Music Club”." />
      <Field name="email" label="Email" type="email" autoComplete="email" state={state} />
      <Field name="password" label="Password" type="password" autoComplete="new-password" state={state} hint="At least 8 characters." />
      <SubmitButton className="btn btn-accent btn-lg btn-block" pendingLabel="Creating…">
        Create host account
      </SubmitButton>
      <p className="small muted">
        Already hosting? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}

export function InviteForm({ token, needsName }: { token: string; needsName: boolean }) {
  const [state, action] = useActionState(acceptInvite, null);
  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      {needsName ? (
        <Field name="name" label="Your name" autoComplete="name" state={state} hint="Shown at the gate: “checked in by …”." />
      ) : null}
      <Field
        name="password"
        label={needsName ? "Choose a password" : "Your GatePass password"}
        type="password"
        autoComplete={needsName ? "new-password" : "current-password"}
        state={state}
      />
      <SubmitButton className="btn btn-accent btn-lg btn-block" pendingLabel="Joining…">
        Join the crew
      </SubmitButton>
    </form>
  );
}
