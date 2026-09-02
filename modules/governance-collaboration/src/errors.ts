export type GovernanceErrorFactory = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => Error;

export class GovernanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GovernanceError";
  }
}
