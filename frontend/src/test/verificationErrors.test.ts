import { describe, expect, it } from "vitest";
import {
  inferApiErrorContext,
  parseVerificationApiError,
  toVerificationError,
} from "@/utils/verificationErrors";

describe("toVerificationError", () => {
  it("maps location permission denied", () => {
    const err = toVerificationError("location permission denied", "check-in", "location");
    expect(err.title).toBe("Location blocked");
    expect(err.tips?.length).toBeGreaterThan(2);
  });

  it("maps face mismatch", () => {
    const err = toVerificationError("face does not match", "check-in", "face");
    expect(err.title).toBe("Face not recognized");
  });

  it("maps outside office", () => {
    const err = toVerificationError("outside office radius", "check-in", "location");
    expect(err.title).toBe("Outside office area");
  });
});

describe("parseVerificationApiError", () => {
  it("handles outside_office code", () => {
    const err = parseVerificationApiError(
      400,
      { error: "outside", code: "outside_office", distance_meters: 450 },
      "",
      "check-in",
      "location",
    );
    expect(err.title).toBe("Outside office area");
    expect(err.message).toContain("450");
  });

  it("handles face_mismatch code", () => {
    const err = parseVerificationApiError(
      400,
      { error: "x", code: "face_mismatch" },
      "",
      "check-in",
      "face",
    );
    expect(err.title).toBe("Face not recognized");
  });

  it("handles face_not_registered code", () => {
    const err = parseVerificationApiError(
      400,
      { error: "x", code: "face_not_registered" },
      "",
      "check-in",
      "face",
    );
    expect(err.title).toBe("Face not set up");
  });
});

describe("inferApiErrorContext", () => {
  it("returns location for outside_office code", () => {
    expect(inferApiErrorContext({ code: "outside_office" })).toBe("location");
  });

  it("returns face for face_mismatch code", () => {
    expect(inferApiErrorContext({ code: "face_mismatch" })).toBe("face");
  });
});
