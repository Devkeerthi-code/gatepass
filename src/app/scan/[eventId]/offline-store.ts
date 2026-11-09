"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ManifestTicket, QueuedScan } from "@/lib/scan-types";

interface ScanDB extends DBSchema {
  tickets: { key: string; value: ManifestTicket & { eventId: string } ; indexes: { byEvent: string } };
  queue: { key: string; value: QueuedScan & { eventId: string } ; indexes: { byEvent: string } };
  meta: { key: string; value: { key: string; value: string } };
}

let dbPromise: Promise<IDBPDatabase<ScanDB>> | null = null;

function database() {
  dbPromise ??= openDB<ScanDB>("gatepass-scanner", 1, {
    upgrade(db) {
      db.createObjectStore("tickets", { keyPath: "id" }).createIndex("byEvent", "eventId");
      db.createObjectStore("queue", { keyPath: "clientScanId" }).createIndex("byEvent", "eventId");
      db.createObjectStore("meta", { keyPath: "key" });
    },
  });
  return dbPromise;
}

/** Replaces the cached guest list, but keeps local check-ins that haven't synced yet. */
export async function saveManifest(eventId: string, tickets: ManifestTicket[], generatedAt: string): Promise<void> {
  const db = await database();
  const pending = new Set((await db.getAllFromIndex("queue", "byEvent", eventId)).map((q) => q.ticketId).filter(Boolean));
  const tx = db.transaction(["tickets", "meta"], "readwrite");
  const store = tx.objectStore("tickets");
  for (const old of await store.index("byEvent").getAllKeys(eventId)) await store.delete(old);
  for (const t of tickets) {
    const local = pending.has(t.id) && !t.checkedInAt ? { checkedInAt: new Date().toISOString(), checkedInBy: "this phone (syncing)" } : {};
    await store.put({ ...t, ...local, eventId });
  }
  await tx.objectStore("meta").put({ key: `synced:${eventId}`, value: generatedAt });
  await tx.done;
}

export async function loadManifest(eventId: string): Promise<{ tickets: ManifestTicket[]; syncedAt: string | null }> {
  const db = await database();
  const tickets = await db.getAllFromIndex("tickets", "byEvent", eventId);
  const meta = await db.get("meta", `synced:${eventId}`);
  return { tickets, syncedAt: meta?.value ?? null };
}

export async function markLocalCheckIn(eventId: string, ticketId: string): Promise<void> {
  const db = await database();
  const t = await db.get("tickets", ticketId);
  if (t && t.eventId === eventId) await db.put("tickets", { ...t, checkedInAt: new Date().toISOString(), checkedInBy: "this phone (syncing)" });
}

export async function enqueue(eventId: string, scan: QueuedScan): Promise<void> {
  const db = await database();
  await db.put("queue", { ...scan, eventId });
}

export async function queued(eventId: string): Promise<QueuedScan[]> {
  const db = await database();
  return db.getAllFromIndex("queue", "byEvent", eventId);
}

export async function dequeue(ids: string[]): Promise<void> {
  const db = await database();
  const tx = db.transaction("queue", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}
