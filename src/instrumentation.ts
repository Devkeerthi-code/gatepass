/** Runs once when the server starts: fail fast with a clear message if required env vars are missing. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./lib/env");
  env();
}
