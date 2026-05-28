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

/**
 * Signals that a command's arguments were missing or malformed, so the reply
 * should include that command's usage. An empty message means "show usage
 * only"; a non-empty message is shown above the usage block as the reason.
 */
export class InvalidInputError extends UserInputError {
  override name = "InvalidInputError";

  constructor(message = "", context: Record<string, string | number | boolean | bigint> = {}) {
    super(message, context);
  }
}
