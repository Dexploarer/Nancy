export class AppError extends Error {
  constructor(
    message: string,
    readonly context: Record<string, string | number | boolean | bigint> = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UserInputError extends AppError {
  override name = "UserInputError";
}
