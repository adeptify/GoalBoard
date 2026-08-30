export class FeedDomainError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "FeedDomainError";
  }
}
