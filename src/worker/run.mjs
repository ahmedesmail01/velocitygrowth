import { createClient } from "@supabase/supabase-js";
import { createWorker } from "./provider.mjs";
const { SUPABASE_URL, SUPABASE_SECRET_KEY, MESSAGING_API_KEY } =
  process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !MESSAGING_API_KEY) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_SECRET_KEY and MESSAGING_API_KEY in .env.worker.",
  );
  process.exit(1);
}
const client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rpc = async (name, args = {}) => {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    console.error(`RPC ${name} failed:`, error.message, error.code, error.details);
    throw Error("Database operation failed", { cause: error });
  }
  return data;
};
const worker = createWorker({ rpc, apiKey: MESSAGING_API_KEY });
let stop = false;
process.on("SIGINT", () => {
  stop = true;
});
process.on("SIGTERM", () => {
  stop = true;
});
do {
  try {
    await worker.once();
  } catch (err) {
    console.error("Worker error:", err?.cause ?? err);
    console.error(
      "Worker connection failed; retrying. Check service configuration if this persists.",
    );
  }
  if (process.argv.includes("--once")) break;
  if (!stop) await new Promise((resolve) => setTimeout(resolve, 5000));
} while (!stop);
