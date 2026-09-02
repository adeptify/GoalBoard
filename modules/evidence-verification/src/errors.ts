export class EvidenceVerificationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EvidenceVerificationError";
  }
}

export type EvidenceVerificationErrorFactory = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => Error;
