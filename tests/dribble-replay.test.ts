import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
test("offline CLI starts its session and reproduces a five-cycle reference", () => {
  const frames = Array.from({ length: 65 }, (_, i) => ({
    timestampMs: i * 50,
    width: 640,
    height: 480,
    mirrored: false,
    inferenceMs: 0,
    balls: [
      {
        x: 0.25,
        y: 0.5 - 0.22 * Math.cos((((i * 50) % 650) / 650) * 2 * Math.PI),
        width: 0.08,
        height: 0.1,
        confidence: 0.9,
      },
    ],
  }));
  const file = join(
    mkdtempSync(join(tmpdir(), "dribble-replay-")),
    "observations.json",
  );
  writeFileSync(file, JSON.stringify({ frames, expectedReps: 5 }));
  const result = spawnSync(
    process.execPath,
    ["scripts/replay-dribble.ts", file],
    { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.result.reps, 5);
  assert.equal(data.difference, 0);
  assert.equal(data.result.source, "video");
});
