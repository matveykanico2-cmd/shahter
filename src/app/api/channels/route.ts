import { type NextRequest, NextResponse } from "next/server"

import { createChannelSchema } from "@/features/channels/model/schemas"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"
import { isPrismaKnownRequestError } from "@/shared/lib/db/prisma-errors"
import {
  deleteUploadedFileByUrl,
  saveAvatarFile,
  validateAvatarFile,
} from "@/shared/lib/media/uploads"
import { normalizeUsername, reserveUsername } from "@/shared/lib/usernames"

function isFileLike(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    typeof value.size === "number" &&
    "name" in value &&
    typeof value.name === "string" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  )
}

export async function POST(request: NextRequest) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const contentType = request.headers.get("content-type") ?? ""
  let payload: unknown = null
  let avatarFile: File | null = null

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData().catch(() => null)
      const channelValue = formData?.get("channel") ?? null
      if (typeof channelValue === "string") {
        payload = JSON.parse(channelValue)
      }
      const avatarValue = formData?.get("avatarFile") ?? null
      avatarFile = isFileLike(avatarValue) && avatarValue.size > 0 ? avatarValue : null
    } else {
      payload = await request.json().catch(() => null)
    }
  } catch {
    return NextResponse.json(
      {
        message: "Ошибка валидации",
        fieldErrors: {
          channel: ["Некорректные данные канала"],
        },
      },
      { status: 400 }
    )
  }

  const parsed = createChannelSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Ошибка валидации",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  let avatarUrl: string | null = null
  if (avatarFile) {
    const avatarError = validateAvatarFile(avatarFile)
    if (avatarError) {
      return NextResponse.json(
        {
          message: "Ошибка валидации",
          fieldErrors: {
            avatarFile: [avatarError],
          },
        },
        { status: 400 }
      )
    }

    avatarUrl = (await saveAvatarFile(avatarFile)).url
  }

  try {
    const channel = await prisma.$transaction(async (tx) => {
      const created = await tx.channel.create({
        data: {
          title: parsed.data.title,
          username: normalizeUsername(parsed.data.username),
          description: parsed.data.description?.trim() || null,
          avatarUrl,
          ownerId: userId,
          participants: {
            create: {
              userId,
              role: "OWNER",
            },
          },
        },
        select: {
          id: true,
          title: true,
          username: true,
          description: true,
          avatarUrl: true,
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

      await reserveUsername(tx, parsed.data.username, "channel", created.id)
      return created
    })

    return NextResponse.json(
      {
        channel: {
          id: channel.id,
          title: channel.title,
          username: channel.username,
          description: channel.description,
          avatarUrl: channel.avatarUrl,
          ownerId: channel.ownerId,
          participants: channel.participants.map((participant: DbRow) => ({
            channelRole: participant.role,
            ...participant.user,
          })),
          lastMessage: null,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    await deleteUploadedFileByUrl(avatarUrl)

    if (isPrismaKnownRequestError(error, "P2002")) {
      const targets = Array.isArray(error.meta?.target) ? error.meta.target : []
      if (targets.includes("username") || targets.includes("username_registry_username_key")) {
        return NextResponse.json(
          {
            message: "Этот username канала уже занят",
            fieldErrors: {
              username: ["Этот username канала уже занят"],
            },
          },
          { status: 409 }
        )
      }
    }

    throw error
  }
}
