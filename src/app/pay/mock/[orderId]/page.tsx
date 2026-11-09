import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { MockSimulator } from "./simulator";

export const metadata: Metadata = { title: "Mock payment (test)" };

async function Simulator({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { event: { select: { name: true } }, ticketType: { select: { name: true } }, promo: { select: { code: true, label: true } } },
  });
  if (!order) notFound();
  if (order.status !== "PENDING") redirect(`/o/${order.id}`);
  if (order.provider !== "MOCK") redirect(`/checkout/${order.id}`);
  return (
    <MockSimulator
      orderId={order.id}
      amount={formatPaise(order.amountPaise)}
      subtotal={order.discountPaise ? formatPaise(order.amountPaise + order.discountPaise) : null}
      promo={order.promo ? (order.promo.label ?? order.promo.code) : null}
      line={`${order.qty} × ${order.ticketType.name} · ${order.event.name}`}
      providerOrderId={order.providerOrderId ?? ""}
    />
  );
}

export default function MockPayPage({ params }: { params: Promise<{ orderId: string }> }) {
  return (
    <main id="main" className="mockpay">
      <Suspense fallback={<div className="sk" style={{ height: 420, borderRadius: 18 }} />}>
        <Simulator params={params} />
      </Suspense>
    </main>
  );
}
