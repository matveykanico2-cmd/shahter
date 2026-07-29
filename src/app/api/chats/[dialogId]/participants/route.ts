import { type NextRequest, NextResponse } from "next/server"

import { updateDialogParticipantsSchema } from "@/features/chats/model/schemas"
import { findUsersWhoBlockedActor, formatBlacklistUserName } from "@/shared/lib/blacklist"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"
import { isUserOnline } from "@/shared/lib/user-activity"

function parseDialogId(value: string) {
  const dialogId = Number(value)
  return Number.isInteger(dialogId) && dialogId > 0 ? dialogId : null
}

function parseTargetUserId(value: unknown) {
  const targetUserId = Number(value)
  return Number.isInteger(targetUserId) && targetUserId > 0 ? targetUserId : null
}

function isGroupDialog(dialog: DbRow) {
  return Boolean(dialog.title?.trim()) || dialog.users.length > 2
}

async function getDialogForOwner(dialogId: number, userId: number) {
  return prisma.dialog.findFirst({
    where: {
      id: dialogId,
      users: {
        some: { id: userId },
      },
    },
    select: {
      id: true,
      ownerId: true,
      title: true,
      users: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          avatarTone: true,
          avatarUrl: true,
        },
        orderBy: { id: "asc" },
      },
    },
  })
}

function formatUserName(user: DbRow) {
  return `${user.firstName} ${user.lastName ?? ""}`.trim()
}

type ParticipantMessage = {
  id: number
  content: string
  status: string | null
  createdAt: Date
  dialogId: number
  author: {
    id: number
    firstName: string
    lastName: string | null
  }
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

  const dialog = await getDialogForOwner(dialogId, userId)
  if (!dialog) {
    return NextResponse.json({ message: "Чат не найден" }, { status: 404 })
  }
  if (dialog.ownerId !== userId) {
    return NextResponse.json(
      { message: "Управлять участниками может только админ чата" },
      { status: 403 }
    )
  }

  const json = await request.json().catch(() => null)
  const parsed = updateDialogParticipantsSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Ошибка валидации",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const existingParticipantIds = new Set(dialog.users.map((item: DbRow) => item.id))
  const participantIds = Array.from(
    new Set(
      parsed.data.participantIds.filter(
        (id) => id !== userId && !existingParticipantIds.has(id)
      )
    )
  )

  if (participantIds.length === 0) {
    return NextResponse.json(
      { message: "Выберите хотя бы одного нового пользователя" },
      { status: 400 }
    )
  }

  if (!isGroupDialog(dialog)) {
    return NextResponse.json(
      { message: "Добавлять участников можно только в групповой чат" },
      { status: 400 }
    )
  }

  const blockedByUsers = (await findUsersWhoBlockedActor(userId, participantIds)) ?? []
  if (blockedByUsers.length > 0) {
    const names = blockedByUsers.map((item) => formatBlacklistUserName(item.owner)).join(", ")
    return NextResponse.json(
      {
        message: `Нельзя добавить в чат: ${names}. Этот пользователь добавил вас в чёрный список`,
      },
      { status: 403 }
    )
  }

  const addedUsers = await prisma.user.findMany({
    where: { id: { in: participantIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      avatarTone: true,
      avatarUrl: true,
      lastSeenAt: true,
    },
    orderBy: { id: "asc" },
  })

  if (addedUsers.length !== participantIds.length) {
    return NextResponse.json({ message: "Не все пользователи найдены" }, { status: 404 })
  }

  const addedNames = addedUsers.map(formatUserName).join(", ")
  const nextTitle = isGroupDialog(dialog) ? dialog.title : dialog.title ?? "Групповой чат"
  const nextContent = `${addedNames} добавлен${addedUsers.length > 1 ? "ы" : ""} в чат`

  const message =
    ((await prisma.$transaction(async (tx) => {
      await tx.dialog.update({
        where: { id: dialogId },
        data: {
          title: nextTitle,
          users: {
            connect: participantIds.map((id) => ({ id })),
          },
        },
      })

      return tx.message.create({
        data: {
          content: nextContent,
          dialogId,
          authorId: userId,
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      })
    })) as ParticipantMessage | undefined) ?? {
      id: 0,
      content: nextContent,
      status: null,
      createdAt: new Date(),
      dialogId,
      author: {
        id: userId,
        firstName: "",
        lastName: null,
      },
    }

  return NextResponse.json(
    {
      users: addedUsers.map((addedUser) => ({
        ...addedUser,
        lastSeenAt: addedUser.lastSeenAt ? addedUser.lastSeenAt.toISOString() : null,
        isOnline: isUserOnline(addedUser.lastSeenAt),
      })),
      message: {
        id: message.id,
        content: message.content,
        status: message.status,
        createdAt: message.createdAt,
        dialogId: message.dialogId,
        author: message.author,
      },
    },
    { status: 200 }
  )
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

  const dialog = await getDialogForOwner(dialogId, userId)
  if (!dialog) {
    return NextResponse.json({ message: "Чат не найден" }, { status: 404 })
  }

  if (dialog.ownerId !== userId) {
    return NextResponse.json(
      { message: "Управлять участниками может только админ чата" },
      { status: 403 }
    )
  }

  if (!isGroupDialog(dialog)) {
    return NextResponse.json(
      { message: "Удалять участников можно только из группового чата" },
      { status: 400 }
    )
  }

  const json = await request.json().catch(() => null)
  const targetUserId = parseTargetUserId(json?.targetUserId)
  if (!targetUserId) {
    return NextResponse.json({ message: "Неверный id пользователя" }, { status: 400 })
  }

  if (targetUserId === userId || targetUserId === dialog.ownerId) {
    return NextResponse.json(
      { message: "Админ не может удалить самого себя" },
      { status: 400 }
    )
  }

  const targetUser = dialog.users.find((item: DbRow) => item.id === targetUserId)
  if (!targetUser) {
    return NextResponse.json({ message: "Участник не найден" }, { status: 404 })
  }

  const targetUserName = formatUserName(targetUser)
  const nextContent = `${targetUserName} удалён из чата`

  const message =
    ((await prisma.$transaction(async (tx) => {
      await tx.dialog.update({
        where: { id: dialogId },
        data: {
          users: {
            disconnect: { id: targetUserId },
          },
        },
      })

      return tx.message.create({
        data: {
          content: nextContent,
          dialogId,
          authorId: userId,
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      })
    })) as ParticipantMessage | undefined) ?? {
      id: 0,
      content: nextContent,
      status: null,
      createdAt: new Date(),
      dialogId,
      author: {
        id: userId,
        firstName: "",
        lastName: null,
      },
    }

  return NextResponse.json(
    {
      removedUserId: targetUserId,
      message: {
        id: message.id,
        content: message.content,
        status: message.status,
        createdAt: message.createdAt,
        dialogId: message.dialogId,
        author: message.author,
      },
    },
    { status: 200 }
  )
}
