import test from "node:test";
import assert from "node:assert/strict";
import { releaseDecision } from "./observability_service.ts";

test("ships a released, enabled build that completed within the five-minute budget", () => {
  const build = { buildId: "b-17", commit: "abc123", durationMs: 120000, released: true };
  assert.equal(releaseDecision(build, true), "ship");
  assert.equal(releaseDecision({ ...build, durationMs: 360000 }, true), "hold");
  assert.equal(releaseDecision(build, false), "hold");
});
