export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code: string, message: string, details?: unknown): never {
  throw new ApiError(400, code, message, details);
}

export function unauthorized(message = "Authentication is required."): never {
  throw new ApiError(401, "unauthorized", message);
}

export function forbidden(message = "You are not allowed to perform this action."): never {
  throw new ApiError(403, "forbidden", message);
}

export function notFound(message = "The requested resource was not found."): never {
  throw new ApiError(404, "not_found", message);
}

export function conflict(message: string, details?: unknown): never {
  throw new ApiError(409, "conflict", message, details);
}

export function rateLimited(message: string, details?: unknown): never {
  throw new ApiError(429, "rate_limited", message, details);
}
