import { describe, expect, it } from "vitest";
import {
  isFaceVerificationError,
  isLocationVerificationError,
} from "@/utils/checkInErrors";
import type { VerificationError } from "@/utils/verificationErrors";

describe("check-in error classification", () => {
  it("detects location errors", () => {
    const err: VerificationError = { title: "Location blocked", message: "x" };
    expect(isLocationVerificationError(err)).toBe(true);
    expect(isFaceVerificationError(err)).toBe(false);
  });

  it("detects outside office as location retry", () => {
    const err: VerificationError = { title: "Outside office area", message: "x" };
    expect(isLocationVerificationError(err)).toBe(true);
  });

  it("detects face errors", () => {
    const err: VerificationError = { title: "Face not recognized", message: "x" };
    expect(isFaceVerificationError(err)).toBe(true);
    expect(isLocationVerificationError(err)).toBe(false);
  });
});
