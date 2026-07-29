import { type NextRequest, NextResponse } from "next/server"

import { createNewsPostSchema } from "@/features/feed/model/schemas"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"
import { prisma } from "@/shared/lib/db/prisma"
import type { MediaAttachment } from "@/shared/lib/media/constants"
import { deleteUploadedFileByUrl, saveMessageFile, validateMessageFile } from "@/shared/lib/media/uploads"

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

function mapAttachment(item: {
  kind: string
  url: string
  name: string
  mime: string
  size: number
}): MediaAttachment {
  return {
    kind: item.kind as MediaAttachment["kind"],
    url: item.url,
    name: item.name,
    mime: item.mime,
    size: item.size,
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthorizedUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ message: "Не авторизован" }, { status: 401 })
  }

  const contentType = request.headers.get("content-type") ?? ""
  let parsedPayload: unknown = null
  let attachmentFiles: File[] = []

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json({ message: "Некорректная форма" }, { status: 400 })
    }

    parsedPayload = {
      content: typeof formData.get("content") === "string" ? String(formData.get("content")) : "",
    }

    attachmentFiles = formData
      .getAll("attachments")
      .filter((item): item is File => isFileLike(item) && item.size > 0)
  } else {
    parsedPayload = await request.json().catch(() => null)
  }

  const parsed = createNewsPostSchema.safeParse(parsedPayload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Ошибка валидации",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  if (!parsed.data.content && attachmentFiles.length === 0) {
    return NextResponse.json(
      {
        message: "Ошибка валидации",
        fieldErrors: {
          content: ["Добавьте текст или прикрепите файл"],
        },
      },
      { status: 400 }
    )
  }

  const savedAttachments: Array<Awaited<ReturnType<typeof saveMessageFile>>> = []

  try {
    for (const file of attachmentFiles) {
      const validationError = validateMessageFile("FILE", file)
      if (validationError) {
        return NextResponse.json(
          {
            message: "Ошибка валидации",
            fieldErrors: {
              attachment: [validationError],
            },
          },
          { status: 400 }
        )
      }

      savedAttachments.push(await saveMessageFile("FILE", file))
    }

    const post = await prisma.newsPost.create({
      data: {
        authorId: userId,
        content: parsed.data.content,
        mediaKind: savedAttachments[0] ? "FILE" : null,
        mediaUrl: savedAttachments[0]?.url ?? null,
        mediaName: savedAttachments[0]?.name ?? null,
        mediaMime: savedAttachments[0]?.mime ?? null,
        mediaSize: savedAttachments[0]?.size ?? null,
        attachments: savedAttachments.length
          ? {
              create: savedAttachments.map((attachment, index) => ({
                kind: "FILE",
                url: attachment.url,
                name: attachment.name,
                mime: attachment.mime,
                size: attachment.size,
                position: index,
              })),
            }
          : undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            avatarTone: true,
            avatarUrl: true,
            isBlocked: true,
          },
        },
        attachments: {
          orderBy: { position: "asc" },
        },
      },
    })

    return NextResponse.json(
      {
        post: {
          id: post.id,
          content: post.content,
          createdAt: post.createdAt.toISOString(),
          author: post.author,
          attachment: post.attachments.map(mapAttachment),
          likesCount: 0,
          likedByMe: false,
          comments: [],
        },
      },
      { status: 201 }
    )
  } catch (error) {
    for (const attachment of savedAttachments) {
      await deleteUploadedFileByUrl(attachment.url)
    }

    throw error
  }
}
