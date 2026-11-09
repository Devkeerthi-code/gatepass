import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Supports `?schema=name` in the URL (used by the test suite to isolate its tables). */
function createClient(url: string) {
  const parsed = new URL(url);
  const schema = parsed.searchParams.get("schema") ?? undefined;
  parsed.searchParams.delete("schema");
  // search_path makes raw SQL resolve to the same schema as generated queries.
  const adapter = new PrismaPg(
    { connectionString: parsed.toString(), max: 10, ...(schema ? { options: `-c search_path="${schema}"` } : {}) },
    schema ? { schema } : undefined,
  );
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createClient(process.env.DATABASE_URL ?? "");

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
