import { z } from "zod"

import { DEFAULT_MEDIA_LABELS, MEDIA_KIND_VALUES, type MediaKind } from "./constants"

const contentSchema = z
  .string()
  .trim()
  .max(1000, "Сообщение слишком длинное")

export type ParsedMessageInput = {
  content: string
  attachments: Array<{
    kind: MediaKind
    file: File
  }>
  replyToMessageId: number | null
}

function parseReplyToMessageId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

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

export async function parseMessageInput(
  request: Request
): Promise<
  | { success: true; data: ParsedMessageInput }
  | {
      success: false
      fieldErrors: Record<string, string[] | undefined>
    }
> {
  const contentType = request.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null)

    if (!formData) {
      return { success: false, fieldErrors: { content: ["Некорректная форма"] } }
    }

    const rawContent = typeof formData.get("content") === "string" ? String(formData.get("content")) : ""
    const parsedContent = contentSchema.safeParse(rawContent)
    if (!parsedContent.success) {
      return {
        success: false,
        fieldErrors: {
          content: parsedContent.error.issues.map((issue) => issue.message),
        },
      }
    }

    const replyToMessageId = parseReplyToMessageId(formData.get("replyToMessageId"))

    const files = formData
      .getAll("attachments")
      .filter((item): item is File => isFileLike(item) && item.size > 0)
    const kindValues = formData.getAll("attachmentKinds")

    if (files.length === 0) {
      if (!parsedContent.data) {
        return { success: false, fieldErrors: { content: ["Введите сообщение"] } }
      }

      return {
        success: true,
        data: {
          content: parsedContent.data,
          attachments: [],
          replyToMessageId,
        },
      }
    }

    if (files.length !== kindValues.length) {
      return { success: false, fieldErrors: { attachment: ["Некорректный набор вложений"] } }
    }

    const attachments: ParsedMessageInput["attachments"] = []

    for (let index = 0; index < files.length; index += 1) {
      const parsedKind = z.enum(MEDIA_KIND_VALUES).safeParse(kindValues[index])
      if (!parsedKind.success) {
        return { success: false, fieldErrors: { attachment: ["Неизвестный тип вложения"] } }
      }

      attachments.push({
        kind: parsedKind.data,
        file: files[index],
      })
    }

    return {
      success: true,
      data: {
        content: parsedContent.data || DEFAULT_MEDIA_LABELS[attachments[0]?.kind ?? "FILE"],
        attachments,
        replyToMessageId,
      },
    }
  }

  const json = await request.json().catch(() => null)
  const parsed = z
    .object({
      content: contentSchema.min(1, "Введите сообщение"),
      replyToMessageId: z.number().int().positive().nullish(),
    })
    .safeParse(json)

  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  return {
    success: true,
    data: {
      content: parsed.data.content,
      attachments: [],
      replyToMessageId: parsed.data.replyToMessageId ?? null,
    },
  }
}
