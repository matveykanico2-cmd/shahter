import { type NextRequest, NextResponse } from "next/server"

import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import { deleteUploadedFileByUrl, saveAvatarFile, validateAvatarFile } from "@/shared/lib/media/uploads"
import { releaseUsername } from "@/shared/lib/usernames"

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

async function getOwnedPublication(publicationId: number, userId: number) {
  const publication = await prisma.botPublication.findUnique({
    where: { id: publicationId },
    select: {
      id: true,
      ownerId: true,
      name: true,
      username: true,
      niche: true,
      audience: true,
      avatarUrl: true,
      isBlocked: true,
      config: true,
      publishedAt: true,
    },
  })

  if (!publication) {
    return { error: NextResponse.json({ message: "Публикация не найдена" }, { status: 404 }) }
  }

  if (publication.ownerId !== userId) {
    return {
      error: NextResponse.json(
        { message: "Можно управлять только своими ботами" },
        { status: 403 }
      ),
    }
  }

  return { publication }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/bots/[botId]">
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const { botId } = await context.params
  const publicationId = Number(botId)
  if (!Number.isInteger(publicationId) || publicationId <= 0) {
    return NextResponse.json({ message: "Некорректный бот" }, { status: 400 })
  }

  const owned = await getOwnedPublication(publicationId, userId)
  if ("error" in owned) {
    return owned.error
  }

  const formData = await request.formData()
  const isBlockedValue = formData.get("isBlocked")
  const removeAvatarValue = formData.get("removeAvatar")
  const avatarValue = formData.get("avatarFile")
  const avatarFile = isFileLike(avatarValue) && avatarValue.size > 0 ? avatarValue : null

  const nextBlocked =
    typeof isBlockedValue === "string" ? isBlockedValue === "true" : owned.publication.isBlocked
  const removeAvatar = removeAvatarValue === "true"

  let savedAvatarUrl: string | null = null

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

  const nextAvatarUrl = removeAvatar
    ? null
    : savedAvatarUrl ?? owned.publication.avatarUrl ?? null

  try {
    const updated = await prisma.botPublication.update({
      where: { id: publicationId },
      data: {
        avatarUrl: nextAvatarUrl,
        isBlocked: nextBlocked,
      },
    })

    if (savedAvatarUrl && owned.publication.avatarUrl && owned.publication.avatarUrl !== savedAvatarUrl) {
      await deleteUploadedFileByUrl(owned.publication.avatarUrl)
    }

    if (removeAvatar && owned.publication.avatarUrl) {
      await deleteUploadedFileByUrl(owned.publication.avatarUrl)
    }

    return NextResponse.json(
      {
        bot: {
          id: updated.id,
          name: updated.name,
          username: updated.username,
          niche: updated.niche,
          audience: updated.audience,
          avatarUrl: updated.avatarUrl,
          isBlocked: updated.isBlocked,
          publishedAt: updated.publishedAt.toISOString(),
          config: updated.config,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    await deleteUploadedFileByUrl(savedAvatarUrl)
    throw error
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/bots/[botId]">
) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const { botId } = await context.params
  const publicationId = Number(botId)
  if (!Number.isInteger(publicationId) || publicationId <= 0) {
    return NextResponse.json({ message: "Некорректный бот" }, { status: 400 })
  }

  const publication = await prisma.botPublication.findUnique({
    where: { id: publicationId },
    select: { id: true, ownerId: true, avatarUrl: true },
  })

  if (!publication) {
    return NextResponse.json({ message: "Публикация не найдена" }, { status: 404 })
  }

  if (publication.ownerId !== userId) {
    return NextResponse.json({ message: "Можно удалять только свои публикации" }, { status: 403 })
  }

  if (typeof prisma.$transaction === "function") {
    await prisma.$transaction(async (tx) => {
      await releaseUsername(tx, "bot", publicationId)
      await tx.botPublication.delete({
        where: { id: publicationId },
      })
    })
  } else {
    await prisma.botPublication.delete({
      where: { id: publicationId },
    })
  }

  await deleteUploadedFileByUrl(publication.avatarUrl)

  return NextResponse.json({ ok: true }, { status: 200 })
}
