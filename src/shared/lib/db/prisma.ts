import { createDbClient, type AnyObj } from "./json-db/engine"

/** Loose row shape returned by the JSON store's query engine (no generated client to derive precise types from). */
export type DbRow = AnyObj

const globalForDb = globalThis as unknown as {
  jsonDbClient?: ReturnType<typeof createDbClient>
}

export const prisma = globalForDb.jsonDbClient ?? createDbClient()

if (process.env.NODE_ENV !== "production") {
  globalForDb.jsonDbClient = prisma
}
