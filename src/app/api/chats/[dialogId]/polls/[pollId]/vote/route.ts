import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import { voteDialogPoll } from "@/shared/lib/media/message-store"

function parsePositiveInt(value: string) {
  const result = Number(value)
  return Number.isInteger(result) && result > 0 ? result : null
}

const voteSchema = z.object({
  optionIds: z.array(z.number().int().positive()).min(1, "Выберите вариант ответа"),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dialogId: string; pollId: string }> }
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const { dialogId: dialogIdParam, pollId: pollIdParam } = await context.params
  const dialogId = parsePositiveInt(dialogIdParam)
  const pollId = parsePositiveInt(pollIdParam)
  if (!dialogId || !pollId) {
    return NextResponse.json({ message: "Неверные идентификаторы" }, { status: 400 })
  }

  const poll = await prisma.poll.findFirst({
    where: {
      id: pollId,
      message: { dialogId, dialog: { users: { some: { id: userId } } } },
    },
    select: { id: true },
  })

  if (!poll) {
    return NextResponse.json({ message: "Опрос не найден" }, { status: 404 })
  }

  const json = await request.json().catch(() => null)
  const parsed = voteSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Ошибка валидации", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const result = await voteDialogPoll(pollId, userId, parsed.data.optionIds)
  if (!result) {
    return NextResponse.json({ message: "Не удалось проголосовать" }, { status: 400 })
  }

  const updatedPoll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      options: {
        orderBy: { position: "asc" },
        include: { votes: { select: { userId: true } } },
      },
    },
  })

  type PollOptionResult = { id: number; text: string; votesCount: number; votedByMe: boolean }

  const options: PollOptionResult[] = (updatedPoll?.options ?? []).map(
    (option: { id: number; text: string; votes: { userId: number }[] }) => ({
      id: option.id,
      text: option.text,
      votesCount: option.votes.length,
      votedByMe: option.votes.some((vote) => vote.userId === userId),
    })
  )

  return NextResponse.json(
    {
      poll: {
        id: pollId,
        question: updatedPoll?.question,
        allowMultiple: Boolean(updatedPoll?.allowMultiple),
        totalVotes: options.reduce((sum, option) => sum + option.votesCount, 0),
        options,
      },
    },
    { status: 200 }
  )
}
