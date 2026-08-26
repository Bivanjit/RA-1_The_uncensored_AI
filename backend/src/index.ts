interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  run<T = D1Result>(): Promise<T>;
}

interface D1Result {
  success: boolean;
  meta?: { changes?: number };
  results?: unknown[] | null;
}

interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}

interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  PUBLIC_ORIGIN?: string;
  TRIAL_BOT_SECRET?: string;
}

interface UserRow {
  id: string;
  email: string;
  plan: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  created_at: string;
}

interface SessionUserRow extends UserRow {
  expires_at: string;
}

interface CreditRow {
  subscription_credits: number;
  purchased_credits: number;
}

const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 30;
const FREE_TRIAL_CREDITS = 10;
const MAX_PROMPT_WORDS = 1000;
const TRIAL_KEY_BYTES = 24;

const PLANS = {
  weekly: {
    id: "weekly",
    name: "RA-1 WEEKLY",
    price_inr: 499,
    duration_days: 7,
    included_credits: 300,
    access: "subscription",
  },
  monthly: {
    id: "monthly",
    name: "RA-1 MONTHLY",
    price_inr: 1499,
    duration_days: 30,
    included_credits: 2500,
    access: "subscription",
  },
  yearly: {
    id: "yearly",
    name: "RA-1 YEARLY",
    price_inr: 3999,
    duration_days: 365,
    included_credits: 100000,
    access: "subscription",
  },
  lifetime: {
    id: "lifetime",
    name: "RA-1 LIFETIME",
    price_inr: 9999,
    duration_days: null,
    included_credits: null,
    credit_policy: "configured_later",
    access: "lifetime",
  },
} as const;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function response(body: Record<string, unknown>, status = 200, origin?: string) {
  const headers = new Headers(jsonHeaders);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toBase64Url(data);
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}

async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations <= 0) return false;
  const salt = fromBase64Url(parts[2]);
  const expected = fromBase64Url(parts[3]);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    expected.byteLength * 8,
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function countWords(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function createSession(env: Env, userId: string): Promise<string> {
  const rawToken = randomToken(32);
  const tokenHash = await sha256(rawToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
  ).bind(sessionId, userId, tokenHash, expiresAt).run();
  return rawToken;
}

async function authenticatedUser(request: Request, env: Env): Promise<SessionUserRow | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const rawToken = header.slice(7).trim();
  if (!rawToken) return null;
  const tokenHash = await sha256(rawToken);
  return env.DB.prepare(
    `SELECT u.id, u.email, u.plan, u.trial_started_at, u.trial_ends_at,
            u.subscription_started_at, u.subscription_expires_at, u.created_at, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`,
  ).bind(tokenHash).first<SessionUserRow>();
}

async function ensureCreditsRow(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO credits (user_id) VALUES (?)`,
  ).bind(userId).run();
}

async function creditSummary(env: Env, userId: string) {
  await ensureCreditsRow(env, userId);
  const row = await env.DB.prepare(
    `SELECT u.plan, u.subscription_expires_at,
            c.subscription_credits, c.purchased_credits
     FROM users u JOIN credits c ON c.user_id = u.id
     WHERE u.id = ?`,
  ).bind(userId).first<{
    plan: string;
    subscription_expires_at: string | null;
    subscription_credits: number;
    purchased_credits: number;
  }>();

  if (!row) return null;

  const subscriptionActive = row.plan === "free"
    ? true
    : row.plan === "lifetime"
      ? true
      : !!row.subscription_expires_at && row.subscription_expires_at > new Date().toISOString();

  const usableSubscriptionCredits = subscriptionActive ? row.subscription_credits : 0;
  return {
    plan: row.plan,
    subscription_expires_at: row.subscription_expires_at,
    subscription_credits: usableSubscriptionCredits,
    purchased_credits: row.purchased_credits,
    total_usable_credits: usableSubscriptionCredits + row.purchased_credits,
  };
}

async function consumeCredit(env: Env, userId: string, metadata: string): Promise<"subscription" | "purchased" | null> {
  await ensureCreditsRow(env, userId);

  const activeSubscriptionCondition = `(u.plan = 'free' OR u.plan = 'lifetime' OR (u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at > CURRENT_TIMESTAMP))`;

  const subscriptionBatch = await env.DB.batch([
    env.DB.prepare(
      `UPDATE credits SET subscription_credits = subscription_credits - 1,
              lifetime_used = lifetime_used + 1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND subscription_credits > 0
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = credits.user_id AND ${activeSubscriptionCondition})`,
    ).bind(userId),
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, type, amount, metadata)
       SELECT ?, ?, 'CHAT_USAGE', -1, ? WHERE changes() = 1`,
    ).bind(crypto.randomUUID(), userId, metadata),
    env.DB.prepare(
      `INSERT INTO usage (id, user_id, action, credits_used, metadata)
       SELECT ?, ?, 'CHAT_USAGE', 1, ? WHERE changes() = 1`,
    ).bind(crypto.randomUUID(), userId, metadata),
  ]);

  if ((subscriptionBatch[0]?.meta?.changes ?? 0) === 1) return "subscription";

  const purchasedBatch = await env.DB.batch([
    env.DB.prepare(
      `UPDATE credits SET purchased_credits = purchased_credits - 1,
              lifetime_used = lifetime_used + 1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND purchased_credits > 0`,
    ).bind(userId),
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, type, amount, metadata)
       SELECT ?, ?, 'CHAT_USAGE', -1, ? WHERE changes() = 1`,
    ).bind(crypto.randomUUID(), userId, metadata),
    env.DB.prepare(
      `INSERT INTO usage (id, user_id, action, credits_used, metadata)
       SELECT ?, ?, 'CHAT_USAGE', 1, ? WHERE changes() = 1`,
    ).bind(crypto.randomUUID(), userId, metadata),
  ]);

  if ((purchasedBatch[0]?.meta?.changes ?? 0) === 1) return "purchased";
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.PUBLIC_ORIGIN;

    if (request.method === "OPTIONS") {
      const headers = new Headers();
      headers.set("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
      headers.set("access-control-allow-headers", "content-type, authorization");
      if (origin) {
        headers.set("access-control-allow-origin", origin);
        headers.set("vary", "Origin");
      }
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return response({ ok: true, service: "ra-1-api", environment: env.ENVIRONMENT ?? "development" }, 200, origin);
    }

    if (url.pathname === "/api/db-health" && request.method === "GET") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return response({ ok: result?.ok === 1, database: "d1" }, 200, origin);
      } catch {
        return response({ ok: false, database: "d1" }, 503, origin);
      }
    }

    if (url.pathname === "/api/plans" && request.method === "GET") {
      return response({ ok: true, plans: PLANS }, 200, origin);
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = await readJson(request);
      const email = normalizeEmail(body?.email);
      const password = body?.password;
      if (!email || !validPassword(password)) {
        return response({ error: "Valid email and password (8-128 characters) are required" }, 400, origin);
      }

      try {
        const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
        if (existing) return response({ error: "Account already exists" }, 409, origin);

        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(password);
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)`).bind(userId, email, passwordHash),
          env.DB.prepare(`INSERT INTO credits (user_id) VALUES (?)`).bind(userId),
        ]);

        const token = await createSession(env, userId);
        const user = await env.DB.prepare(
          `SELECT id, email, plan, trial_started_at, trial_ends_at,
                  subscription_started_at, subscription_expires_at, created_at
           FROM users WHERE id = ?`,
        ).bind(userId).first<UserRow>();
        return response({ ok: true, token, user }, 201, origin);
      } catch (error) {
        console.error("register_error", error);
        return response({ error: "Unable to create account" }, 500, origin);
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJson(request);
      const email = normalizeEmail(body?.email);
      const password = body?.password;
      if (!email || typeof password !== "string") return response({ error: "Email and password are required" }, 400, origin);

      try {
        const user = await env.DB.prepare(
          `SELECT id, email, password_hash, plan, trial_started_at, trial_ends_at,
                  subscription_started_at, subscription_expires_at, created_at
           FROM users WHERE email = ?`,
        ).bind(email).first<UserRow & { password_hash: string }>();
        if (!user || !(await verifyPassword(password, user.password_hash))) {
          return response({ error: "Invalid email or password" }, 401, origin);
        }
        await ensureCreditsRow(env, user.id);
        const token = await createSession(env, user.id);
        const { password_hash: _passwordHash, ...safeUser } = user;
        return response({ ok: true, token, user: safeUser }, 200, origin);
      } catch (error) {
        console.error("login_error", error);
        return response({ error: "Unable to sign in" }, 500, origin);
      }
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      try {
        const user = await authenticatedUser(request, env);
        if (!user) return response({ error: "Unauthorized" }, 401, origin);
        return response({
          ok: true,
          user: {
            id: user.id,
            email: user.email,
            plan: user.plan,
            trial_started_at: user.trial_started_at,
            trial_ends_at: user.trial_ends_at,
            subscription_started_at: user.subscription_started_at,
            subscription_expires_at: user.subscription_expires_at,
            created_at: user.created_at,
          },
        }, 200, origin);
      } catch (error) {
        console.error("auth_me_error", error);
        return response({ error: "Unable to load account" }, 500, origin);
      }
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const header = request.headers.get("authorization") ?? "";
      if (header.startsWith("Bearer ")) {
        const rawToken = header.slice(7).trim();
        if (rawToken) {
          const tokenHash = await sha256(rawToken);
          await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
        }
      }
      return response({ ok: true }, 200, origin);
    }

    if (url.pathname === "/api/account/credits" && request.method === "GET") {
      const user = await authenticatedUser(request, env);
      if (!user) return response({ error: "Unauthorized" }, 401, origin);
      try {
        const credits = await creditSummary(env, user.id);
        return response({ ok: true, credits }, 200, origin);
      } catch (error) {
        console.error("credits_error", error);
        return response({ error: "Unable to load credits" }, 500, origin);
      }
    }

    if (url.pathname === "/api/trial/activate" && request.method === "POST") {
      const user = await authenticatedUser(request, env);
      if (!user) return response({ error: "Unauthorized" }, 401, origin);

      const body = await readJson(request);
      const trialKey = typeof body?.trial_key === "string" ? body.trial_key.trim() : "";
      if (!trialKey || trialKey.length < 16 || trialKey.length > 256) {
        return response({ error: "Valid trial key is required" }, 400, origin);
      }

      try {
        const trialKeyHash = await sha256(trialKey);
        const key = await env.DB.prepare(
          `SELECT id, telegram_user_id FROM trial_keys
           WHERE trial_key_hash = ? AND used_by_user_id IS NULL`,
        ).bind(trialKeyHash).first<{ id: string; telegram_user_id: string }>();
        if (!key) return response({ error: "Invalid or already used trial key" }, 400, origin);

        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO telegram_verifications (user_id, telegram_user_id) VALUES (?, ?)`,
          ).bind(user.id, key.telegram_user_id),
          env.DB.prepare(
            `INSERT OR IGNORE INTO credits (user_id) VALUES (?)`,
          ).bind(user.id),
          env.DB.prepare(
            `UPDATE credits SET subscription_credits = subscription_credits + ?,
                    lifetime_earned = lifetime_earned + ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
          ).bind(FREE_TRIAL_CREDITS, FREE_TRIAL_CREDITS, user.id),
          env.DB.prepare(
            `INSERT INTO credit_ledger (id, user_id, type, amount, source_id, metadata)
             VALUES (?, ?, 'FREE_TRIAL_GRANT', ?, ?, ?)`,
          ).bind(crypto.randomUUID(), user.id, FREE_TRIAL_CREDITS, key.id, JSON.stringify({ telegram_user_id: key.telegram_user_id })),
          env.DB.prepare(
            `UPDATE trial_keys SET used_by_user_id = ?, used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_by_user_id IS NULL`,
          ).bind(user.id, key.id),
        ]);

        const credits = await creditSummary(env, user.id);
        return response({ ok: true, granted_credits: FREE_TRIAL_CREDITS, credits }, 200, origin);
      } catch (error) {
        console.error("trial_activation_error", error);
        return response({ error: "Trial activation failed or the Telegram identity has already claimed a trial" }, 409, origin);
      }
    }

    if (url.pathname === "/api/internal/trial-keys" && request.method === "POST") {
      if (!env.TRIAL_BOT_SECRET) return response({ error: "Trial key service is not configured" }, 503, origin);
      const provided = request.headers.get("x-trial-bot-secret") ?? "";
      if (provided !== env.TRIAL_BOT_SECRET) return response({ error: "Unauthorized" }, 401, origin);

      const body = await readJson(request);
      const telegramUserId = typeof body?.telegram_user_id === "string" ? body.telegram_user_id.trim() : "";
      if (!telegramUserId || telegramUserId.length > 128) return response({ error: "telegram_user_id is required" }, 400, origin);

      const rawKey = randomToken(TRIAL_KEY_BYTES);
      const keyHash = await sha256(rawKey);
      try {
        await env.DB.prepare(
          `INSERT INTO trial_keys (id, trial_key_hash, telegram_user_id) VALUES (?, ?, ?)`,
        ).bind(crypto.randomUUID(), keyHash, telegramUserId).run();
        return response({ ok: true, trial_key: rawKey }, 201, origin);
      } catch {
        return response({ error: "This Telegram identity has already been issued a trial key" }, 409, origin);
      }
    }

    if (url.pathname === "/api/chat/consume" && request.method === "POST") {
      const user = await authenticatedUser(request, env);
      if (!user) return response({ error: "Unauthorized" }, 401, origin);

      const body = await readJson(request);
      const prompt = typeof body?.prompt === "string" ? body.prompt : "";
      const wordCount = countWords(prompt);
      if (!prompt.trim()) return response({ error: "Prompt is required" }, 400, origin);
      if (wordCount > MAX_PROMPT_WORDS) {
        return response({ error: "PROMPT_TOO_LONG", max_words: MAX_PROMPT_WORDS, word_count: wordCount }, 400, origin);
      }

      const credits = await creditSummary(env, user.id);
      if (!credits || credits.total_usable_credits <= 0) {
        return response({ error: "INSUFFICIENT_CREDITS" }, 402, origin);
      }

      const source = await consumeCredit(env, user.id, JSON.stringify({ word_count: wordCount }));
      if (!source) return response({ error: "INSUFFICIENT_CREDITS" }, 402, origin);

      const remaining = await creditSummary(env, user.id);
      return response({ ok: true, credit_consumed_from: source, credits: remaining }, 200, origin);
    }

    return response({ error: "Not found" }, 404, origin);
  },
};
