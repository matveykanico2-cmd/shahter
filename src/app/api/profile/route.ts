import { type NextRequest, NextResponse } from "next/server"

import { updateProfileSchema } from "@/features/profile/model/schemas"
import {
  AUTH_SESSION_COOKIE,
  AUTH_TOKEN_COOKIE,
  clearAuthCookies,
  createAuthToken,
  setAuthCookies,
  verifyAuthToken,
} from "@/shared/lib/auth/session"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"
import { isPrismaKnownRequestError } from "@/shared/lib/db/prisma-errors"
import { deleteUploadedFileByUrl, saveAvatarFile, validateAvatarFile } from "@/shared/lib/media/uploads"
import { touchUserActivity } from "@/shared/lib/user-activity"
import { normalizeUsername, releaseUsername, updateReservedUsername } from "@/shared/lib/usernames"

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

async function getCurrentAvatarUrl(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })

  return user?.avatarUrl ?? null
}

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value
    const sessionId = request.cookies.get(AUTH_SESSION_COOKIE)?.value

    if (!token || !sessionId) {
      return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
    }

    const payload = await verifyAuthToken(token)
    if (!payload || payload.sid !== sessionId) {
      return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
    }

    await touchUserActivity(payload.userId)

    const contentType = request.headers.get("content-type") ?? ""
    let avatarFile: File | null = null
    let parsedPayload: unknown = null

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const profileValue = formData.get("profile")
      parsedPayload = typeof profileValue === "string" ? JSON.parse(profileValue) : null
      const avatarValue = formData.get("avatarFile")
      avatarFile = isFileLike(avatarValue) && avatarValue.size > 0 ? avatarValue : null
    } else {
      parsedPayload = await request.json()
    }

    const parsed = updateProfileSchema.safeParse(parsedPayload)

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      return NextResponse.json(
        {
          message: "Ошибка валидации",
          fieldErrors,
        },
        { status: 400 }
      )
    }

    let savedAvatarUrl: string | null | undefined
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

      savedAvatarUrl = (await saveAvatarFile(avatarFile)).url
    }

    const data = parsed.data
    const previousAvatarUrl =
      typeof savedAvatarUrl === "undefined" ? null : await getCurrentAvatarUrl(payload.userId)

    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: payload.userId },
        data: {
          email: data.email.toLowerCase(),
          firstName: data.firstName,
          lastName: data.lastName || null,
          username: normalizeUsername(data.username),
          phone: data.phone,
          avatarTone: data.avatarTone,
          profileVisibility: data.profileVisibility,
          showEmailInProfile: data.showEmailInProfile,
          showPhoneInProfile: data.showPhoneInProfile,
          showGiftsInProfile: data.showGiftsInProfile,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          username: true,
          phone: true,
          avatarTone: true,
          profileVisibility: true,
          showEmailInProfile: true,
          showPhoneInProfile: true,
          showGiftsInProfile: true,
        },
      })

      await updateReservedUsername(tx, data.username, "user", payload.userId)
      return nextUser
    })

    const avatarUrl = typeof savedAvatarUrl === "undefined" ? previousAvatarUrl : savedAvatarUrl

    if (typeof savedAvatarUrl !== "undefined") {
      await prisma.user.update({
        where: { id: payload.userId },
        data: { avatarUrl: savedAvatarUrl },
      })
      await deleteUploadedFileByUrl(previousAvatarUrl)
    }

    const nextToken = await createAuthToken({
      userId: updated.id,
      email: updated.email,
      sid: sessionId,
    })

    const response = NextResponse.json(
      {
        user: {
          ...updated,
          avatarUrl,
        },
      },
      { status: 200 }
    )
    setAuthCookies(response, { token: nextToken, sessionId })
    return response
  } catch (error) {
    if (isPrismaKnownRequestError(error, "P2002")) {
      const targets = Array.isArray(error.meta?.target) ? error.meta.target : []
      const usernameConflict =
        targets.includes("username") || targets.includes("username_registry_username_key")

      return NextResponse.json(
        {
          message: usernameConflict
            ? "Этот username уже занят"
            : "Пользователь с таким email уже существует",
          fieldErrors: usernameConflict
            ? {
                username: ["Этот username уже занят"],
              }
            : {
                email: ["Пользователь с таким email уже существует"],
              },
        },
        { status: 409 }
      )
    }

    return NextResponse.json({ message: "Внутренняя ошибка сервера" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value
    const sessionId = request.cookies.get(AUTH_SESSION_COOKIE)?.value

    if (!token || !sessionId) {
      return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
    }

    const payload = await verifyAuthToken(token)
    if (!payload || payload.sid !== sessionId) {
      return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
    }

    await touchUserActivity(payload.userId)

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        dialogs: {
          select: {
            id: true,
            ownerId: true,
            users: {
              select: { id: true },
              orderBy: { id: "asc" },
            },
          },
        },
      },
    })

    if (!user) {
      const response = NextResponse.json({ ok: true }, { status: 200 })
      clearAuthCookies(response)
      return response
    }

    await prisma.$transaction(async (tx) => {
      for (const dialog of user.dialogs) {
        const remainingUserIds = dialog.users
          .map((item: DbRow) => item.id)
          .filter((id: number) => id !== user.id)

        if (remainingUserIds.length === 0) {
          await tx.message.deleteMany({
            where: { dialogId: dialog.id },
          })

          await tx.dialog.delete({
            where: { id: dialog.id },
          })
          continue
        }

        const nextOwnerId =
          dialog.ownerId === user.id ? remainingUserIds[0] : dialog.ownerId

        await tx.dialog.update({
          where: { id: dialog.id },
          data: {
            ownerId: nextOwnerId,
            users: {
              disconnect: { id: user.id },
            },
          },
        })
      }

      await tx.message.deleteMany({
        where: { authorId: user.id },
      })

      await releaseUsername(tx, "user", user.id)

      await tx.user.delete({
        where: { id: user.id },
      })
    })

    const response = NextResponse.json({ ok: true }, { status: 200 })
    clearAuthCookies(response)
    return response
  } catch {
    return NextResponse.json({ message: "Внутренняя ошибка сервера" }, { status: 500 })
  }
}
