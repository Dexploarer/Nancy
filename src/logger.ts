import pino from "pino";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: null
});

type LogContext = Record<string, string | number | boolean | bigint | Error | undefined>;

export class Logger {
  static info(message: string, context: LogContext = {}): void {
    logger.info(context, message);
  }

  static warn(message: string, context: LogContext = {}): void {
    logger.warn(context, message);
  }

  static error(message: string, context: LogContext = {}): void {
    logger.error(context, message);
  }

  static debug(message: string, context: LogContext = {}): void {
    logger.debug(context, message);
  }
}
