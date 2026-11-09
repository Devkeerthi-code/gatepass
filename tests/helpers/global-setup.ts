import { execSync } from "node:child_process";
import "dotenv/config";

/** Applies migrations to the isolated test schema once per run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to run tests (see .env.example).");
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
  });
}
