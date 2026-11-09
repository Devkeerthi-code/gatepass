import type { Metadata } from "next";
import { SignupForm } from "../auth-forms";

export const metadata: Metadata = { title: "Host a concert" };

export default function SignupPage() {
  return (
    <div className="auth-card">
      <p className="label">Payments run in Mock mode until you connect Razorpay</p>
      <h1 className="display auth-title">Host a concert</h1>
      <SignupForm />
    </div>
  );
}
