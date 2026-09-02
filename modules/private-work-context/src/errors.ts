import type { PrivateWorkContextErrorCode } from "@adeptify/goalboard-contracts/modules/private-work-context";

export class PrivateWorkContextError extends Error {
  constructor(
    readonly code: PrivateWorkContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoalBoardSessionError";
  }
}

/** Compatibility name retained while old Session callers move to the Module API. */
export { PrivateWorkContextError as GoalBoardSessionError };
