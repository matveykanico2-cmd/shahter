/**
 * Mirrors the small slice of Prisma's error shape the app relies on
 * (see src/shared/lib/db/prisma-errors.ts, which duck-types on `.code`).
 */
export class JsonDbKnownRequestError extends Error {
  code: string
  meta?: { target?: string[] }

  constructor(message: string, code: string, meta?: { target?: string[] }) {
    super(message)
    this.name = "JsonDbKnownRequestError"
    this.code = code
    this.meta = meta
  }
}

export function uniqueConstraintError(target: string[]): JsonDbKnownRequestError {
  return new JsonDbKnownRequestError(
    `Unique constraint failed on the fields: (${target.join(", ")})`,
    "P2002",
    { target }
  )
}

export function recordNotFoundError(): JsonDbKnownRequestError {
  return new JsonDbKnownRequestError("Record to update/delete not found", "P2025")
}
