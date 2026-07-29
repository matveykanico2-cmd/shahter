import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { formatBlacklistUserName } from "@/shared/lib/blacklist"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import { canWriteToDialog } from "@/shared/lib/direct-message-access"
import { createDialogPoll } from "@/shared/lib/media/message-store"
import { sendPushToDialogRecipients } from "@/shared/lib/notifications/push"

function parseDialogId(value: string) {
  const dialogId = Number(value)
  return Number.isInteger(dialogId) && dialogId > 0 ? dialogId : null
}

async function checkDialogAccess(dialogId: number, userId: number) {
  const dialog = await prisma.dialog.findFirst({
    where: { id: dialogId, users: { some: { id: userId } } },
    select: { id: true },
  })
  return Boolean(dialog)
}

const createPollSchema = z.object({
  question: z.string().trim().min(1, "Введите вопрос").max(300, "Вопрос слишком длинный"),
  options: z
    .array(z.string().trim().min(1, "Вариант не может быть пустым").max(120, "Вариант слишком длинный"))
    .min(2, "Добавьте минимум 2 варианта")
    .max(10, "Не больше 10 вариантов"),
  allowMultiple: z.boolean().default(false),
})

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

  const hasAccess = await checkDialogAccess(dialogId, userId)
  if (!hasAccess) {
    return NextResponse.json({ message: "Чат не найден" }, { status: 404 })
  }

  const writeAccess = await canWriteToDialog(dialogId, userId)
  if (!writeAccess.ok && writeAccess.code === "CONTACT_REQUIRED") {
    return NextResponse.json(
      { message: "Этому пользователю могут писать только люди из его контактов" },
      { status: 403 }
    )
  }

  const json = await request.json().catch(() => null)
  const parsed = createPollSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Ошибка валидации", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const blockedByUsers = await prisma.userBlacklist.findMany({
    where: {
      blockedUserId: userId,
      owner: { dialogs: { some: { id: dialogId } } },
    },
    select: { owner: { select: { id: true, firstName: true, lastName: true } } },
  })

  if (blockedByUsers.length > 0) {
    const names = blockedByUsers.map((item) => formatBlacklistUserName(item.owner)).join(", ")
    return NextResponse.json(
      { message: `Вы не можете писать в этот чат. Вас добавили в чёрный список: ${names}` },
      { status: 403 }
    )
  }

  const message = await createDialogPoll({
    dialogId,
    authorId: userId,
    question: parsed.data.question,
    options: parsed.data.options,
    allowMultiple: parsed.data.allowMultiple,
  })

  void sendPushToDialogRecipients({
    dialogId,
    authorId: userId,
    authorName: `${message.author.firstName} ${message.author.lastName ?? ""}`.trim(),
    content: `📊 ${parsed.data.question}`,
  })

  return NextResponse.json({ message }, { status: 201 })
}
