import { readFileSync, statSync } from "node:fs";
import {
  DribbleSession,
  decodeBallFrame,
} from "../packages/basketball-core/src/index.ts";
const path = process.argv[2];
if (!path) {
  console.error(
    "Usage: node scripts/replay-dribble.ts observations.json\nInput: { frames: BallFrame[], expectedReps?: number }. No video or network access.",
  );
  process.exit(1);
}
if (statSync(path).size > 10000000)
  throw new Error("Observation file exceeds 10 MB");
const input = JSON.parse(readFileSync(path, "utf8"));
if (
  !Array.isArray(input.frames) ||
  input.frames.length < 1 ||
  input.frames.length > 20000
)
  throw new Error("Expected 1–20000 frames");
if (
  input.expectedReps !== undefined &&
  (!Number.isSafeInteger(input.expectedReps) || input.expectedReps < 0)
)
  throw new Error("Invalid manual reference count");
const session = new DribbleSession("count", "video");
session.start(0);
let origin: number | null = null,
  last = -Infinity,
  detected = 0,
  multiple = 0;
for (const raw of input.frames) {
  const frame = decodeBallFrame(raw);
  if (frame.timestampMs <= last)
    throw new Error("Frames must have increasing timestamps");
  last = frame.timestampMs;
  origin ??= last;
  const time = last - origin;
  if (time >= 30000) break;
  session.accept({ ...frame, timestampMs: time }, time);
  if (session.status === "tracking") detected++;
  if (session.status === "multiple") multiple++;
}
session.finish(Math.min(30000, last - origin!));
console.log(
  JSON.stringify(
    {
      result: session.result,
      trackedFrames: detected,
      multipleBallFrames: multiple,
      ...(input.expectedReps === undefined
        ? {}
        : {
            manualReference: input.expectedReps,
            difference: session.result.reps - input.expectedReps,
          }),
    },
    null,
    2,
  ),
);
