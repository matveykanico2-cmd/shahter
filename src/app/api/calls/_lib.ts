import { NextResponse, type NextRequest } from "next/server"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"

export async function getAuthorizedCallContext(request: NextRequest) {
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

type DialogUsersForCalls = {
  id: number
  users: Array<{
    id: number
    firstName: string
    lastName: string | null
    email: string
    avatarTone: string | null
    avatarUrl: string | null
  }>
} | null

export async function getDialogUsersForCalls(dialogId: number): Promise<DialogUsersForCalls> {
  return prisma.dialog.findUnique({
    where: { id: dialogId },
    select: {
      id: true,
      users: {
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
  }) as Promise<DialogUsersForCalls>
}
