import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { encryptSecret } from "@/lib/crypto";
import { createRazorpayProvider, isLiveKey, isTestKey } from "./payments/razorpay";

export type LiveCheck = { id: string; label: string; done: boolean; help: string };

export function maskKey(keyId: string | null): string | null {
  if (!keyId) return null;
  const prefix = keyId.startsWith("rzp_live_") ? "rzp_live_" : keyId.startsWith("rzp_test_") ? "rzp_test_" : "";
  return `${prefix}••••${keyId.slice(-4)}`;
}

/** Everything that must be true before real money can be taken. */
export async function liveReadiness(orgId: string): Promise<LiveCheck[]> {
  const s = await db.paymentSettings.findUnique({ where: { orgId } });
  const missingPolicy = await db.event.count({
    where: { orgId, status: "PUBLISHED", isDemo: false, OR: [{ refundPolicy: null }, { refundPolicy: "" }] },
  });
  return [
    {
      id: "keys",
      label: "Live keys verified with Razorpay",
      done: !!s?.liveVerifiedAt,
      help: "Paste your rzp_live_ key pair below and press Test connection.",
    },
    {
      id: "webhook-secret",
      label: "Webhook secret saved",
      done: !!s?.liveWebhookSecretEnc,
      help: "Create a webhook in Razorpay and paste the secret you chose.",
    },
    {
      id: "webhook-seen",
      label: "A signed webhook reached GatePass",
      done: !!s?.liveWebhookSeenAt,
      help: "Make one test-mode payment after adding the webhook URL in Razorpay.",
    },
    {
      id: "https",
      label: "Site runs on HTTPS",
      done: env().APP_URL.startsWith("https://"),
      help: "Deploy, then set APP_URL to your https:// address.",
    },
    {
      id: "refunds",
      label: "Every live concert has a refund policy",
      done: missingPolicy === 0,
      help: "Add one in each concert's page settings.",
    },
  ];
}

export type KeyMode = "TEST" | "LIVE";

export type ConnectResult = { ok: true } | { ok: false; message: string };

/**
 * Verifies keys against Razorpay before saving anything. Saving verified test keys switches the
 * host to Razorpay Test immediately; live keys wait for the readiness checklist.
 */
export async function connectKeys(
  orgId: string,
  mode: KeyMode,
  input: { keyId: string; keySecret: string; webhookSecret: string | null },
): Promise<ConnectResult> {
  if (mode === "TEST" && !isTestKey(input.keyId))
    return {
      ok: false,
      message: "Test keys start with rzp_test_. Copy them from Razorpay Dashboard → Account & Settings → API Keys (Test mode).",
    };
  if (mode === "LIVE" && !isLiveKey(input.keyId))
    return { ok: false, message: "Live keys start with rzp_live_. Switch the Razorpay dashboard to Live mode to generate them." };

  const check = await createRazorpayProvider(mode === "TEST" ? "RZP_TEST_ORG" : "RZP_LIVE_ORG", { ...input }).testConnection();
  if (!check.ok) return { ok: false, message: check.message };

  const key = env().APP_ENCRYPTION_KEY;
  const existing = await db.paymentSettings.findUnique({ where: { orgId } });
  const webhook = input.webhookSecret ? encryptSecret(input.webhookSecret, key) : undefined;
  const fields =
    mode === "TEST"
      ? {
          testKeyId: input.keyId,
          testKeySecretEnc: encryptSecret(input.keySecret, key),
          testWebhookSecretEnc: webhook ?? existing?.testWebhookSecretEnc ?? null,
          testVerifiedAt: new Date(),
        }
      : {
          liveKeyId: input.keyId,
          liveKeySecretEnc: encryptSecret(input.keySecret, key),
          liveWebhookSecretEnc: webhook ?? existing?.liveWebhookSecretEnc ?? null,
          liveVerifiedAt: new Date(),
        };
  const switchTo = mode === "TEST" && existing?.mode !== "LIVE" ? { mode: "TEST" as const } : {};
  await db.paymentSettings.upsert({ where: { orgId }, create: { orgId, ...fields, ...switchTo }, update: { ...fields, ...switchTo } });
  return { ok: true };
}

export async function disconnectKeys(orgId: string, mode: KeyMode): Promise<void> {
  const s = await db.paymentSettings.findUnique({ where: { orgId } });
  if (!s) return;
  const cleared =
    mode === "TEST"
      ? { testKeyId: null, testKeySecretEnc: null, testWebhookSecretEnc: null, testVerifiedAt: null }
      : { liveKeyId: null, liveKeySecretEnc: null, liveWebhookSecretEnc: null, liveVerifiedAt: null, liveWebhookSeenAt: null };
  await db.paymentSettings.update({ where: { orgId }, data: { ...cleared, ...(s.mode === mode ? { mode: "MOCK" } : {}) } });
}

export type ModeResult = { ok: true } | { ok: false; message: string };

export async function switchMode(orgId: string, mode: "MOCK" | "TEST" | "LIVE"): Promise<ModeResult> {
  const s = await db.paymentSettings.findUnique({ where: { orgId } });
  if (mode === "TEST" && !s?.testVerifiedAt) return { ok: false, message: "Connect and verify your Razorpay test keys first." };
  if (mode === "LIVE") {
    const pending = (await liveReadiness(orgId)).filter((c) => !c.done);
    if (pending.length) return { ok: false, message: `Live stays locked until: ${pending.map((p) => p.label.toLowerCase()).join("; ")}.` };
  }
  await db.paymentSettings.upsert({ where: { orgId }, create: { orgId, mode }, update: { mode } });
  return { ok: true };
}
