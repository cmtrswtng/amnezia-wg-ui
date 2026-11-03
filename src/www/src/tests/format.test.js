import { describe, expect, it } from "vitest";
import { formatBytes } from "../utils/format";

describe("transfer rate formatting", () => {
  it.each([
    [0, "0 B"],
    [0.5, "0.5 B"],
    [0.1, "0.1 B"],
    [1, "1 B"],
    [1024, "1 KB"],
  ])("formats %s bytes with a valid unit", (value, expected) => {
    expect(formatBytes(value, 1)).toBe(expected);
  });
});
