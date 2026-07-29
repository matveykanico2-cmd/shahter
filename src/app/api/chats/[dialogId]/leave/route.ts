import { type NextRequest, NextResponse } from "next/server"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"

function parseDialogId(value: string) {
  const dialogId = Number(value)
  return Number.isInteger(dialogId) && dialogId > 0 ? dialogId : null
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dialogId: string }> }
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const { dialogId: dialogIdParam } = await context.params
  const dialogId = parseDialogId(dialogIdParam)
  if (!dialogId) {
    return NextResponse.json({ message: "Неверный id чата" }, { status: 400 })
  }

  const dialog = await prisma.dialog.findFirst({
    where: {
      id: dialogId,
      users: {
        some: { id: userId },
      },
    },
    select: {
      id: true,
      ownerId: true,
      users: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
        orderBy: { id: "asc" },
      },
    },
  })

  if (!dialog) {
    return NextResponse.json({ message: "Чат не найден" }, { status: 404 })
  }

  if (dialog.users.length <= 2) {
    return NextResponse.json(
      { message: "Покинуть можно только групповой чат с более чем двумя участниками" },
      { status: 400 }
    )
  }

  const currentUser = dialog.users.find((item: DbRow) => item.id === userId)
  if (!currentUser) {
    return NextResponse.json({ message: "Чат не найден" }, { status: 404 })
  }

  const remainingUsers = dialog.users.filter((item: DbRow) => item.id !== userId)
  const nextOwnerId = dialog.ownerId === userId ? remainingUsers[0]?.id ?? dialog.ownerId : dialog.ownerId
  const userName = `${currentUser.firstName} ${currentUser.lastName ?? ""}`.trim()

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        content: `${userName} покинул чат`,
        dialogId,
        authorId: userId,
      },
    })

    await tx.dialog.update({
      where: { id: dialogId },
      data: {
        ownerId: nextOwnerId,
        users: {
          disconnect: { id: userId },
        },
      },
    })
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
