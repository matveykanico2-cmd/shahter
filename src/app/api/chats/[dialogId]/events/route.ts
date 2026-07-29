import { type NextRequest, NextResponse } from "next/server"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { clearUserTyping, getTypingUserIds } from "@/shared/lib/chat-typing"
import { prisma } from "@/shared/lib/db/prisma"
import { getDialogMessages } from "@/shared/lib/media/message-store"
import { touchUserActivity } from "@/shared/lib/user-activity"

export const runtime = "nodejs"

const MESSAGE_STATUS = {
  DELIVERED: "DELIVERED",
  READ: "READ",
} as const

function parseDialogId(value: string) {
  const dialogId = Number(value)
  return Number.isInteger(dialogId) && dialogId > 0 ? dialogId : null
}

function createSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function getDialogRemovalReason(dialogId: number) {
  const existingDialog = await prisma.dialog.findUnique({
    where: { id: dialogId },
    select: { id: true },
  })

  return existingDialog ? "removed" : "deleted"
}

export async function GET(
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

  const hasAccess = await prisma.dialog.findFirst({
    where: { id: dialogId, users: { some: { id: userId } } },
    select: { id: true },
  })

  if (!hasAccess) {
    const reason = await getDialogRemovalReason(dialogId)
    return NextResponse.json(
      {
        code: reason === "removed" ? "REMOVED_FROM_CHAT" : "CHAT_DELETED",
        message: reason === "removed" ? "Вас удалили из чата" : "Чат не найден",
      },
      { status: 404 }
    )
  }

  const since = Number(request.nextUrl.searchParams.get("since") ?? "0")
  let lastSeenId = Number.isInteger(since) && since > 0 ? since : 0
  let polling = false
  let statusCursor = new Date()
  let previousTypingSerialized = ""

  const encoder = new TextEncoder()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let activityTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false
      const send = (payload: string) => {
        controller.enqueue(encoder.encode(payload))
      }

      const stop = () => {
        if (stopped) {
          return
        }
        stopped = true
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        if (activityTimer) {
          clearInterval(activityTimer)
          activityTimer = null
        }
        clearUserTyping(dialogId, userId)
        try {
          controller.close()
        } catch {
          // Stream may already be closed by runtime.
        }
        request.signal.removeEventListener("abort", stop)
      }

      const poll = async () => {
        if (polling || stopped) {
          return
        }

        polling = true
        try {
          const stillHasAccess = await prisma.dialog.findFirst({
            where: { id: dialogId, users: { some: { id: userId } } },
            select: { id: true },
          })

          if (!stillHasAccess) {
            const reason = await getDialogRemovalReason(dialogId)
            send(
              createSseEvent(reason === "removed" ? "chat-removed" : "chat-deleted", {
                dialogId,
              })
            )
            stop()
            return
          }

          const messages = (await getDialogMessages(dialogId, userId)).filter(
            (message) => message.id > lastSeenId
          )

          for (const message of messages) {
            lastSeenId = message.id
            send(createSseEvent("message", message))
          }

          const nextCursor = new Date()
          const statusUpdates = await prisma.message.findMany({
            where: {
              dialogId,
              authorId: userId,
              status: { in: [MESSAGE_STATUS.DELIVERED, MESSAGE_STATUS.READ] },
              updatedAt: {
                gt: statusCursor,
                lte: nextCursor,
              },
            },
            select: {
              id: true,
              status: true,
              updatedAt: true,
            },
            orderBy: { id: "asc" },
          })
          statusCursor = nextCursor

          for (const update of statusUpdates) {
            send(
              createSseEvent("status", {
                id: update.id,
                status: update.status,
                updatedAt: update.updatedAt,
              })
            )
          }

          const typingUserIds = getTypingUserIds(dialogId, userId)
          const serializedTyping = JSON.stringify(typingUserIds)
          if (serializedTyping !== previousTypingSerialized) {
            previousTypingSerialized = serializedTyping
            send(createSseEvent("typing", { userIds: typingUserIds }))
          }
        } catch {
          send(createSseEvent("chat-error", { message: "Ошибка обновления чата" }))
        } finally {
          polling = false
        }
      }

      send(createSseEvent("ready", { dialogId, since: lastSeenId }))
      void poll()
      pollTimer = setInterval(() => {
        void poll()
      }, 1500)

      heartbeatTimer = setInterval(() => {
        send(": ping\n\n")
      }, 15000)

      activityTimer = setInterval(() => {
        void touchUserActivity(userId)
      }, 60000)

      request.signal.addEventListener("abort", stop)
    },
    cancel() {
      if (pollTimer) {
        clearInterval(pollTimer)
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
      }
      if (activityTimer) {
        clearInterval(activityTimer)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
