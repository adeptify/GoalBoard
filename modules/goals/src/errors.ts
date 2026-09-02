export class GoalsCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GoalsCommandError";
  }
}

export type GoalsErrorFactory = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => Error;

