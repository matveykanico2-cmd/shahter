import { type NextRequest, NextResponse } from "next/server"

import { getActiveBroadcastForChannel } from "@/features/channels/lib/broadcast-store"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import { parseMessageInput } from "@/shared/lib/media/message-input"
import { createChannelMessage, getChannelMessages } from "@/shared/lib/media/message-store"
import { saveMessageFile, validateMessageFile } from "@/shared/lib/media/uploads"

function parseChannelId(value: string) {
  const channelId = Number(value)
  return Number.isInteger(channelId) && channelId > 0 ? channelId : null
}

async function getMembership(channelId: number, userId: number) {
  return prisma.channelParticipant.findFirst({
    where: {
      channelId,
      userId,
    },
    select: {
      role: true,
    },
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ channelId: string }> }
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const { channelId: rawChannelId } = await context.params
  const channelId = parseChannelId(rawChannelId)
  if (!channelId) {
    return NextResponse.json({ message: "Неверный id канала" }, { status: 400 })
  }

  const membership = await getMembership(channelId, userId)
  if (!membership) {
    return NextResponse.json({ message: "Канал не найден" }, { status: 404 })
  }

  const messages = await getChannelMessages(channelId, userId)

  return NextResponse.json(
    {
      messages,
    },
    { status: 200 }
  )
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ channelId: string }> }
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const { channelId: rawChannelId } = await context.params
  const channelId = parseChannelId(rawChannelId)
  if (!channelId) {
    return NextResponse.json({ message: "Неверный id канала" }, { status: 400 })
  }

  const membership = await getMembership(channelId, userId)
  if (!membership) {
    return NextResponse.json({ message: "Канал не найден" }, { status: 404 })
  }

  const activeBroadcast = getActiveBroadcastForChannel(channelId)

  if (membership.role === "MEMBER" && !activeBroadcast) {
    return NextResponse.json(
      { message: "Писать в канал могут только владелец и админы" },
      { status: 403 }
    )
  }

  const parsed = await parseMessageInput(request)
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Ошибка валидации",
        fieldErrors: parsed.fieldErrors,
      },
      { status: 400 }
    )
  }

  const attachments = []
  for (const item of parsed.data.attachments) {
    const validationError = validateMessageFile(item.kind, item.file)
    if (validationError) {
      return NextResponse.json(
        {
          message: "Ошибка валидации",
          fieldErrors: {
            attachment: [validationError],
          },
        },
        { status: 400 }
      )
    }

    attachments.push({
      kind: item.kind,
      ...(await saveMessageFile(item.kind, item.file)),
    })
  }

  let replyToMessageId: number | null = null
  if (parsed.data.replyToMessageId) {
    const replyTarget = await prisma.channelMessage.findFirst({
      where: { id: parsed.data.replyToMessageId, channelId },
      select: { id: true },
    })
    replyToMessageId = replyTarget ? parsed.data.replyToMessageId : null
  }

  const message = await createChannelMessage({
    channelId,
    authorId: userId,
    content: parsed.data.content,
    attachments,
    replyToMessageId,
  })

  return NextResponse.json(
    {
      message,
    },
    { status: 201 }
  )
}
