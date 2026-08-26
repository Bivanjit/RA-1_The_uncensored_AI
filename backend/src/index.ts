interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface Env {
  DB: {
    prepare(query: string): D1Statement;
  };
  ENVIRONMENT?: string;
  PUBLIC_ORIGIN?: string;
}

interface UserRow {
  id: string;
  email: string;
  plan: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
}

interface SessionUserRow extends UserRow {
  expires_at: string;
}

const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 30;

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

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
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

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
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
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
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
            u.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`,
  ).bind(tokenHash).first<SessionUserRow>();
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
      return response(
        {
          ok: true,
          service: "ra-1-api",
          environment: env.ENVIRONMENT ?? "development",
        },
        200,
        origin,
      );
    }

    if (url.pathname === "/api/db-health" && request.method === "GET") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return response(
          {
            ok: result?.ok === 1,
            database: "d1",
          },
          200,
          origin,
        );
      } catch {
        return response(
          {
            ok: false,
            database: "d1",
          },
          503,
          origin,
        );
      }
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

        await env.DB.prepare(
          `INSERT INTO users (id, email, password_hash)
           VALUES (?, ?, ?)`,
        ).bind(userId, email, passwordHash).run();

        const token = await createSession(env, userId);
        const user = await env.DB.prepare(
          `SELECT id, email, plan, trial_started_at, trial_ends_at, created_at
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

      if (!email || typeof password !== "string") {
        return response({ error: "Email and password are required" }, 400, origin);
      }

      try {
        const user = await env.DB.prepare(
          `SELECT id, email, password_hash, plan, trial_started_at, trial_ends_at, created_at
           FROM users WHERE email = ?`,
        ).bind(email).first<UserRow & { password_hash: string }>();

        if (!user || !(await verifyPassword(password, user.password_hash))) {
          return response({ error: "Invalid email or password" }, 401, origin);
        }

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

        return response(
          {
            ok: true,
            user: {
              id: user.id,
              email: user.email,
              plan: user.plan,
              trial_started_at: user.trial_started_at,
              trial_ends_at: user.trial_ends_at,
              created_at: user.created_at,
            },
          },
          200,
          origin,
        );
      } catch (error) {
        console.error("auth_me_error", error);
        return response({ error: "Unable to load account" }, 500, origin);
      }
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const header = request.headers.get("authorization") ?? "";
      if (!header.startsWith("Bearer ")) return response({ ok: true }, 200, origin);

      const rawToken = header.slice(7).trim();
      if (rawToken) {
        const tokenHash = await sha256(rawToken);
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
      }

      return response({ ok: true }, 200, origin);
    }

    return response({ error: "Not found" }, 404, origin);
  },
};
