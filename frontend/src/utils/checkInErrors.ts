import type { VerificationError } from "@/utils/verificationErrors";

export function isLocationVerificationError(err: VerificationError | null): boolean {
  if (!err) return false;
  return (
    /location|gps/i.test(err.title) ||
    err.title === "Outside office area" ||
    err.title === "Location timed out" ||
    err.title === "GPS unavailable"
  );
}

export function isFaceVerificationError(err: VerificationError | null): boolean {
  if (!err) return false;
  return /face|recogniz|registered profile|not visible/i.test(err.title);
}

export class AttendanceSubmitError extends Error {
  errInfo: VerificationError;

  constructor(errInfo: VerificationError) {
    super(errInfo.message);
    this.name = "AttendanceSubmitError";
    this.errInfo = errInfo;
  }
}
