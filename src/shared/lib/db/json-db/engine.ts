import { getModel, MODELS } from "./schema"
import type { Row, Database } from "./store"
import { cloneDb, getDb, nextId, persist, withLock } from "./store"
import { recordNotFoundError, uniqueConstraintError } from "./errors"
import type { RelationDef } from "./types"

// The JSON store has no generated client, so record shapes are intentionally loose; DbRow
// (re-exported from ./prisma) is the sanctioned escape hatch application code should reach for
// instead of writing `any` directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyObj = Record<string, any>

function isPlainObject(value: unknown): value is AnyObj {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
}

function toComparable(value: unknown): unknown {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") {
    const asDate = /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN
    return Number.isNaN(asDate) ? value : asDate
  }
  return value
}

function compareOrdered(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0
  return 0
}

function matchScalar(actual: unknown, condition: unknown): boolean {
  if (condition === null) {
    return actual === null || actual === undefined
  }

  if (!isPlainObject(condition)) {
    if (condition instanceof Date) {
      return toComparable(actual) === toComparable(condition)
    }
    return actual === condition
  }

  const knownOps = new Set([
    "equals",
    "not",
    "in",
    "notIn",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "startsWith",
    "endsWith",
    "mode",
  ])
  // A plain-object condition with no recognized operator keys is not a valid scalar filter
  // (e.g. a compound-unique pseudo-field's {field1, field2} shape leaking in here) — treat it
  // as a non-match rather than vacuously matching every row.
  if (!Object.keys(condition).some((key) => knownOps.has(key))) {
    return false
  }

  for (const [op, raw] of Object.entries(condition)) {
    switch (op) {
      case "equals":
        if (!matchScalar(actual, raw)) return false
        break
      case "not":
        if (matchScalar(actual, raw)) return false
        break
      case "in":
        if (!Array.isArray(raw) || !raw.some((item) => matchScalar(actual, item))) return false
        break
      case "notIn":
        if (Array.isArray(raw) && raw.some((item) => matchScalar(actual, item))) return false
        break
      case "gt":
        if (compareOrdered(toComparable(actual), toComparable(raw)) <= 0) return false
        break
      case "gte":
        if (compareOrdered(toComparable(actual), toComparable(raw)) < 0) return false
        break
      case "lt":
        if (compareOrdered(toComparable(actual), toComparable(raw)) >= 0) return false
        break
      case "lte":
        if (compareOrdered(toComparable(actual), toComparable(raw)) > 0) return false
        break
      case "contains":
      case "startsWith":
      case "endsWith": {
        const mode = (condition as AnyObj).mode
        const haystack = typeof actual === "string" ? actual : ""
        const needle = typeof raw === "string" ? raw : ""
        const h = mode === "insensitive" ? haystack.toLowerCase() : haystack
        const n = mode === "insensitive" ? needle.toLowerCase() : needle
        if (op === "contains" && !h.includes(n)) return false
        if (op === "startsWith" && !h.startsWith(n)) return false
        if (op === "endsWith" && !h.endsWith(n)) return false
        break
      }
      case "mode":
        break
      default:
        break
    }
  }

  return true
}

function getRelated(modelName: string, record: Row, relationField: string, db: Database): Row | Row[] | null {
  const model = getModel(modelName)
  const relation = model.relations[relationField]
  if (!relation) return null

  if (relation.kind === "belongsTo") {
    const fk = record[relation.foreignKey]
    if (fk === null || fk === undefined) return null
    const targetModel = getModel(relation.target)
    return db[targetModel.collection].find((row) => row.id === fk) ?? null
  }

  if (relation.kind === "hasMany") {
    const targetModel = getModel(relation.target)
    const id = record.id
    return db[targetModel.collection].filter((row) => row[relation.foreignKey] === id)
  }

  // manyToMany
  const targetModel = getModel(relation.target)
  const joinRows = db[relation.join].filter((row) => row[relation.thisKey] === record.id)
  const otherIds = new Set(joinRows.map((row) => row[relation.otherKey]))
  return db[targetModel.collection].filter((row) => otherIds.has(row.id))
}

function matchWhere(modelName: string, record: Row | null, where: AnyObj | undefined, db: Database): boolean {
  if (!where) return true
  if (!record) return false

  const model = getModel(modelName)

  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue

    if (key === "OR") {
      const clauses = condition as AnyObj[]
      if (!clauses.some((clause) => matchWhere(modelName, record, clause, db))) return false
      continue
    }
    if (key === "AND") {
      const clauses = condition as AnyObj[]
      if (!clauses.every((clause) => matchWhere(modelName, record, clause, db))) return false
      continue
    }
    if (key === "NOT") {
      const clauses = Array.isArray(condition) ? (condition as AnyObj[]) : [condition as AnyObj]
      if (clauses.some((clause) => matchWhere(modelName, record, clause, db))) return false
      continue
    }

    const relation = model.relations[key]
    if (relation) {
      const related = getRelated(modelName, record, key, db)
      const cond = condition as AnyObj

      if (relation.kind === "belongsTo") {
        if (!matchWhere(relation.target, related as Row | null, cond, db)) return false
        continue
      }

      const relatedRows = (related as Row[]) ?? []
      if (isPlainObject(cond) && "some" in cond) {
        if (!relatedRows.some((row) => matchWhere(relation.target, row, cond.some as AnyObj, db))) return false
      } else if (isPlainObject(cond) && "every" in cond) {
        if (!relatedRows.every((row) => matchWhere(relation.target, row, cond.every as AnyObj, db))) return false
      } else if (isPlainObject(cond) && "none" in cond) {
        if (relatedRows.some((row) => matchWhere(relation.target, row, cond.none as AnyObj, db))) return false
      }
      continue
    }

    if (!matchScalar(record[key], condition)) return false
  }

  return true
}

function shapeCount(modelName: string, record: Row, countSelect: AnyObj, db: Database): AnyObj {
  const model = getModel(modelName)
  const select = countSelect.select as AnyObj | undefined
  const fields = select ? Object.keys(select).filter((key) => select[key]) : Object.keys(model.relations)
  const out: AnyObj = {}
  for (const field of fields) {
    const relation = model.relations[field]
    if (!relation) continue
    const related = getRelated(modelName, record, field, db)
    out[field] = Array.isArray(related) ? related.length : related ? 1 : 0
  }
  return out
}

function resolveIncludeOrSelectRelation(
  modelName: string,
  record: Row,
  fieldName: string,
  args: unknown,
  db: Database
): unknown {
  const model = getModel(modelName)
  const relation = model.relations[fieldName]
  if (!relation) return undefined

  const nested = isPlainObject(args) ? (args as AnyObj) : {}
  const related = getRelated(modelName, record, fieldName, db)

  if (relation.kind === "belongsTo") {
    if (!related) return null
    return shapeRecordFull(relation.target, related as Row, nested, db)
  }

  let rows = (related as Row[]).slice()
  if (nested.where) {
    rows = rows.filter((row) => matchWhere(relation.target, row, nested.where, db))
  }
  if (nested.orderBy) {
    rows = sortRows(rows, nested.orderBy)
  }
  if (typeof nested.skip === "number") {
    rows = rows.slice(nested.skip)
  }
  if (typeof nested.take === "number") {
    rows = rows.slice(0, nested.take)
  }
  return rows.map((row) => shapeRecordFull(relation.target, row, nested, db))
}

function shapeRecordFull(modelName: string, record: Row, args: AnyObj | undefined, db: Database): AnyObj {
  const model = getModel(modelName)
  const select = args?.select as AnyObj | undefined
  const include = args?.include as AnyObj | undefined

  if (select) {
    const out: AnyObj = {}
    for (const [key, value] of Object.entries(select)) {
      if (!value) continue
      if (key === "_count") {
        out._count = shapeCount(modelName, record, value as AnyObj, db)
        continue
      }
      if (model.relations[key]) {
        out[key] = resolveIncludeOrSelectRelation(modelName, record, key, value, db)
        continue
      }
      out[key] = record[key]
    }
    return out
  }

  const out: AnyObj = { ...record }
  if (include) {
    for (const [key, value] of Object.entries(include)) {
      if (!value) continue
      if (key === "_count") {
        out._count = shapeCount(modelName, record, value as AnyObj, db)
        continue
      }
      if (model.relations[key]) {
        out[key] = resolveIncludeOrSelectRelation(modelName, record, key, value, db)
      }
    }
  }
  return out
}

function sortRows(rows: Row[], orderBy: AnyObj | AnyObj[]): Row[] {
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy]
  return rows.slice().sort((a, b) => {
    for (const clause of clauses) {
      for (const [field, direction] of Object.entries(clause)) {
        const av = toComparable(a[field])
        const bv = toComparable(b[field])
        if (av === bv) continue
        const dir = direction === "desc" ? -1 : 1
        if (av === undefined || av === null) return 1 * dir
        if (bv === undefined || bv === null) return -1 * dir
        return av! > bv! ? dir : -dir
      }
    }
    return 0
  })
}

function applyFindManyArgs(modelName: string, rows: Row[], args: AnyObj | undefined, db: Database): Row[] {
  let result = rows
  if (args?.where) {
    result = result.filter((row) => matchWhere(modelName, row, args.where, db))
  }
  if (args?.orderBy) {
    result = sortRows(result, args.orderBy)
  }
  if (typeof args?.skip === "number") {
    result = result.slice(args.skip)
  }
  if (typeof args?.take === "number") {
    result = args.take >= 0 ? result.slice(0, args.take) : result.slice(args.take)
  }
  return result
}

function findUniqueMatch(modelName: string, rows: Row[], where: AnyObj, db: Database): Row | null {
  const model = getModel(modelName)
  const keys = Object.keys(where)

  // A single-key where matching a unique field, the id field, or a compound-unique
  // pseudo-field (e.g. "channelId_userId") definitively identifies the lookup: resolve it
  // directly instead of falling through to matchWhere, which doesn't understand compound-key
  // pseudo-fields and would otherwise treat them as vacuously true, matching the wrong row.
  if (keys.length === 1) {
    const [key] = keys
    const value = where[key]

    if (model.uniqueFields.includes(key) || key === model.idField) {
      return rows.find((row) => row[key] === value) ?? null
    }

    const compound = model.uniqueCompound.find((tuple) => tuple.join("_") === key)
    if (compound && isPlainObject(value)) {
      return rows.find((row) => compound.every((field) => row[field] === (value as AnyObj)[field])) ?? null
    }
  }

  return rows.find((row) => matchWhere(modelName, row, where, db)) ?? null
}

function checkUniqueConstraints(modelName: string, rows: Row[], candidate: AnyObj, excludeId?: number) {
  const model = getModel(modelName)

  for (const field of model.uniqueFields) {
    if (candidate[field] === undefined || candidate[field] === null) continue
    const conflict = rows.find((row) => row.id !== excludeId && row[field] === candidate[field])
    if (conflict) {
      throw uniqueConstraintError([field])
    }
  }

  for (const compound of model.uniqueCompound) {
    if (compound.some((field) => candidate[field] === undefined)) continue
    const conflict = rows.find(
      (row) => row.id !== excludeId && compound.every((field) => row[field] === candidate[field])
    )
    if (conflict) {
      throw uniqueConstraintError(compound)
    }
  }
}

function applyDefaults(modelName: string, data: AnyObj): AnyObj {
  const model = getModel(modelName)
  const now = new Date()
  const result: AnyObj = { ...data }

  for (const [field, value] of Object.entries(model.defaults)) {
    if (result[field] === undefined) {
      result[field] = value
    }
  }

  if (model.createdAtField && result[model.createdAtField] === undefined) {
    result[model.createdAtField] = now
  }
  if (model.updatedAtField && result[model.updatedAtField] === undefined) {
    result[model.updatedAtField] = now
  }

  return result
}

function applyUpdatedAt(modelName: string, data: AnyObj) {
  const model = getModel(modelName)
  if (model.updatedAtField && data[model.updatedAtField] === undefined) {
    data[model.updatedAtField] = new Date()
  }
}

function extractManyToManyWrites(modelName: string, data: AnyObj) {
  const model = getModel(modelName)
  const writes: { field: string; connect: number[]; disconnect: number[]; set: number[] | null }[] = []

  for (const [field, relation] of Object.entries(model.relations)) {
    if (relation.kind !== "manyToMany") continue
    const value = data[field]
    if (!isPlainObject(value)) continue

    const toIds = (raw: unknown): number[] => {
      const arr = Array.isArray(raw) ? raw : [raw]
      return arr.map((item) => (isPlainObject(item) ? (item as AnyObj).id : item)).filter((id) => id !== undefined)
    }

    writes.push({
      field,
      connect: value.connect ? toIds(value.connect) : [],
      disconnect: value.disconnect ? toIds(value.disconnect) : [],
      set: value.set ? toIds(value.set) : null,
    })
    delete data[field]
  }

  return writes
}

function extractNestedHasManyCreates(modelName: string, data: AnyObj) {
  const model = getModel(modelName)
  const writes: { field: string; relation: RelationDef; items: AnyObj[] }[] = []

  for (const [field, relation] of Object.entries(model.relations)) {
    if (relation.kind !== "hasMany") continue
    const value = data[field]
    if (!isPlainObject(value) || !("create" in value)) continue

    const items = Array.isArray(value.create) ? value.create : [value.create]
    writes.push({ field, relation, items: items as AnyObj[] })
    delete data[field]
  }

  return writes
}

function applyNestedHasManyCreates(
  parentId: number,
  writes: ReturnType<typeof extractNestedHasManyCreates>,
  db: Database
) {
  for (const write of writes) {
    if (write.relation.kind !== "hasMany") continue
    const targetModel = getModel(write.relation.target)
    const targetRows = db[targetModel.collection]

    for (const item of write.items) {
      const itemData: AnyObj = { ...item, [write.relation.foreignKey]: parentId }
      // Recurse first so any of this child's own nested `{ create: [...] }` fields (e.g. a
      // poll's options) are extracted before the child row is built, matching create()'s order.
      const childWrites = extractNestedHasManyCreates(write.relation.target, itemData)
      const data = applyDefaults(write.relation.target, itemData)
      const newId = nextId(targetRows)
      targetRows.push({ id: newId, ...data })
      applyNestedHasManyCreates(newId, childWrites, db)
    }
  }
}

function applyManyToManyWrites(
  modelName: string,
  record: Row,
  writes: ReturnType<typeof extractManyToManyWrites>,
  db: Database
) {
  const model = getModel(modelName)

  for (const write of writes) {
    const relation = model.relations[write.field]
    if (!relation || relation.kind !== "manyToMany") continue
    const join = db[relation.join]

    if (write.set !== null) {
      for (let i = join.length - 1; i >= 0; i -= 1) {
        if (join[i][relation.thisKey] === record.id) join.splice(i, 1)
      }
      for (const otherId of write.set) {
        join.push({ [relation.thisKey]: record.id, [relation.otherKey]: otherId })
      }
      continue
    }

    for (const otherId of write.disconnect) {
      for (let i = join.length - 1; i >= 0; i -= 1) {
        if (join[i][relation.thisKey] === record.id && join[i][relation.otherKey] === otherId) {
          join.splice(i, 1)
        }
      }
    }

    for (const otherId of write.connect) {
      const exists = join.some(
        (row) => row[relation.thisKey] === record.id && row[relation.otherKey] === otherId
      )
      if (!exists) {
        join.push({ [relation.thisKey]: record.id, [relation.otherKey]: otherId })
      }
    }
  }
}

function applyScalarUpdate(data: AnyObj) {
  const result: AnyObj = {}
  for (const [key, value] of Object.entries(data)) {
    if (isPlainObject(value) && ("increment" in value || "decrement" in value || "set" in value)) {
      if ("increment" in value) {
        result[key] = { __op: "increment", amount: (value as AnyObj).increment }
      } else if ("decrement" in value) {
        result[key] = { __op: "decrement", amount: (value as AnyObj).decrement }
      } else {
        result[key] = (value as AnyObj).set
      }
    } else {
      result[key] = value
    }
  }
  return result
}

function mergeUpdate(record: Row, data: AnyObj) {
  const patch = applyScalarUpdate(data)
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && (value as AnyObj).__op === "increment") {
      record[key] = ((record[key] as number) ?? 0) + (value as AnyObj).amount
    } else if (isPlainObject(value) && (value as AnyObj).__op === "decrement") {
      record[key] = ((record[key] as number) ?? 0) - (value as AnyObj).amount
    } else {
      record[key] = value
    }
  }
}

function cascadeOnDelete(deletedModel: string, deletedId: number, db: Database) {
  for (const [modelName, model] of Object.entries(MODELS)) {
    for (const owned of model.ownedRelations) {
      if (owned.target !== deletedModel) continue
      const rows = db[model.collection]
      const affected = rows.filter((row) => row[owned.foreignKey] === deletedId)
      if (affected.length === 0) continue

      if (owned.onDelete === "setNull") {
        for (const row of affected) {
          row[owned.foreignKey] = null
        }
      } else {
        for (const row of affected) {
          deleteById(modelName, row.id as number, db)
        }
      }
    }
  }

  for (const model of Object.values(MODELS)) {
    for (const [, relation] of Object.entries(model.relations)) {
      if (relation.kind === "manyToMany" && relation.target === deletedModel) {
        const join = db[relation.join]
        for (let i = join.length - 1; i >= 0; i -= 1) {
          if (join[i][relation.otherKey] === deletedId) join.splice(i, 1)
        }
      }
    }
  }
}

function deleteById(modelName: string, id: number, db: Database) {
  const model = getModel(modelName)
  const rows = db[model.collection]
  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) return
  rows.splice(index, 1)

  cascadeOnDelete(modelName, id, db)
}

export type Engine = ReturnType<typeof createModelEngine>

function createModelEngine(modelName: string) {
  const model = getModel(modelName)

  async function withDb<T>(fn: (db: Database) => T): Promise<T> {
    const db = await getDb()
    return fn(db)
  }

  async function findMany(args?: AnyObj): Promise<AnyObj[]> {
    return withDb((db) => {
      const rows = applyFindManyArgs(modelName, db[model.collection], args, db)
      return rows.map((row) => shapeRecordFull(modelName, row, args, db))
    })
  }

  async function findFirst(args?: AnyObj): Promise<AnyObj | null> {
    return withDb((db) => {
      const rows = applyFindManyArgs(modelName, db[model.collection], args, db)
      const row = rows[0]
      return row ? shapeRecordFull(modelName, row, args, db) : null
    })
  }

  async function findUnique(args: AnyObj): Promise<AnyObj | null> {
    return withDb((db) => {
      const row = findUniqueMatch(modelName, db[model.collection], args.where, db)
      return row ? shapeRecordFull(modelName, row, args, db) : null
    })
  }

  async function count(args?: AnyObj): Promise<number> {
    return withDb((db) => applyFindManyArgs(modelName, db[model.collection], args, db).length)
  }

  async function groupBy(args: AnyObj): Promise<AnyObj[]> {
    return withDb((db) => {
      const rows = applyFindManyArgs(modelName, db[model.collection], args, db)
      const by: string[] = args.by
      const groups = new Map<string, { key: AnyObj; rows: Row[] }>()

      for (const row of rows) {
        const keyObj: AnyObj = {}
        for (const field of by) keyObj[field] = row[field]
        const keyStr = JSON.stringify(keyObj)
        if (!groups.has(keyStr)) groups.set(keyStr, { key: keyObj, rows: [] })
        groups.get(keyStr)!.rows.push(row)
      }

      return Array.from(groups.values()).map(({ key, rows: groupRows }) => {
        const out: AnyObj = { ...key }
        if (args._count) {
          if (args._count === true || args._count._all) {
            out._count = { _all: groupRows.length }
          } else {
            out._count = {}
            for (const field of Object.keys(args._count)) {
              out._count[field] = groupRows.filter((row) => row[field] !== null && row[field] !== undefined).length
            }
          }
        }
        if (args._sum) {
          out._sum = {}
          for (const field of Object.keys(args._sum)) {
            out._sum[field] = groupRows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0)
          }
        }
        return out
      })
    })
  }

  async function create(args: AnyObj): Promise<AnyObj> {
    return withLock(async () => {
      const db = await getDb()
      const rows = db[model.collection]
      const data = applyDefaults(modelName, { ...args.data })
      const manyToManyWrites = extractManyToManyWrites(modelName, data)
      const nestedCreates = extractNestedHasManyCreates(modelName, data)

      checkUniqueConstraints(modelName, rows, data)

      const record: Row = { id: nextId(rows), ...data }
      rows.push(record)
      applyManyToManyWrites(modelName, record, manyToManyWrites, db)
      applyNestedHasManyCreates(record.id as number, nestedCreates, db)

      await persist()
      return shapeRecordFull(modelName, record, args, db)
    })
  }

  async function createMany(args: AnyObj): Promise<{ count: number }> {
    return withLock(async () => {
      const db = await getDb()
      const rows = db[model.collection]
      const items: AnyObj[] = args.data
      let created = 0

      for (const item of items) {
        const data = applyDefaults(modelName, { ...item })
        try {
          checkUniqueConstraints(modelName, rows, data)
        } catch (error) {
          if (args.skipDuplicates) continue
          throw error
        }
        rows.push({ id: nextId(rows), ...data })
        created += 1
      }

      await persist()
      return { count: created }
    })
  }

  async function update(args: AnyObj): Promise<AnyObj> {
    return withLock(async () => {
      const db = await getDb()
      const rows = db[model.collection]
      const record = findUniqueMatch(modelName, rows, args.where, db)
      if (!record) throw recordNotFoundError()

      const data = { ...args.data }
      const manyToManyWrites = extractManyToManyWrites(modelName, data)
      applyUpdatedAt(modelName, data)

      const candidate = { ...record, ...applyScalarUpdate(data) }
      checkUniqueConstraints(modelName, rows, candidate, record.id as number)

      mergeUpdate(record, data)
      applyManyToManyWrites(modelName, record, manyToManyWrites, db)

      await persist()
      return shapeRecordFull(modelName, record, args, db)
    })
  }

  async function updateMany(args: AnyObj): Promise<{ count: number }> {
    return withLock(async () => {
      const db = await getDb()
      const rows = db[model.collection].filter((row) => matchWhere(modelName, row, args.where, db))
      for (const row of rows) {
        const data = { ...args.data }
        applyUpdatedAt(modelName, data)
        mergeUpdate(row, data)
      }
      await persist()
      return { count: rows.length }
    })
  }

  async function upsert(args: AnyObj): Promise<AnyObj> {
    return withLock(async () => {
      const db = await getDb()
      const rows = db[model.collection]
      const existing = findUniqueMatch(modelName, rows, args.where, db)

      if (existing) {
        const data = { ...args.update }
        const manyToManyWrites = extractManyToManyWrites(modelName, data)
        applyUpdatedAt(modelName, data)
        mergeUpdate(existing, data)
        applyManyToManyWrites(modelName, existing, manyToManyWrites, db)
        await persist()
        return shapeRecordFull(modelName, existing, args, db)
      }

      const data = applyDefaults(modelName, { ...args.create })
      const manyToManyWrites = extractManyToManyWrites(modelName, data)
      const nestedCreates = extractNestedHasManyCreates(modelName, data)
      checkUniqueConstraints(modelName, rows, data)
      const record: Row = { id: nextId(rows), ...data }
      rows.push(record)
      applyManyToManyWrites(modelName, record, manyToManyWrites, db)
      applyNestedHasManyCreates(record.id as number, nestedCreates, db)
      await persist()
      return shapeRecordFull(modelName, record, args, db)
    })
  }

  async function del(args: AnyObj): Promise<AnyObj> {
    return withLock(async () => {
      const db = await getDb()
      const rows = db[model.collection]
      const record = findUniqueMatch(modelName, rows, args.where, db)
      if (!record) throw recordNotFoundError()
      const shaped = shapeRecordFull(modelName, record, args, db)
      deleteById(modelName, record.id as number, db)
      await persist()
      return shaped
    })
  }

  async function deleteMany(args?: AnyObj): Promise<{ count: number }> {
    return withLock(async () => {
      const db = await getDb()
      const rows = db[model.collection].filter((row) => matchWhere(modelName, row, args?.where, db))
      for (const row of rows) {
        deleteById(modelName, row.id as number, db)
      }
      await persist()
      return { count: rows.length }
    })
  }

  return {
    findMany,
    findFirst,
    findUnique,
    count,
    groupBy,
    create,
    createMany,
    update,
    updateMany,
    upsert,
    delete: del,
    deleteMany,
  }
}

type ModelEngine = ReturnType<typeof createModelEngine>
type DbClientShape = Record<string, ModelEngine> & {
  $transaction<T>(fn: (tx: DbClientShape) => Promise<T>): Promise<T>
  $transaction<T extends readonly unknown[] | []>(arg: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }>
}

export function createDbClient() {
  const client = {} as DbClientShape
  for (const modelName of Object.keys(MODELS)) {
    ;(client as AnyObj)[modelName] = createModelEngine(modelName)
  }

  ;(client as AnyObj).$transaction = async (arg: unknown) => {
    return withLock(async () => {
      const db = await getDb()
      const backup = cloneDb(db)
      try {
        let result: unknown
        if (typeof arg === "function") {
          result = await (arg as (tx: AnyObj) => Promise<unknown>)(client)
        } else if (Array.isArray(arg)) {
          result = await Promise.all(arg)
        } else {
          throw new Error("Unsupported $transaction argument")
        }
        await persist()
        return result
      } catch (error) {
        Object.keys(db).forEach((key) => {
          db[key] = backup[key]
        })
        throw error
      }
    })
  }

  return client
}
