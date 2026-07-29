import { NextResponse, type NextRequest } from "next/server"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"

export async function getAuthorizedBroadcastContext(request: NextRequest) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return {
      error: NextResponse.json({ message: "Не авторизован" }, { status: 401 }),
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarTone: true,
      avatarUrl: true,
    },
  })

  if (!user) {
    return {
      error: NextResponse.json({ message: "Пользователь не найден" }, { status: 404 }),
    }
  }

  return {
    userId,
    user: {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarTone: user.avatarTone,
      avatarUrl: user.avatarUrl,
    },
  }
}

type ChannelMembersForBroadcasts = {
  id: number
  title: string
  ownerId: number
  participants: Array<{
    role: string
    user: {
      id: number
      firstName: string
      lastName: string | null
      email: string
      avatarTone: string | null
      avatarUrl: string | null
    }
  }>
} | null

export async function getChannelMembersForBroadcasts(
  channelId: number
): Promise<ChannelMembersForBroadcasts> {
  return prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      title: true,
      ownerId: true,
      participants: {
        select: {
          role: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarTone: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  }) as Promise<ChannelMembersForBroadcasts>
}
