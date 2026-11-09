import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { accentVars } from "@/lib/accent";
import { db } from "@/lib/db";
import { formatDay, formatTime } from "@/lib/format";
import { providerForOrg } from "@/server/payments/resolve";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout" };

async function Checkout({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      ticketType: { select: { name: true, admits: true } },
      event: { include: { questions: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!order) notFound();
  if (order.status !== "PENDING") redirect(`/o/${order.id}`);
  const provider = await providerForOrg(order.event.orgId);
  const event = order.event;

  return (
    <main id="main" className="checkout container" style={accentVars(event.accentHex)}>
      <div className="stack">
        <Link className="btn btn-ghost btn-sm" href={`/c/${event.slug}`} style={{ justifySelf: "start" }}>
          <Icon name="arrow-left" small /> {event.name}
        </Link>
        <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
          Checkout
        </h1>
        <p className="small muted">
          {formatDay(event.startsAt)} · {formatTime(event.startsAt)} · {event.venue}
        </p>
      </div>
      <CheckoutForm
        orderId={order.id}
        eventSlug={event.slug}
        holdExpiresAt={order.holdExpiresAt.toISOString()}
        tierName={order.ticketType.name}
        admits={order.ticketType.admits}
        qty={order.qty}
        unitPricePaise={order.unitPricePaise}
        failureReason={order.failureReason}
        modeLabel={provider.label}
        refundPolicy={event.refundPolicy}
        questions={event.questions.map((q) => ({ id: q.id, label: q.label, required: q.required }))}
        prefill={{ buyerName: order.buyerName, email: order.email, phone: order.phone, college: order.college }}
      />
    </main>
  );
}

export default function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  return (
    <Suspense
      fallback={
        <main id="main" className="checkout container">
          <div className="sk" style={{ height: 480, borderRadius: 18 }} />
        </main>
      }
    >
      <Checkout params={params} />
    </Suspense>
  );
}
