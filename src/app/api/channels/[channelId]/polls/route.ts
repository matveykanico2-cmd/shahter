import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getActiveBroadcastForChannel } from "@/features/channels/lib/broadcast-store"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import { createChannelPoll } from "@/shared/lib/media/message-store"

function parseChannelId(value: string) {
  const channelId = Number(value)
  return Number.isInteger(channelId) && channelId > 0 ? channelId : null
}

async function getMembership(channelId: number, userId: number) {
  return prisma.channelParticipant.findFirst({
    where: { channelId, userId },
    select: { role: true },
  })
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

  const json = await request.json().catch(() => null)
  const parsed = createPollSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Ошибка валидации", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const message = await createChannelPoll({
    channelId,
    authorId: userId,
    question: parsed.data.question,
    options: parsed.data.options,
    allowMultiple: parsed.data.allowMultiple,
  })

  return NextResponse.json({ message }, { status: 201 })
}
