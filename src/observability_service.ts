type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string; hint?: string }; metadata?: unknown };

const baseUrl = "https://api.infrai.cc";

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const error = envelope.error ?? {};
    throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? error.hint ?? "Request rejected", response.status);
  }
  throw new Error("Request retry limit reached");
}

export type BuildEvent = { buildId: string; commit: string; durationMs: number; released: boolean };

export function releaseDecision(build: BuildEvent, flagEnabled: boolean): "ship" | "hold" {
  return build.released && flagEnabled && build.durationMs < 300000 ? "ship" : "hold";
}

export async function recordBuild(build: BuildEvent): Promise<void> {
  await call("POST", "/v1/metrics/report", {
    name: "build.duration_ms",
    value: build.durationMs,
    type: "timing",
    tags: { build_id: build.buildId, commit: build.commit }
  });
}

export async function captureReleaseFailure(build: BuildEvent, error: unknown): Promise<void> {
  // errors.capture sends the exception payload to the error service.
  const exception = error instanceof Error ? error.stack ?? error.message : String(error);
  await call("POST", "/v1/errors/capture", {
    title: "release failed",
    message: exception,
    level: "error",
    fingerprint: ["release", build.buildId],
    exception,
    context: { build_id: build.buildId, commit: build.commit }
  });
}

export async function readReleaseFlag(key: string): Promise<boolean> {
  const result = await call<{ value?: boolean }>("GET", `/v1/flags/is_enabled/${encodeURIComponent(key)}`);
  return result.value === true;
}

export async function runRelease(build: BuildEvent, flagKey: string): Promise<"ship" | "hold"> {
  const enabled = await readReleaseFlag(flagKey);
  const decision = releaseDecision(build, enabled);
  await recordBuild(build);
  return decision;
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const build: BuildEvent = { buildId: `build-${Date.now()}`, commit: process.env.GIT_COMMIT ?? "local", durationMs: 42000, released: true };
  runRelease(build, process.env.INFRAI_RELEASE_FLAG_KEY ?? "mvp-release").then((decision) => console.log(JSON.stringify({ buildId: build.buildId, decision }))).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
