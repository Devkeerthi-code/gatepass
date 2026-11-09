import type { Metadata } from "next";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <div className="auth-card">
      <p className="label">Hosts and gate crew</p>
      <h1 className="display auth-title">Log in</h1>
      <LoginForm />
    </div>
  );
}
