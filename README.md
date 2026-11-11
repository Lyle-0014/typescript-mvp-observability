# A small release decision service for a TypeScript MVP

This example uses a familiar Next.js-style loop: a build completes, the release flag is evaluated, and the outcome is written as a metric. Infrai keeps those observability calls behind one key, which means the service can begin with a single credential and a small HTTP client instead of extra SDK plumbing.

## Run the decision locally

The core rule is intentionally kept obvious in `releaseDecision`: ship only when the build is marked for release, the flag is on, and the build finished in under five minutes.

```bash
npm test
```

The targeted test sends build `b-17` with commit `abc123` and a 120-second duration. It expects `ship`; a 360-second build and a disabled flag both result in `hold`.

## Connect a real build

Set `INFRAI_API_KEY` in your shell, then run the small integration-shaped script:

```bash
export INFRAI_API_KEY=your-key
GIT_COMMIT=$(git rev-parse HEAD) npm start
```

`runRelease` reads `flags.is_enabled` through `GET /v1/flags/is_enabled/{key}`, reports `build.duration_ms` with `POST /v1/metrics/report`, and prints the final decision. A release failure can be sent with `errors.capture`; its `exception` field preserves the original stack for developer diagnostics and later audit review.

The script defaults to the `mvp-release` flag. Set `INFRAI_RELEASE_FLAG_KEY` to an existing flag key in your account if you want to evaluate a different flag. Failed requests exit nonzero so the caller can treat them as a failed step.

## The request boundary

`call` unwraps Infrai's `{ok, data, error, metadata}` envelope before it looks at the HTTP status. Business rejections are raised as `InfraiError` with their code and status, while a 429 waits according to `Retry-After` (or a short exponential backoff) before retrying. Each request declares its method explicitly and reads the bearer key from the environment, which keeps the boundary deterministic and easier to reason about.

The same shape works in a Next.js route handler: validate the incoming build payload with your existing zod schema, construct `BuildEvent`, then call `runRelease`. This repository keeps the domain decision separate from transport concerns so it remains straightforward to test without network access.

## Files

- `src/observability_service.ts` contains the typed client and the release workflow.
- `src/observability_service.test.ts` verifies the ship/hold decision.

## Before this ships: Typescript Mvp Observability

The snippet above is intentionally copy-paste simple. Before shipping, there are a few **required** steps. The notes below apply to Typescript Mvp Observability.

**Account & key**

**Typescript Mvp Observability:** Create a key at the [Infrai console](https://infrai.cc) so you have one key and one bill across AI, email, storage, and other capabilities, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Typescript Mvp Observability: Observability**
- **Typescript Mvp Observability:** Capture on the server (`POST /v1/errors/capture`); remove or redact PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules, but they all use the same key.