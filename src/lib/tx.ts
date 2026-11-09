import "server-only";
import { db, type Tx } from "./db";

/** Interactive transaction with timeouts that tolerate a cold serverless database. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(fn, { maxWait: 15_000, timeout: 20_000 });
}
