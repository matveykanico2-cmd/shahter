export type Json = Record<string, unknown>

export type RelationDef =
  | { kind: "belongsTo"; target: string; foreignKey: string }
  | { kind: "hasMany"; target: string; foreignKey: string }
  | { kind: "manyToMany"; target: string; join: string; thisKey: string; otherKey: string }

export type CascadeRule = "cascade" | "setNull"

export type FieldOwnedRelation = {
  /** relation field name that owns a foreign key on this model, e.g. "owner" -> ownerId */
  field: string
  foreignKey: string
  target: string
  onDelete: CascadeRule
}

export type ModelDef = {
  /** collection key inside db.json */
  collection: string
  /** field holding the autoincrement id, always "id" here */
  idField: string
  /** single-field unique constraints (field name) */
  uniqueFields: string[]
  /** composite unique constraints (list of field-name tuples) */
  uniqueCompound: string[][]
  /** relations keyed by field name as referenced in select/include/where */
  relations: Record<string, RelationDef>
  /** belongsTo relations that must be considered when the *target* of the FK is deleted (cascade/setNull) */
  ownedRelations: FieldOwnedRelation[]
  /** static default values applied at create() time when the field is omitted */
  defaults: Record<string, unknown>
  /** field set to now() at create() time when omitted (mirrors @default(now())) */
  createdAtField?: string
  /** field set to now() at create() time when omitted, and on every update() (mirrors @updatedAt) */
  updatedAtField?: string
  /** fields holding DateTime values, revived from ISO strings back into Date objects on load */
  dateFields: string[]
}
