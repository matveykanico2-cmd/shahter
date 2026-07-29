import { z } from "zod"

import { isPrismaKnownRequestError } from "@/shared/lib/db/prisma-errors"
import type { prisma } from "@/shared/lib/db/prisma"

export const USERNAME_REGEX = /^[a-z0-9_]{4,32}$/

type DbClient = typeof prisma

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_REGEX, "Username: 4-32 символа, только a-z, 0-9 и _")

type UsernameEntityType = "user" | "channel" | "bot"

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

export function isUsernameConflictError(error: unknown) {
  return isPrismaKnownRequestError(error, "P2002")
}

export async function reserveUsername(
  tx: DbClient,
  username: string,
  entityType: UsernameEntityType,
  entityId: number
) {
  await tx.usernameRegistry.create({
    data: {
      username: normalizeUsername(username),
      entityType,
      entityId,
    },
  })
}

export async function updateReservedUsername(
  tx: DbClient,
  username: string,
  entityType: UsernameEntityType,
  entityId: number
) {
  const normalized = normalizeUsername(username)
  const existing = await tx.usernameRegistry.findUnique({
    where: {
      entityType_entityId: {
        entityType,
        entityId,
      },
    },
    select: {
      id: true,
      username: true,
    },
  })

  if (!existing) {
    await reserveUsername(tx, normalized, entityType, entityId)
    return
  }

  if (existing.username === normalized) {
    return
  }

  await tx.usernameRegistry.update({
    where: { id: existing.id },
    data: { username: normalized },
  })
}

export async function releaseUsername(
  tx: DbClient,
  entityType: UsernameEntityType,
  entityId: number
) {
  await tx.usernameRegistry.deleteMany({
    where: {
      entityType,
      entityId,
    },
  })
}
