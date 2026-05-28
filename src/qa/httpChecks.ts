import { AppError } from "../domain/errors.js";

type HttpOkInput = {
  url: string;
  label: string;
  errorMessage: string;
  headers?: Record<string, string>;
  maxAttempts?: number;
};

export async function assertHttpOk(input: HttpOkInput): Promise<void> {
  const maxAttempts = input.maxAttempts === undefined ? 3 : input.maxAttempts;
  if (maxAttempts < 1) {
    throw new AppError("Invalid HTTP check attempts", { label: input.label, attempts: maxAttempts });
  }
  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(input.url, { headers: buildHeaders(input.headers) });
    if (response.ok) {
      return;
    }
    lastStatus = response.status;
    if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
      break;
    }
    await delay(attempt * 250);
  }
  throw new AppError(input.errorMessage, { label: input.label, status: lastStatus, attempts: maxAttempts });
}

function buildHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (headers === undefined) {
    return { Accept: "application/json" };
  }
  return { Accept: "application/json", ...headers };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
