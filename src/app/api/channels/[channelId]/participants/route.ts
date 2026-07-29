import { type NextRequest, NextResponse } from "next/server"

import {
  addChannelParticipantsSchema,
  updateChannelParticipantRoleSchema,
} from "@/features/channels/model/schemas"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"

function parseChannelId(value: string) {
  const channelId = Number(value)
  return Number.isInteger(channelId) && channelId > 0 ? channelId : null
}

type OwnerMembershipChannel = {
  id: number
  ownerId: number
  participants: Array<{
    userId: number
    role: string
    user: {
      id: number
      firstName: string
      lastName: string | null
      email: string
      phone: string
      role: string
      avatarTone: string | null
      avatarUrl: string | null
      isBlocked: boolean
    }
  }>
} | null

async function getOwnerMembership(
  channelId: number,
  userId: number
): Promise<OwnerMembershipChannel> {
  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      participants: {
        some: {
          userId,
        },
      },
    },
    select: {
      id: true,
      ownerId: true,
      participants: {
        select: {
          userId: true,
          role: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              role: true,
              avatarTone: true,
              avatarUrl: true,
              isBlocked: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  })

  if (!channel) {
    return null
  }

  return channel as unknown as Exclude<OwnerMembershipChannel, null>
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

  const channel = await getOwnerMembership(channelId, userId)
  if (!channel) {
    return NextResponse.json({ message: "Канал не найден" }, { status: 404 })
  }
  const membership = channel.participants.find((item) => item.userId === userId) ?? null

  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
    return NextResponse.json(
      { message: "\u0414\u043e\u0431\u0430\u0432\u043b\u044f\u0442\u044c \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432 \u043c\u043e\u0433\u0443\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u0438 \u0430\u0434\u043c\u0438\u043d\u044b \u043a\u0430\u043d\u0430\u043b\u0430" },
      { status: 403 }
    )
  }

  const json = await request.json().catch(() => null)
  const parsed = addChannelParticipantsSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Ошибка валидации",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const existingIds = new Set(channel.participants.map((item) => item.userId))
  const participantIds = Array.from(
    new Set(parsed.data.participantIds.filter((id) => id !== userId && !existingIds.has(id)))
  )

  if (participantIds.length === 0) {
    return NextResponse.json(
      { message: "Выберите хотя бы одного нового участника" },
      { status: 400 }
    )
  }

  const contacts = await prisma.contact.findMany({
    where: {
      ownerId: userId,
      contactUserId: { in: participantIds },
    },
    select: {
      contactUserId: true,
    },
  })

  if (contacts.length !== participantIds.length) {
    return NextResponse.json(
      { message: "Можно добавлять только пользователей из контактов владельца" },
      { status: 400 }
    )
  }

  await prisma.channelParticipant.createMany({
    data: participantIds.map((participantId) => ({
      channelId,
      userId: participantId,
      role: "MEMBER",
    })),
  })

  const participants = await prisma.channelParticipant.findMany({
    where: {
      channelId,
      userId: { in: participantIds },
    },
    select: {
      role: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          avatarTone: true,
          avatarUrl: true,
          isBlocked: true,
        },
      },
    },
    orderBy: { id: "asc" },
  })

  return NextResponse.json(
    {
      participants: participants.map((participant) => ({
        channelRole: participant.role,
        ...participant.user,
      })),
    },
    { status: 200 }
  )
}

export async function PATCH(
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

  const channel = await getOwnerMembership(channelId, userId)
  if (!channel) {
    return NextResponse.json({ message: "Канал не найден" }, { status: 404 })
  }

  if (channel.ownerId !== userId) {
    return NextResponse.json(
      { message: "Назначать админов может только владелец канала" },
      { status: 403 }
    )
  }

  const json = await request.json().catch(() => null)
  const parsed = updateChannelParticipantRoleSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Ошибка валидации",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  if (parsed.data.targetUserId === userId) {
    return NextResponse.json(
      { message: "Владелец уже имеет максимальные права" },
      { status: 400 }
    )
  }

  const participant = channel.participants.find((item) => item.userId === parsed.data.targetUserId)
  if (!participant) {
    return NextResponse.json({ message: "Участник не найден" }, { status: 404 })
  }

  const updated = await prisma.channelParticipant.update({
    where: {
      channelId_userId: {
        channelId,
        userId: parsed.data.targetUserId,
      },
    },
    data: {
      role: parsed.data.role,
    },
    select: {
      role: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          avatarTone: true,
          avatarUrl: true,
          isBlocked: true,
        },
      },
    },
  })

  return NextResponse.json(
    {
      participant: {
        channelRole: updated.role,
        ...updated.user,
      },
    },
    { status: 200 }
  )
}

export async function DELETE(
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

  const targetUserId = Number(request.nextUrl.searchParams.get("targetUserId"))
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ message: "Неверный id участника" }, { status: 400 })
  }

  const channel = await getOwnerMembership(channelId, userId)
  if (!channel) {
    return NextResponse.json({ message: "Канал не найден" }, { status: 404 })
  }

  if (channel.ownerId !== userId) {
    return NextResponse.json(
      { message: "Выгонять участников может только владелец канала" },
      { status: 403 }
    )
  }

  if (targetUserId === userId) {
    return NextResponse.json(
      { message: "Владелец не может выгнать самого себя" },
      { status: 400 }
    )
  }

  const participant = channel.participants.find((item) => item.userId === targetUserId)
  if (!participant) {
    return NextResponse.json({ message: "Участник не найден" }, { status: 404 })
  }

  await prisma.channelParticipant.delete({
    where: {
      channelId_userId: {
        channelId,
        userId: targetUserId,
      },
    },
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
