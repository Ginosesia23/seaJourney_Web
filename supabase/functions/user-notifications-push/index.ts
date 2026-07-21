/**
 * user-notifications-push — FCM to a single user's `users.fcm_token`.
 *
 * Companion to `send-broadcast-push`: same FCM/service-account pattern, but
 * targets the ONE user whose row was just inserted (or whose id was passed
 * directly).
 *
 * Trigger options:
 *   1. Database Webhook on INSERT into `public.app_user_notifications`
 *      (webhook payload has `record.user_id`).
 *   2. Direct invocation with JSON body:
 *        { userId: "…", title: "…", body: "…", kind?: "…", route?: "…" }
 *      — used by the web app's `sendUserNotification` helper so we don't
 *      depend on Webhooks being configured.
 *
 * Deploy:
 *   supabase functions deploy user-notifications-push --no-verify-jwt
 *
 * Requires the same env as send-broadcast-push:
 *   - GOOGLE_SERVICE_ACCOUNT_JSON
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
};

function parseJsonIfString(v: unknown): unknown {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

function normalizeTableName(table: string): string {
  const t = table.trim();
  const parts = t.split(".");
  return parts.length > 1 ? (parts[parts.length - 1] ?? t) : t;
}

function normalizeWebhookPayload(
  raw: Record<string, unknown>,
): WebhookPayload | null {
  const inner =
    raw.payload && typeof raw.payload === "object"
      ? (raw.payload as Record<string, unknown>)
      : raw;

  const tableRaw = (inner.table ??
    inner.table_name ??
    inner.tablename) as string | undefined;

  let record = inner.record ?? inner.new ?? inner.row ?? raw.record ?? raw.new;
  record = parseJsonIfString(record) as Record<string, unknown> | undefined;

  const type = (inner.type ??
    inner.operation ??
    inner.event ??
    raw.type) as string | undefined;

  if (!tableRaw || typeof tableRaw !== "string") return null;
  const table = normalizeTableName(tableRaw);
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  return {
    type,
    table,
    record: record as Record<string, unknown>,
  };
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importRsaPrivateKeyFromPem(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, "\n").trim();
  const m = normalized.match(
    /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/,
  );
  if (!m) {
    throw new Error("private_key is not a valid PEM (BEGIN PRIVATE KEY)");
  }
  const b64 = m[1]!.replace(/\s/g, "");
  const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

type ServiceAccountFields = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function parseServiceAccount(json: string): ServiceAccountFields {
  return JSON.parse(json) as ServiceAccountFields;
}

function projectIdForFcmUrl(sa: ServiceAccountFields): string {
  const fromEmail = sa.client_email?.match(
    /^[^@]+@([^.]+)\.iam\.gserviceaccount\.com$/,
  )?.[1];
  if (fromEmail) {
    if (sa.project_id && sa.project_id !== fromEmail) {
      console.warn(
        `FCM: project_id (${sa.project_id}) != client_email project (${fromEmail}); using client_email`,
      );
    }
    return fromEmail;
  }
  const env =
    Deno.env.get("FIREBASE_PROJECT_ID")?.trim() ||
    Deno.env.get("FCM_PROJECT_ID")?.trim();
  if (env) return env;
  if (sa.project_id) return sa.project_id;
  throw new Error(
    "Cannot resolve FCM project id: need client_email or project_id in GOOGLE_SERVICE_ACCOUNT_JSON",
  );
}

async function getGoogleAccessToken(sa: ServiceAccountFields): Promise<string> {
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope:
      "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${b64url(JSON.stringify(header))}.${
    b64url(JSON.stringify(payload))
  }`;
  const key = await importRsaPrivateKeyFromPem(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Google OAuth ${tokenRes.status}: ${t}`);
  }
  const data = (await tokenRes.json()) as {
    access_token?: string;
    token_type?: string;
  };
  const raw = data.access_token?.trim();
  if (!raw || raw.length < 20) {
    throw new Error("Google OAuth response missing or invalid access_token");
  }
  return raw;
}

async function sendFcmV1(
  serviceAccountJson: string,
  deviceToken: string,
  title: string,
  body: string,
  data: { route: string; kind: string },
): Promise<void> {
  const token = String(deviceToken ?? "").trim();
  if (!token) throw new Error("FCM: empty device token");

  const sa = parseServiceAccount(serviceAccountJson);
  const projectId = projectIdForFcmUrl(sa);
  const accessToken = await getGoogleAccessToken(sa);

  const url =
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: {
          route: data.route,
          kind: data.kind,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`FCM ${res.status}: ${errText}`);
  }
}

async function sendToOneUser(
  supabase: ReturnType<typeof createClient>,
  serviceAccountJson: string,
  userId: string,
  title: string,
  body: string,
  data: { route: string; kind: string },
): Promise<
  { sent: boolean; skipped?: string; error?: string; userId: string }
> {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, fcm_token")
    .eq("id", userId)
    .maybeSingle();

  if (error) return { sent: false, error: error.message, userId };
  if (!user) return { sent: false, skipped: "user_not_found", userId };

  const token = String(user["fcm_token"] ?? "").trim();
  if (!token) return { sent: false, skipped: "no_fcm_token", userId };

  try {
    await sendFcmV1(serviceAccountJson, token, title, body, data);
    return { sent: true, userId };
  } catch (e) {
    console.error("user-notifications-push FCM error user", userId, e);
    return { sent: false, error: String(e), userId };
  }
}

function isInsert(t: string | undefined): boolean {
  const u = String(t ?? "").toUpperCase();
  return u === "INSERT" || u === "CREATE";
}

function metadataRoute(metadata: unknown): string {
  const meta = parseJsonIfString(metadata);
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const r = (meta as Record<string, unknown>)["route"];
    if (typeof r === "string" && r.trim()) return r.trim();
  }
  return "main";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not set" }),
        {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }
    try {
      JSON.parse(saJson);
    } catch {
      return new Response(
        JSON.stringify({
          error: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON",
        }),
        {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const raw = (await req.json()) as Record<string, unknown>;

    let userId: string;
    let title: string;
    let body: string;
    let kind = "user_notification";
    let route = "main";

    const webhook = normalizeWebhookPayload(raw);
    if (webhook) {
      // Database Webhook path.
      const tbl = webhook.table;
      if (tbl !== "app_user_notifications") {
        return new Response(
          JSON.stringify({ ok: true, skipped: "wrong_table", table: tbl }),
          { headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      if (!isInsert(webhook.type)) {
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: "not_insert",
            type: webhook.type,
          }),
          { headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      const rec = webhook.record;
      userId = String(rec["user_id"] ?? "").trim();
      title = String(rec["title"] ?? "").trim();
      body = String(rec["body"] ?? "").trim();
      const recKind = String(rec["kind"] ?? "").trim();
      if (recKind) kind = recKind;
      route = metadataRoute(rec["metadata"]);
      if (!userId || !title || !body) {
        return new Response(
          JSON.stringify({
            error: "record must include non-empty user_id, title, and body",
          }),
          {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      }
    } else if (
      typeof raw.userId === "string" &&
      typeof raw.title === "string" &&
      typeof raw.body === "string"
    ) {
      // Direct invocation path (used by the Next.js `sendUserNotification`).
      userId = raw.userId.trim();
      title = raw.title.trim();
      body = raw.body.trim();
      if (typeof raw.kind === "string" && raw.kind.trim()) kind = raw.kind.trim();
      if (typeof raw.route === "string" && raw.route.trim()) {
        route = raw.route.trim();
      } else if (raw.metadata) {
        route = metadataRoute(raw.metadata);
      }
      if (!userId || !title || !body) {
        return new Response(
          JSON.stringify({
            error: "userId, title, and body must be non-empty strings",
          }),
          {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          error:
            "Expected Database Webhook body with table app_user_notifications + INSERT, or JSON { userId, title, body }.",
          received_keys: Object.keys(raw),
        }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const result = await sendToOneUser(supabase, saJson, userId, title, body, {
      route,
      kind,
    });

    return new Response(
      JSON.stringify({ ok: true, ...result }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
