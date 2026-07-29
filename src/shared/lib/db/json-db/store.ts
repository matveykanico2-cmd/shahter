import { AsyncLocalStorage } from "node:async_hooks"
import fs from "node:fs/promises"
import path from "node:path"

import { MANY_TO_MANY_JOIN_TABLES, MODELS } from "./schema"

export type Row = Record<string, unknown>
export type Database = Record<string, Row[]>

const DB_PATH = process.env.JSON_DB_PATH
  ? path.resolve(process.env.JSON_DB_PATH)
  : path.join(process.cwd(), "storage", "db.json")

const COLLECTION_KEYS = [
  ...Object.values(MODELS).map((model) => model.collection),
  ...MANY_TO_MANY_JOIN_TABLES,
]

function emptyDatabase(): Database {
  const db: Database = {}
  for (const key of COLLECTION_KEYS) {
    db[key] = []
  }
  return db
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error) && typeof error === "object" && "code" in (error as object)
}

function reviveDates(db: Database) {
  for (const model of Object.values(MODELS)) {
    if (model.dateFields.length === 0) continue
    for (const row of db[model.collection]) {
      for (const field of model.dateFields) {
        const value = row[field]
        if (typeof value === "string") {
          row[field] = new Date(value)
        }
      }
    }
  }
}

async function loadFromDisk(): Promise<Database> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8")
    const parsed = raw.trim() ? (JSON.parse(raw) as Partial<Database>) : {}
    const db = emptyDatabase()
    for (const key of COLLECTION_KEYS) {
      const value = parsed[key]
      if (Array.isArray(value)) {
        db[key] = value
      }
    }
    reviveDates(db)
    return db
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return emptyDatabase()
    }
    throw error
  }
}

let dbCache: Database | null = null
let dbPromise: Promise<Database> | null = null

export async function getDb(): Promise<Database> {
  if (dbCache) {
    return dbCache
  }
  if (!dbPromise) {
    dbPromise = loadFromDisk().then((db) => {
      dbCache = db
      return db
    })
  }
  return dbPromise
}

async function writeToDisk(db: Database) {
  const dir = path.dirname(DB_PATH)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = `${DB_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), "utf8")
  await fs.rename(tmpPath, DB_PATH)
}

let writeQueue: Promise<void> = Promise.resolve()

/** Schedules the current in-memory state to be flushed to disk, serialized after prior writes. */
export function persist(): Promise<void> {
  const db = dbCache
  if (!db) {
    return writeQueue
  }
  writeQueue = writeQueue.then(
    () => writeToDisk(db),
    () => writeToDisk(db)
  )
  return writeQueue
}

let mutex: Promise<unknown> = Promise.resolve()
const lockContext = new AsyncLocalStorage<true>()

/**
 * Serializes mutating operations (and transactions) against the in-memory database.
 * Reentrant: a `$transaction` callback calling `tx.model.method()` runs inside the same
 * async context established by the outer `withLock`, so it executes inline instead of
 * re-queuing behind itself (which would deadlock).
 */
export function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  if (lockContext.getStore()) {
    return Promise.resolve().then(fn)
  }

  const run = mutex.then(
    () => lockContext.run(true, fn),
    () => lockContext.run(true, fn)
  )
  mutex = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export function nextId(rows: Row[]): number {
  let max = 0
  for (const row of rows) {
    const id = row.id
    if (typeof id === "number" && id > max) {
      max = id
    }
  }
  return max + 1
}

export function cloneDb(db: Database): Database {
  return JSON.parse(JSON.stringify(db)) as Database
}
