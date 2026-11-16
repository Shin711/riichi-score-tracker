import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isScheduledQuizHour, quizHour } from "@/lib/quiz/schedule";

/**
 * Each quiz job runs at two UTC hours; exactly one of them must land on the
 * Eastern hour, summer and winter alike, and on the days the clocks change.
 */
function runsAt(at: string, utcHours: number[], day: [number, number, number]): number[] {
  const [y, m, d] = day;
  return utcHours.filter((h) => isScheduledQuizHour(at, new Date(Date.UTC(y, m - 1, d, h, 30))));
}

describe("quiz cron daylight saving", () => {
  const days: Array<[string, [number, number, number]]> = [
    ["summer (EDT)", [2026, 7, 15]],
    ["winter (EST)", [2026, 1, 15]],
    ["spring forward day", [2026, 3, 8]],
    ["fall back day", [2026, 11, 1]],
  ];

  for (const [label, day] of days) {
    it(`posts exactly once at 10am Eastern — ${label}`, () => {
      assert.equal(runsAt("10", [14, 15], day).length, 1);
    });
  }

  it("uses 14:00 UTC in summer and 15:00 UTC in winter for the post", () => {
    assert.deepEqual(runsAt("10", [14, 15], [2026, 7, 15]), [14]);
    assert.deepEqual(runsAt("10", [14, 15], [2026, 1, 15]), [15]);
  });

  it("reveals exactly once at 10pm Eastern, summer and winter", () => {
    // 02/03 UTC is the evening before in Eastern time.
    assert.deepEqual(runsAt("22", [2, 3], [2026, 7, 16]), [2]);
    assert.deepEqual(runsAt("22", [2, 3], [2026, 1, 16]), [3]);
    // The night the clocks fall back (Sat Oct 31 → Sun Nov 1, 2026).
    assert.equal(runsAt("22", [2, 3], [2026, 11, 1]).length, 1);
  });

  it("always runs when called by hand without an hour", () => {
    assert.equal(isScheduledQuizHour(null, new Date(Date.UTC(2026, 0, 1, 7))), true);
  });

  it("reads midnight as hour 0", () => {
    assert.equal(quizHour(new Date(Date.UTC(2026, 0, 15, 5, 0))), 0);
  });
});
