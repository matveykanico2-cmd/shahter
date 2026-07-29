import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { formatBlacklistUserName } from "@/shared/lib/blacklist"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import { canWriteToDialog } from "@/shared/lib/direct-message-access"
import { createDialogMessage, getChannelMessage } from "@/shared/lib/media/message-store"
import { sendPushToDialogRecipients } from "@/shared/lib/notifications/push"

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

async function isChannelMember(channelId: number, userId: number) {
  const membership = await prisma.channelParticipant.findFirst({
    where: { channelId, userId },
    select: { id: true },
  })
  return Boolean(membership)
}

const forwardSchema = z.object({
  targetDialogId: z.number().int().positive(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const { channelId: channelIdParam, messageId: messageIdParam } = await context.params
  const channelId = parsePositiveInt(channelIdParam)
  const messageId = parsePositiveInt(messageIdParam)
  if (!channelId || !messageId) {
    return NextResponse.json({ message: "Неверные идентификаторы" }, { status: 400 })
  }

  const isMember = await isChannelMember(channelId, userId)
  if (!isMember) {
    return NextResponse.json({ message: "Канал не найден" }, { status: 404 })
  }

  const json = await request.json().catch(() => null)
  const parsed = forwardSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Ошибка валидации", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { targetDialogId } = parsed.data

  const hasTargetAccess = await canAccessDialog(targetDialogId, userId)
  if (!hasTargetAccess) {
    return NextResponse.json({ message: "Целевой чат не найден" }, { status: 404 })
  }

  const source = await getChannelMessage(messageId, channelId, userId)
  if (!source) {
    return NextResponse.json({ message: "Сообщение не найдено" }, { status: 404 })
  }

  const writeAccess = await canWriteToDialog(targetDialogId, userId)
  if (!writeAccess.ok && writeAccess.code === "CONTACT_REQUIRED") {
    return NextResponse.json(
      { message: "Этому пользователю могут писать только люди из его контактов" },
      { status: 403 }
    )
  }

  const blockedByUsers = await prisma.userBlacklist.findMany({
    where: {
      blockedUserId: userId,
      owner: { dialogs: { some: { id: targetDialogId } } },
    },
    select: {
      owner: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  if (blockedByUsers.length > 0) {
    const names = blockedByUsers.map((item) => formatBlacklistUserName(item.owner)).join(", ")
    return NextResponse.json(
      { message: `Вы не можете писать в этот чат. Вас добавили в чёрный список: ${names}` },
      { status: 403 }
    )
  }

  const forwardedFromAuthorId = source.forwardedFrom?.authorId ?? source.authorId
  const forwardedFromAuthorName =
    source.forwardedFrom?.authorName ?? `${source.author.firstName} ${source.author.lastName ?? ""}`.trim()

  const message = await createDialogMessage({
    content: source.content,
    status: "SENT",
    dialogId: targetDialogId,
    authorId: userId,
    attachments: source.attachment,
    forwardedFromAuthorId,
    forwardedFromAuthorName,
  })

  void sendPushToDialogRecipients({
    dialogId: targetDialogId,
    authorId: userId,
    authorName: `${message.author.firstName} ${message.author.lastName ?? ""}`.trim(),
    content: message.content,
  })

  return NextResponse.json({ message }, { status: 201 })
}
