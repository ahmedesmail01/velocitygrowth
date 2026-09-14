const BASE = "https://dispatcher-production-72fc.up.railway.app";
const TYPES = {
  delivered: "delivered",
  bounced: "bounce",
  bounce: "bounce",
  opened: "open",
  open: "open",
  unsubscribed: "unsubscribe",
  unsubscribe: "unsubscribe",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function recipientId(value) {
  const id =
    typeof value === "string"
      ? value
      : (value?.recipient_id ??
        value?.id ??
        value?.external_id ??
        value?.contact_id ??
        value?.recipient?.id);
  if (typeof id !== "string" || !UUID.test(id))
    throw Error("Unrecognized recipient");
  return id.toLowerCase();
}
export function normalizeEvent(e) {
  const event_id = e?.event_id ?? e?.id;
  const event_type = TYPES[e?.event_type ?? e?.type];
  const occurred_at = e?.occurred_at_utc ?? e?.occurred_at ?? e?.timestamp;
  if (
    typeof event_id !== "string" ||
    !event_id.length ||
    event_id.length > 200 ||
    event_id.includes("\0") ||
    !event_type ||
    typeof occurred_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      occurred_at,
    ) ||
    !Number.isFinite(Date.parse(occurred_at))
  )
    throw Error("Unrecognized event");
  return {
    event_id,
    event_type,
    occurred_at,
    recipient_id: recipientId(
      e.recipient_id ?? e.recipient ?? e.contact_id ?? e.external_id,
    ),
  };
}
// Raw issues stay in the private schema. Base64 also handles NUL values that JSONB rejects.
function quarantine(e) {
  return {
    encoding: "base64-json",
    value: Buffer.from(JSON.stringify(e)).toString("base64"),
  };
}
export function createWorker({
  rpc,
  apiKey,
  fetchImpl = fetch,
  log = console.log,
}) {
  async function provider(path, init = {}) {
    const response = await fetchImpl(BASE + path, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(45000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) throw Error("Provider request failed");
    return response.json();
  }
  async function poll() {
    const job = await rpc("worker_claim_poll");
    if (!job) return false;
    let cursor = job.cursor;
    try {
      // A bounded pass leaves a durable cursor and lease for the next process.
      for (let page = 0; page < 100; page++) {
        const body = await provider(
          `/v1/messages/${encodeURIComponent(job.batch_id)}/events${cursor ? "?since=" + encodeURIComponent(cursor) : ""}`,
        );
        if (
          !Array.isArray(body.events) ||
          body.events.length > 1000 ||
          typeof body.has_more !== "boolean"
        )
          throw Error("Invalid page");
        const events = [],
          issues = [];
        for (const e of body.events) {
          try {
            events.push(normalizeEvent(e));
          } catch {
            issues.push(quarantine(e));
          }
        }
        const next = body.next_cursor ?? cursor;
        if (
          (next !== null && typeof next !== "string") ||
          (body.has_more && (!next || next === cursor))
        )
          throw Error("Invalid cursor");
        await rpc("worker_record_page", {
          p_run: job.run_id,
          p_token: job.poll_token,
          p_events: events,
          p_issues: issues,
          p_cursor: next,
          p_more: body.has_more,
        });
        cursor = next;
        if (!body.has_more) break;
      }
      log("Delivery reports synchronized.");
    } catch {
      await rpc("worker_poll_failed", {
        p_run: job.run_id,
        p_token: job.poll_token,
      });
      log("Report sync delayed; saved progress will resume.");
    }
    return true;
  }
  async function dispatch() {
    const job = await rpc("worker_claim_send");
    if (!job) return false;
    try {
      const ack = await provider("/v1/messages", {
        method: "POST",
        headers: { "Idempotency-Key": job.idempotency_key },
        body: JSON.stringify(job.payload),
      });
      if (!Array.isArray(ack.accepted) || !Array.isArray(ack.rejected))
        throw Error("Invalid acknowledgement");
      await rpc("worker_dispatch_complete", {
        p_run: job.run_id,
        p_lease: job.lease_token,
        p_batch: ack.batch_id,
        p_accepted: ack.accepted.map(recipientId),
        p_rejected: ack.rejected.map(recipientId),
      });
      log("Provider acknowledgement recorded.");
    } catch {
      await rpc("worker_dispatch_failed", {
        p_run: job.run_id,
        p_lease: job.lease_token,
      });
      log(
        "Dispatch outcome uncertain; retry will use the identical request and key.",
      );
    }
    return true;
  }
  return {
    poll,
    dispatch,
    async once() {
      await poll();
      await dispatch();
    },
  };
}
