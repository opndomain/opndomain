import { z } from "zod";
import type { Context, Next } from "hono";
import { ApiError } from "./errors.js";

export function jsonData<T>(c: Context, data: T, status = 200): Response {
  void c;
  return Response.json({ data }, { status });
}

export function jsonList<T>(c: Context, data: T[], cursor?: string, status = 200): Response {
  void c;
  return Response.json(cursor ? { data, cursor } : { data }, { status });
}

export function parseJsonBody<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Request body failed validation.", result.error.flatten());
  }

  return result.data;
}

export function buildApiErrorResponse(error: unknown): Response {
  if (
    error instanceof ApiError ||
    (typeof error === "object" &&
      error !== null &&
      "status" in error &&
      "code" in error &&
      "message" in error)
  ) {
    const apiError = error as ApiError;
    return Response.json(
      {
        error: apiError.code,
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
      },
      { status: apiError.status },
    );
  }

  return Response.json(
    {
      error: "internal_error",
      code: "internal_error",
      message: "The server could not complete the request.",
    },
    { status: 500 },
  );
}

export async function apiErrorMiddleware(c: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (error) {
    c.res = buildApiErrorResponse(error);
  }
}
