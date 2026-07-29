import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import { getDialogMessage, setDialogMessageReaction } from "@/shared/lib/media/message-store"

function parsePositiveInt(value: string) {
  const result = Number(value)
  return Number.isInteger(result) && result > 0 ? result : null
}

async function canAccessDialog(dialogId: number, userId: number) {
  const dialog = await prisma.dialog.findFirst({
    where: { id: dialogId, users: { some: { id: userId } } },
    select: { id: true },
  })
  return Boolean(dialog)
}

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(8),
})

async function resolveContext(request: NextRequest, params: Promise<{ dialogId: string; messageId: string }>) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return { error: NextResponse.json({ message: "Не авторизован" }, { status: 401 }) }
  }

  const { dialogId: dialogIdParam, messageId: messageIdParam } = await params
  const dialogId = parsePositiveInt(dialogIdParam)
  const messageId = parsePositiveInt(messageIdParam)
  if (!dialogId || !messageId) {
    return { error: NextResponse.json({ message: "Неверные идентификаторы" }, { status: 400 }) }
  }

  const hasAccess = await canAccessDialog(dialogId, userId)
  if (!hasAccess) {
    return { error: NextResponse.json({ message: "Чат не найден" }, { status: 404 }) }
  }

  const message = await prisma.message.findFirst({ where: { id: messageId, dialogId }, select: { id: true } })
  if (!message) {
    return { error: NextResponse.json({ message: "Сообщение не найдено" }, { status: 404 }) }
  }

  return { userId, dialogId, messageId }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dialogId: string; messageId: string }> }
) {
  const resolved = await resolveContext(request, context.params)
  if ("error" in resolved) {
    return resolved.error
  }

  const json = await request.json().catch(() => null)
  const parsed = reactionSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Ошибка валидации", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  await setDialogMessageReaction(resolved.messageId, resolved.userId, parsed.data.emoji)
  const message = await getDialogMessage(resolved.messageId, resolved.dialogId, resolved.userId)

  return NextResponse.json({ reactions: message?.reactions ?? [] }, { status: 200 })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ dialogId: string; messageId: string }> }
) {
  const resolved = await resolveContext(request, context.params)
  if ("error" in resolved) {
    return resolved.error
  }

  await setDialogMessageReaction(resolved.messageId, resolved.userId, null)
  const message = await getDialogMessage(resolved.messageId, resolved.dialogId, resolved.userId)

  return NextResponse.json({ reactions: message?.reactions ?? [] }, { status: 200 })
}
