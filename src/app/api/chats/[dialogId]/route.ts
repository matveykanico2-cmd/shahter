import { type NextRequest, NextResponse } from "next/server"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"

function parseDialogId(value: string) {
  const dialogId = Number(value)
  return Number.isInteger(dialogId) && dialogId > 0 ? dialogId : null
}

function canDeleteDialog(dialog: DbRow, userId: number) {
  if (dialog.users.length === 2) {
    return dialog.users.some((user: DbRow) => user.id === userId)
  }

  return dialog.ownerId === userId
}

export async function DELETE(
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
        },
      },
    },
  })

  if (!dialog) {
    return NextResponse.json({ message: "Чат не найден" }, { status: 404 })
  }

  if (!canDeleteDialog(dialog, userId)) {
    return NextResponse.json(
      { message: "Удалять групповой чат может только его владелец" },
      { status: 403 }
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.message.deleteMany({
      where: { dialogId },
    })
    await tx.dialog.deleteMany({
      where: { id: dialogId },
    })
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
