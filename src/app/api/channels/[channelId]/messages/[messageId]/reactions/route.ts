import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import { getChannelMessage, setChannelMessageReaction } from "@/shared/lib/media/message-store"

function parsePositiveInt(value: string) {
  const result = Number(value)
  return Number.isInteger(result) && result > 0 ? result : null
}

async function isChannelMember(channelId: number, userId: number) {
  const membership = await prisma.channelParticipant.findFirst({
    where: { channelId, userId },
    select: { id: true },
  })
  return Boolean(membership)
}

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(8),
})

async function resolveContext(
  request: NextRequest,
  params: Promise<{ channelId: string; messageId: string }>
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return { error: NextResponse.json({ message: "Не авторизован" }, { status: 401 }) }
  }

  const { channelId: channelIdParam, messageId: messageIdParam } = await params
  const channelId = parsePositiveInt(channelIdParam)
  const messageId = parsePositiveInt(messageIdParam)
  if (!channelId || !messageId) {
    return { error: NextResponse.json({ message: "Неверные идентификаторы" }, { status: 400 }) }
  }

  const isMember = await isChannelMember(channelId, userId)
  if (!isMember) {
    return { error: NextResponse.json({ message: "Канал не найден" }, { status: 404 }) }
  }

  const message = await prisma.channelMessage.findFirst({
    where: { id: messageId, channelId },
    select: { id: true },
  })
  if (!message) {
    return { error: NextResponse.json({ message: "Сообщение не найдено" }, { status: 404 }) }
  }

  return { userId, channelId, messageId }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ channelId: string; messageId: string }> }
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

  await setChannelMessageReaction(resolved.messageId, resolved.userId, parsed.data.emoji)
  const message = await getChannelMessage(resolved.messageId, resolved.channelId, resolved.userId)

  return NextResponse.json({ reactions: message?.reactions ?? [] }, { status: 200 })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const resolved = await resolveContext(request, context.params)
  if ("error" in resolved) {
    return resolved.error
  }

  await setChannelMessageReaction(resolved.messageId, resolved.userId, null)
  const message = await getChannelMessage(resolved.messageId, resolved.channelId, resolved.userId)

  return NextResponse.json({ reactions: message?.reactions ?? [] }, { status: 200 })
}
