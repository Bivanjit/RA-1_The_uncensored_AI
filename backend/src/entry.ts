import baseWorker from "./index";

interface InferenceEnv {
  INFERENCE_URL?: string;
  RA1_ACCESS_CODE?: string;
  PUBLIC_ORIGIN?: string;
  CHAT_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  [key: string]: unknown;
}

const MAX_PROMPT_WORDS = 1000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_INFERENCE_RESPONSE_CHARS = 100_000;

function countWords(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function corsOrigin(request: Request, env: InferenceEnv): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (env.PUBLIC_ORIGIN) return origin === env.PUBLIC_ORIGIN ? origin : null;
  return origin;
}

function responseHeaders(request: Request, env: InferenceEnv, contentType = "application/json; charset=utf-8"): Headers {
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  const origin = corsOrigin(request, env);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type, authorization, x-ra1-access-code");
    headers.set("vary", "Origin");
  }
  return headers;
}

function jsonResponse(request: Request, env: InferenceEnv, body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request, env),
  });
}

function sseResponse(request: Request, env: InferenceEnv, content: string): Response {
  const payload = [
    `data: ${JSON.stringify({ message: { role: "assistant", content }, done: true })}`,
    "data: [DONE]",
    "",
    "",
  ].join("\n");
  return new Response(payload, {
    status: 200,
    headers: responseHeaders(request, env, "text/event-stream; charset=utf-8"),
  });
}

function internalRequest(request: Request, pathname: string, method = "GET", body?: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  const headers = new Headers(request.headers);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(url.toString(), { method, headers, body });
}

function buildPrompt(messages: unknown): { prompt: string; wordCount: number } | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;

  const normalized = messages
    .filter((item): item is { role: string; content: string } => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      return typeof value.role === "string" && typeof value.content === "string";
    })
    .map((item) => ({
      role: item.role.slice(0, 32),
      content: item.content.slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((item) => item.content.trim());

  if (!normalized.length) return null;

  const prompt = normalized
    .map((item) => `${item.role.toUpperCase()}:\n${item.content}`)
    .join("\n\n")
    .trim();

  return { prompt, wordCount: countWords(prompt) };
}

function cleanInferenceOutput(value: string): string {
  let cleaned = value.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/^\s*<think>[\s\S]*$/i, "");
  return cleaned.trim();
}

async function accessCodeAllowed(request: Request, env: InferenceEnv): Promise<boolean> {
  if (!env.RA1_ACCESS_CODE) return false;
  const provided = request.headers.get("x-ra1-access-code") ?? "";
  if (provided.length < 8 || provided.length > 256) return false;
  if (provided !== env.RA1_ACCESS_CODE) return false;

  if (env.CHAT_LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    try {
      const limited = await env.CHAT_LIMITER.limit({ key: `access-chat:${ip}` });
      if (!limited.success) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export default {
  async fetch(request: Request, env: InferenceEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/chat") {
      return baseWorker.fetch(request, env as never);
    }

    if (request.method === "OPTIONS") {
      const headers = responseHeaders(request, env);
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return jsonResponse(request, env, { error: "Method not allowed" }, 405);
    }

    const origin = request.headers.get("origin");
    if (env.PUBLIC_ORIGIN && origin && origin !== env.PUBLIC_ORIGIN) {
      return jsonResponse(request, env, { error: "Origin not allowed" }, 403);
    }

    let body: Record<string, unknown>;
    try {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        return jsonResponse(request, env, { error: "JSON body required" }, 400);
      }
      body = await request.json() as Record<string, unknown>;
    } catch {
      return jsonResponse(request, env, { error: "Invalid JSON body" }, 400);
    }

    const built = buildPrompt(body.messages);
    if (!built) return jsonResponse(request, env, { error: "Invalid messages" }, 400);
    if (built.wordCount > MAX_PROMPT_WORDS) {
      return jsonResponse(request, env, {
        error: "PROMPT_TOO_LONG",
        max_words: MAX_PROMPT_WORDS,
        word_count: built.wordCount,
      }, 400);
    }

    if (!env.INFERENCE_URL) {
      return jsonResponse(request, env, { error: "Inference service is not configured" }, 503);
    }

    const accessMode = await accessCodeAllowed(request, env);
    let authenticated = false;

    if (!accessMode) {
      const authResponse = await baseWorker.fetch(internalRequest(request, "/api/auth/me"), env as never);
      if (!authResponse.ok) return authResponse;
      authenticated = true;

      const creditsResponse = await baseWorker.fetch(internalRequest(request, "/api/account/credits"), env as never);
      if (!creditsResponse.ok) return creditsResponse;
      let creditsData: Record<string, unknown>;
      try {
        creditsData = await creditsResponse.json() as Record<string, unknown>;
      } catch {
        return jsonResponse(request, env, { error: "Unable to verify credits" }, 502);
      }
      const credits = creditsData.credits as Record<string, unknown> | undefined;
      if (!credits || Number(credits.total_usable_credits ?? 0) <= 0) {
        return jsonResponse(request, env, { error: "INSUFFICIENT_CREDITS" }, 402);
      }
    }

    const inferenceBase = env.INFERENCE_URL.replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let inferenceResponse: Response;
    try {
      inferenceResponse = await fetch(`${inferenceBase}/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify({ prompt: built.prompt }),
        signal: controller.signal,
      });
    } catch {
      return jsonResponse(request, env, { error: "INFERENCE_UNAVAILABLE" }, 503);
    } finally {
      clearTimeout(timeout);
    }

    if (!inferenceResponse.ok) {
      return jsonResponse(request, env, { error: "INFERENCE_FAILED" }, 502);
    }

    let inferenceData: Record<string, unknown>;
    try {
      inferenceData = await inferenceResponse.json() as Record<string, unknown>;
    } catch {
      return jsonResponse(request, env, { error: "Invalid inference response" }, 502);
    }

    const rawGenerated = typeof inferenceData.response === "string" ? inferenceData.response : "";
    if (!rawGenerated || rawGenerated.length > MAX_INFERENCE_RESPONSE_CHARS) {
      return jsonResponse(request, env, { error: "Invalid inference output" }, 502);
    }

    const generated = cleanInferenceOutput(rawGenerated);
    if (!generated) {
      return jsonResponse(request, env, { error: "MODEL_RETURNED_REASONING_ONLY" }, 502);
    }

    if (authenticated) {
      const consumeResponse = await baseWorker.fetch(
        internalRequest(request, "/api/chat/consume", "POST", JSON.stringify({ prompt: built.prompt })),
        env as never,
      );
      if (!consumeResponse.ok) return consumeResponse;
    }

    const wantsStream = body.stream === true;
    if (wantsStream) return sseResponse(request, env, generated);

    return jsonResponse(request, env, {
      ok: true,
      message: { role: "assistant", content: generated },
      model: "ra-1-remote",
    }, 200);
  },
};
