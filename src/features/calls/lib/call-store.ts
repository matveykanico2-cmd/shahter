import type { EmblemToneId } from "@/features/profile/lib/emblem"

export type CallMediaMode = "audio" | "video"

export type CallUser = {
  userId: number
  firstName: string
  lastName: string | null
  email: string
  avatarTone?: EmblemToneId | string | null
  avatarUrl?: string | null
}

export type CallParticipant = CallUser & {
  joinedAt: string
}

export type CallSnapshot = {
  id: string
  dialogId: number
  media: CallMediaMode
  createdByUserId: number
  createdAt: string
  participants: CallParticipant[]
  invitedUsers: CallUser[]
}

export type CallSignalPayload = {
  type: "offer" | "answer" | "ice-candidate"
  payload: unknown
}

export type CallServerEvent =
  | { type: "call.snapshot"; calls: CallSnapshot[] }
  | { type: "call.invited"; call: CallSnapshot }
  | { type: "call.updated"; call: CallSnapshot }
  | { type: "call.ended"; callId: string }
  | { type: "call.signal"; callId: string; fromUserId: number; signal: CallSignalPayload }

export type CallRecord = {
  id: string
  dialogId: number
  media: CallMediaMode
  createdByUserId: number
  createdAt: string
  usersById: Map<number, CallUser>
  participantsById: Map<number, CallParticipant>
}

const runtimeCalls = new Map<string, CallRecord>()
const eventsByUser = new Map<number, { sequence: number; event: CallServerEvent }[]>()
let eventSequence = 0

const locks = new Map<string, Promise<unknown>>()

function withKeyedLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  locks.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  )
  return run
}

function cloneRecord(record: CallRecord): CallRecord {
  return {
    ...record,
    usersById: new Map(record.usersById),
    participantsById: new Map(record.participantsById),
  }
}

function callToSnapshot(record: CallRecord): CallSnapshot {
  const participants = Array.from(record.participantsById.values()).sort(
    (left, right) => left.userId - right.userId
  )
  const invitedUsers = Array.from(record.usersById.values())
    .filter((user) => !record.participantsById.has(user.userId))
    .sort((left, right) => left.userId - right.userId)

  return {
    id: record.id,
    dialogId: record.dialogId,
    media: record.media,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    participants,
    invitedUsers,
  }
}

function getCallUserIds(record: CallRecord) {
  return Array.from(record.usersById.keys())
}

function enqueueEventsForUsers(userIds: Iterable<number>, event: CallServerEvent) {
  const uniqueUserIds = [...new Set(Array.from(userIds).filter((userId) => userId > 0))]
  for (const userId of uniqueUserIds) {
    eventSequence += 1
    const list = eventsByUser.get(userId) ?? []
    list.push({ sequence: eventSequence, event })
    eventsByUser.set(userId, list)
  }
}

function findActiveCallForDialog(dialogId: number): CallRecord | null {
  let latest: CallRecord | null = null
  for (const record of runtimeCalls.values()) {
    if (record.dialogId !== dialogId) continue
    if (!latest || record.createdAt > latest.createdAt) {
      latest = record
    }
  }
  return latest
}

function dialogLockKey(dialogId: number) {
  return `dialog:${dialogId}`
}

function callLockKey(callId: string) {
  return `call:${callId}`
}

export async function getUserCallSnapshots(userId: number) {
  return Array.from(runtimeCalls.values())
    .filter((record) => record.usersById.has(userId))
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))
    .map(callToSnapshot)
}

export async function getCallSnapshot(callId: string) {
  const record = runtimeCalls.get(callId)
  return record ? callToSnapshot(record) : null
}

export async function getCallRecord(callId: string) {
  const record = runtimeCalls.get(callId)
  return record ? cloneRecord(record) : null
}

export async function getActiveCallForDialog(dialogId: number) {
  const record = findActiveCallForDialog(dialogId)
  return record ? cloneRecord(record) : null
}

export async function createCall(input: {
  dialogId: number
  media: CallMediaMode
  createdBy: CallUser
  users: CallUser[]
}) {
  return withKeyedLock(dialogLockKey(input.dialogId), () => {
    const existing = findActiveCallForDialog(input.dialogId)
    if (existing) {
      return callToSnapshot(existing)
    }

    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const users = input.users
      .slice()
      .sort((left, right) => left.userId - right.userId)
      .filter((user, index, list) => list.findIndex((item) => item.userId === user.userId) === index)

    const record: CallRecord = {
      id,
      dialogId: input.dialogId,
      media: input.media,
      createdByUserId: input.createdBy.userId,
      createdAt,
      usersById: new Map(users.map((user) => [user.userId, user])),
      participantsById: new Map([[input.createdBy.userId, { ...input.createdBy, joinedAt: createdAt }]]),
    }

    runtimeCalls.set(id, record)

    const snapshot = callToSnapshot(record)
    enqueueEventsForUsers(getCallUserIds(record), { type: "call.invited", call: snapshot })
    return snapshot
  })
}

export async function joinCall(callId: string, user: CallUser) {
  return withKeyedLock(callLockKey(callId), () => {
    const record = runtimeCalls.get(callId)
    if (!record) return null
    if (!record.usersById.has(user.userId)) return null

    if (!record.participantsById.has(user.userId)) {
      record.participantsById.set(user.userId, { ...user, joinedAt: new Date().toISOString() })
    }

    const snapshot = callToSnapshot(record)
    enqueueEventsForUsers(getCallUserIds(record), { type: "call.updated", call: snapshot })
    return snapshot
  })
}

export async function inviteUsersToCall(callId: string, users: CallUser[]) {
  return withKeyedLock(callLockKey(callId), () => {
    const record = runtimeCalls.get(callId)
    if (!record) return null

    let changed = false
    for (const user of users) {
      if (record.usersById.has(user.userId)) continue
      record.usersById.set(user.userId, user)
      changed = true
    }

    const snapshot = callToSnapshot(record)
    if (!changed) return snapshot

    enqueueEventsForUsers(getCallUserIds(record), { type: "call.updated", call: snapshot })
    return snapshot
  })
}

export async function leaveCall(callId: string, userId: number) {
  return withKeyedLock(callLockKey(callId), () => {
    const record = runtimeCalls.get(callId)
    if (!record) return false

    record.participantsById.delete(userId)

    if (record.participantsById.size === 0) {
      runtimeCalls.delete(callId)
      enqueueEventsForUsers(getCallUserIds(record), { type: "call.ended", callId })
      return true
    }

    enqueueEventsForUsers(getCallUserIds(record), { type: "call.updated", call: callToSnapshot(record) })
    return true
  })
}

export async function rejectCall(callId: string, userId: number) {
  return withKeyedLock(callLockKey(callId), () => {
    const record = runtimeCalls.get(callId)
    if (!record) return false
    if (!record.usersById.has(userId)) return false

    record.usersById.delete(userId)
    record.participantsById.delete(userId)

    if (record.usersById.size === 0 || record.participantsById.size === 0) {
      const userIds = getCallUserIds(record)
      runtimeCalls.delete(callId)
      enqueueEventsForUsers(userIds, { type: "call.ended", callId })
      return true
    }

    enqueueEventsForUsers(getCallUserIds(record), { type: "call.updated", call: callToSnapshot(record) })
    return true
  })
}

export async function endCall(callId: string) {
  return withKeyedLock(callLockKey(callId), () => {
    const record = runtimeCalls.get(callId)
    if (!record) return false

    runtimeCalls.delete(callId)
    enqueueEventsForUsers(getCallUserIds(record), { type: "call.ended", callId })
    return true
  })
}

export async function sendCallSignal(input: {
  callId: string
  fromUserId: number
  toUserId: number
  signal: CallSignalPayload
}) {
  return withKeyedLock(callLockKey(input.callId), () => {
    const record = runtimeCalls.get(input.callId)
    if (!record) return false
    if (!record.usersById.has(input.fromUserId) || !record.usersById.has(input.toUserId)) return false

    enqueueEventsForUsers([input.toUserId], {
      type: "call.signal",
      callId: input.callId,
      fromUserId: input.fromUserId,
      signal: input.signal,
    })
    return true
  })
}

export async function getCurrentCallEventCursor(userId: number) {
  const list = eventsByUser.get(userId)
  if (!list || list.length === 0) return 0
  return list[list.length - 1].sequence
}

export async function getCallEventsSince(userId: number, afterSequence: number) {
  const list = eventsByUser.get(userId)
  if (!list) return []
  return list.filter((entry) => entry.sequence > afterSequence)
}
