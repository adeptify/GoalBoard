export class GoalBoardV1Error extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GoalBoardV1Error";
  }
}
