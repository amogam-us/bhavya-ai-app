import type { ZodError, ZodType, ZodTypeDef } from 'zod';

/** An error with an HTTP status and a message that is safe to show to the user. */
export class HttpError extends Error {
  override name = 'HttpError';

  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }

  static badRequest(message: string, details?: string[]): HttpError {
    return new HttpError(400, message, details);
  }

  static notFound(message: string): HttpError {
    return new HttpError(404, message);
  }

  static conflict(message: string, details?: string[]): HttpError {
    return new HttpError(409, message, details);
  }
}

/** Validates `value` against `schema`, throwing a 400 with readable details. */
export function parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw HttpError.badRequest('Invalid request.', describeZodError(result.error));
  return result.data;
}

export function describeZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
