import baseWorker from "./index";

interface InferenceEnv {
  INFERENCE_URL?: string;
  PUBLIC_ORIGIN?: string;
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

function copyHeaders(source: Headers, contentType = "application/json; charset=utf-8"): Headers {
  const headers = new Headers();
  const allow = source.get("access-control-allow-origin");
  const vary = source.get("vary");
  if (allow) headers.set("access-control-allow-origin", allow);
  if (vary) headers.set("vary", vary);
  for (const name of [
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "content-security-policy",
    "strict-transport-security",
  ]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  return headers;
}

function jsonResponse(body: Record<string, unknown>, status: number, source: Response): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: copyHeaders(source.headers),
  });
}

function sseResponse(content: string, source: Response): Response {
  const payload = [
    `data: ${JSON.stringify({ message: { role: "assistant", content }, done: true })}`,
    "data: [DONE]",
    "",
    "",
  ].join("\n");
  return new Response(payload, {
    status: 200,
    headers: copyHeaders(source.headers, "text/event-stream; charset=utf-8"),
  });
}

function internalRequest(request: Request, pathname: string, method = "GET", body?: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  const headers = new Headers(request.headers);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(url.toString(), {
    method,
    headers,
    body,
  });
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

export default {
  async fetch(request: Request, env: InferenceEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/chat") {
      return baseWorker.fetch(request, env as never);
    }

    if (request.method !== "POST") {
      return baseWorker.fetch(request, env as never);
    }

    // Reuse the existing authenticated session endpoint instead of duplicating auth logic.
    const authResponse = await baseWorker.fetch(internalRequest(request, "/api/auth/me"), env as never);
    if (!authResponse.ok) return authResponse;

    let body: Record<string, unknown>;
    try {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        return jsonResponse({ error: "JSON body required" }, 400, authResponse);
      }
      body = await request.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, authResponse);
    }

    const built = buildPrompt(body.messages);
    if (!built) return jsonResponse({ error: "Invalid messages" }, 400, authResponse);
    if (built.wordCount > MAX_PROMPT_WORDS) {
      return jsonResponse({ error: "PROMPT_TOO_LONG", max_words: MAX_PROMPT_WORDS, word_count: built.wordCount }, 400, authResponse);
    }

    if (!env.INFERENCE_URL) {
      return jsonResponse({ error: "Inference service is not configured" }, 503, authResponse);
    }

    // Check credits before spending GPU time. The existing /api/chat/consume endpoint
    // performs the authoritative atomic decrement after a successful inference.
    const creditsResponse = await baseWorker.fetch(internalRequest(request, "/api/account/credits"), env as never);
    if (!creditsResponse.ok) return creditsResponse;
    let creditsData: Record<string, unknown>;
    try {
      creditsData = await creditsResponse.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Unable to verify credits" }, 502, authResponse);
    }
    const credits = creditsData.credits as Record<string, unknown> | undefined;
    if (!credits || Number(credits.total_usable_credits ?? 0) <= 0) {
      return jsonResponse({ error: "INSUFFICIENT_CREDITS" }, 402, creditsResponse);
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
      return jsonResponse({ error: "INFERENCE_UNAVAILABLE" }, 503, authResponse);
    } finally {
      clearTimeout(timeout);
    }

    if (!inferenceResponse.ok) {
      return jsonResponse({ error: "INFERENCE_FAILED" }, 502, authResponse);
    }

    let inferenceData: Record<string, unknown>;
    try {
      inferenceData = await inferenceResponse.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid inference response" }, 502, authResponse);
    }

    const generated = typeof inferenceData.response === "string" ? inferenceData.response : "";
    if (!generated || generated.length > MAX_INFERENCE_RESPONSE_CHARS) {
      return jsonResponse({ error: "Invalid inference output" }, 502, authResponse);
    }

    // Charge only after the model successfully generated a response.
    const consumeBody = JSON.stringify({ prompt: built.prompt });
    const consumeResponse = await baseWorker.fetch(
      internalRequest(request, "/api/chat/consume", "POST", consumeBody),
      env as never,
    );
    if (!consumeResponse.ok) return consumeResponse;

    const wantsStream = body.stream === true;
    if (wantsStream) return sseResponse(generated, consumeResponse);

    return jsonResponse({
      ok: true,
      message: { role: "assistant", content: generated },
      model: "ra-1-remote",
    }, 200, consumeResponse);
  },
};
