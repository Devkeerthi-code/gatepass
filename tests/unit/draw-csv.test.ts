import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { drawWinners, seedFingerprint } from "@/lib/draw";

describe("giveaway draw", () => {
  const emails = Array.from({ length: 50 }, (_, i) => `fan${i}@college.edu`);

  it("is deterministic for the same seed and entries", () => {
    expect(drawWinners("seed-1", emails, 3)).toEqual(drawWinners("seed-1", [...emails].reverse(), 3));
  });

  it("changes with the seed", () => {
    expect(drawWinners("seed-1", emails, 3)).not.toEqual(drawWinners("seed-2", emails, 3));
  });

  it("never picks the same person twice, even with duplicate or mixed-case entries", () => {
    const winners = drawWinners("s", ["A@x.in", "a@x.in", "b@x.in"], 3);
    expect(winners).toHaveLength(2);
    expect(new Set(winners).size).toBe(2);
  });

  it("handles fewer entries than winners", () => {
    expect(drawWinners("s", ["only@x.in"], 5)).toEqual(["only@x.in"]);
    expect(drawWinners("s", [], 5)).toEqual([]);
  });

  it("publishes a fingerprint, not the seed", () => {
    expect(seedFingerprint("secret-seed")).toMatch(/^[0-9a-f]{64}$/);
    expect(seedFingerprint("secret-seed")).not.toContain("secret");
  });
});

describe("CSV export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Ravi, "R" K')).toBe('"Ravi, ""R"" K"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("builds rows with CRLF line endings", () => {
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\r\n1,\r\n");
  });
});
