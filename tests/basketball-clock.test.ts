import test from "node:test";
import assert from "node:assert/strict";
import { NativeClockMapper } from "../packages/basketball-core/src/index.ts";
test("native clock adapts after slow model warmup and preserves backlog age", () => {
  const clock = new NativeClockMapper();
  assert.equal(clock.map(0, 2000), 2000);
  assert.equal(clock.map(2000, 2050), 2050);
  assert.equal(clock.map(2100, 2150), 2150);
  assert.equal(clock.map(2200, 2900), 2250);
  clock.reset();
  assert.equal(clock.map(0, 3000), 3000);
  assert.throws(() => clock.map(NaN, 1));
});
