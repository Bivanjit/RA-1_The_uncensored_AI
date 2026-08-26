interface Env {
  DB: {
    prepare(query: string): {
      first<T = unknown>(): Promise<T | null>;
    };
  };
  ENVIRONMENT?: string;
  PUBLIC_ORIGIN?: string;
}

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.PUBLIC_ORIGIN;

    if (request.method === "OPTIONS") {
      const headers = new Headers();
      headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
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

    return response({ error: "Not found" }, 404, origin);
  },
};
