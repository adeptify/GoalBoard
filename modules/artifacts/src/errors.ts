export type ArtifactsErrorFactory = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => Error;

export class ArtifactsError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ArtifactsError";
    this.code = code;
    this.details = details;
  }
}

export const defaultArtifactsErrorFactory: ArtifactsErrorFactory = (code, message, details) =>
  new ArtifactsError(code, message, details);
