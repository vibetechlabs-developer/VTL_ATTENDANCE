import { describe, expect, it } from "vitest";
import {
  geolocationErrorMessage,
  validateCoordinates,
} from "@/utils/geolocation";

describe("validateCoordinates", () => {
  it("accepts valid Ahmedabad coordinates", () => {
    expect(() => validateCoordinates(23.0225, 72.5714)).not.toThrow();
  });

  it("rejects NaN", () => {
    expect(() => validateCoordinates(Number.NaN, 72)).toThrow(/unavailable/i);
  });

  it("rejects out of range latitude", () => {
    expect(() => validateCoordinates(95, 72)).toThrow(/unavailable/i);
  });
});

describe("geolocationErrorMessage", () => {
  it("maps permission denied", () => {
    expect(geolocationErrorMessage(1)).toMatch(/permission denied/i);
  });

  it("maps timeout", () => {
    expect(geolocationErrorMessage(3)).toMatch(/timeout/i);
  });
});
