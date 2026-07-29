import { type NextRequest, NextResponse } from "next/server"

import { sendChannelMessageSchema } from "@/features/channels/model/schemas"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"
import { deleteUploadedFileByUrl } from "@/shared/lib/media/uploads"

function parsePositiveInt(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
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

async function getMessage(channelId: number, messageId: number) {
  return prisma.channelMessage.findFirst({
    where: {
      id: messageId,
      channelId,
    },
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarTone: true,
          avatarUrl: true,
        },
      },
      attachments: {
        orderBy: { position: "asc" },
      },
    },
  })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const { channelId: rawChannelId, messageId: rawMessageId } = await context.params
  const channelId = parsePositiveInt(rawChannelId)
  const messageId = parsePositiveInt(rawMessageId)
  if (!channelId || !messageId) {
    return NextResponse.json({ message: "Invalid identifiers" }, { status: 400 })
  }

  const membership = await getMembership(channelId, userId)
  if (!membership) {
    return NextResponse.json({ message: "Channel not found" }, { status: 404 })
  }

  const existing = await getMessage(channelId, messageId)
  if (!existing) {
    return NextResponse.json({ message: "Message not found" }, { status: 404 })
  }

  if (existing.authorId !== userId) {
    return NextResponse.json(
      { message: "You can only edit your own messages" },
      { status: 403 }
    )
  }

  if (existing.mediaKind || existing.attachments.length > 0) {
    return NextResponse.json(
      { message: "Media messages can only be deleted and sent again" },
      { status: 400 }
    )
  }

  const json = await request.json().catch(() => null)
  const parsed = sendChannelMessageSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation error",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const updated = await prisma.channelMessage.update({
    where: { id: messageId },
    data: {
      content: parsed.data.content,
      updatedAt: new Date(),
    },
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarTone: true,
          avatarUrl: true,
        },
      },
      attachments: {
        orderBy: { position: "asc" },
      },
    },
  })

  return NextResponse.json(
    {
      message: {
        id: updated.id,
        content: updated.content,
        createdAt: updated.createdAt.toISOString(),
        channelId: updated.channelId,
        author: updated.author,
        attachment:
          updated.attachments.length > 0
            ? updated.attachments.map((attachment: DbRow) => ({
                kind: attachment.kind as "FILE" | "VOICE" | "VIDEO_NOTE",
                url: attachment.url,
                name: attachment.name,
                mime: attachment.mime,
                size: attachment.size,
              }))
            : updated.mediaKind &&
                updated.mediaUrl &&
                updated.mediaName &&
                updated.mediaMime &&
                updated.mediaSize !== null
              ? {
                  kind: updated.mediaKind,
                  url: updated.mediaUrl,
                  name: updated.mediaName,
                  mime: updated.mediaMime,
                  size: updated.mediaSize,
                }
              : null,
      },
    },
    { status: 200 }
  )
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const { channelId: rawChannelId, messageId: rawMessageId } = await context.params
  const channelId = parsePositiveInt(rawChannelId)
  const messageId = parsePositiveInt(rawMessageId)
  if (!channelId || !messageId) {
    return NextResponse.json({ message: "Invalid identifiers" }, { status: 400 })
  }

  const membership = await getMembership(channelId, userId)
  if (!membership) {
    return NextResponse.json({ message: "Channel not found" }, { status: 404 })
  }

  const existing = await getMessage(channelId, messageId)
  if (!existing) {
    return NextResponse.json({ message: "Message not found" }, { status: 404 })
  }

  if (existing.authorId !== userId) {
    return NextResponse.json(
      { message: "You can only delete your own messages" },
      { status: 403 }
    )
  }

  await prisma.channelMessage.delete({
    where: { id: messageId },
  })
  await deleteUploadedFileByUrl(existing.mediaUrl)
  for (const attachment of existing.attachments) {
    await deleteUploadedFileByUrl(attachment.url)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
