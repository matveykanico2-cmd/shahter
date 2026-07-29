import { prisma, type DbRow } from "@/shared/lib/db/prisma"

import type { MediaAttachment } from "./constants"

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapAttachment(item: DbRow): MediaAttachment {
  return {
    kind: item.kind as MediaAttachment["kind"],
    url: item.url,
    name: item.name,
    mime: item.mime,
    size: item.size,
  }
}

function mapLegacyAttachment(row: {
  mediaKind?: string | null
  mediaUrl?: string | null
  mediaName?: string | null
  mediaMime?: string | null
  mediaSize?: number | null
}) {
  if (!row.mediaKind || !row.mediaUrl || !row.mediaName || !row.mediaMime || row.mediaSize == null) {
    return []
  }

  return [
    {
      kind: row.mediaKind as MediaAttachment["kind"],
      url: row.mediaUrl,
      name: row.mediaName,
      mime: row.mediaMime,
      size: row.mediaSize,
    },
  ] satisfies MediaAttachment[]
}

function mapAttachmentList(row: DbRow) {
  return (row.attachments ?? []).length > 0
    ? (row.attachments as DbRow[]).map(mapAttachment)
    : mapLegacyAttachment(row)
}

function mapReplyPreview(replyToMessage: DbRow | null | undefined) {
  if (!replyToMessage) {
    return null
  }

  return {
    id: replyToMessage.id,
    content: replyToMessage.content,
    author: replyToMessage.author,
  }
}

function mapForwardedFrom(row: DbRow) {
  if (!row.forwardedFromAuthorName) {
    return null
  }

  return {
    authorId: row.forwardedFromAuthorId ?? null,
    authorName: row.forwardedFromAuthorName,
  }
}

function mapReactions(reactions: DbRow[] | undefined, viewerUserId: number) {
  const byEmoji = new Map<string, { count: number; reactedByMe: boolean }>()

  for (const reaction of reactions ?? []) {
    const entry = byEmoji.get(reaction.emoji as string) ?? { count: 0, reactedByMe: false }
    entry.count += 1
    if (reaction.userId === viewerUserId) {
      entry.reactedByMe = true
    }
    byEmoji.set(reaction.emoji as string, entry)
  }

  return Array.from(byEmoji.entries()).map(([emoji, value]) => ({
    emoji,
    count: value.count,
    reactedByMe: value.reactedByMe,
  }))
}

function mapPoll(poll: DbRow | undefined, viewerUserId: number) {
  if (!poll) {
    return null
  }

  const options = ((poll.options as DbRow[]) ?? [])
    .slice()
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((option) => {
      const votes = (option.votes as DbRow[]) ?? []
      return {
        id: option.id,
        text: option.text,
        votesCount: votes.length,
        votedByMe: votes.some((vote) => vote.userId === viewerUserId),
      }
    })

  return {
    id: poll.id,
    question: poll.question,
    allowMultiple: Boolean(poll.allowMultiple),
    totalVotes: options.reduce((sum, option) => sum + option.votesCount, 0),
    options,
  }
}

const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarTone: true,
  avatarUrl: true,
} as const

const REPLY_INCLUDE = {
  replyToMessage: {
    select: {
      id: true,
      content: true,
      author: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const

const POLL_INCLUDE = {
  polls: {
    include: {
      options: {
        orderBy: { position: "asc" },
        include: { votes: { select: { userId: true } } },
      },
    },
  },
} as const

export async function getDialogMessages(dialogId: number, viewerUserId: number) {
  const rows = await prisma.message.findMany({
    where: { dialogId },
    orderBy: { id: "asc" },
    include: {
      author: { select: AUTHOR_SELECT },
      attachments: { orderBy: { position: "asc" } },
      reactions: { select: { userId: true, emoji: true } },
      ...REPLY_INCLUDE,
      ...POLL_INCLUDE,
    },
  })

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    status: row.status,
    createdAt: toIsoString(row.createdAt),
    dialogId: row.dialogId,
    author: row.author,
    attachment: mapAttachmentList(row),
    replyTo: mapReplyPreview(row.replyToMessage),
    forwardedFrom: mapForwardedFrom(row),
    reactions: mapReactions(row.reactions, viewerUserId),
    poll: mapPoll((row.polls as DbRow[])?.[0], viewerUserId),
  }))
}

export async function getDialogMessage(messageId: number, dialogId: number, viewerUserId: number) {
  const row = await prisma.message.findFirst({
    where: { id: messageId, dialogId },
    include: {
      author: { select: AUTHOR_SELECT },
      attachments: { orderBy: { position: "asc" } },
      reactions: { select: { userId: true, emoji: true } },
      ...REPLY_INCLUDE,
      ...POLL_INCLUDE,
    },
  })

  if (!row) {
    return null
  }

  return {
    id: row.id,
    content: row.content,
    status: row.status,
    createdAt: toIsoString(row.createdAt),
    dialogId: row.dialogId,
    authorId: row.authorId,
    author: row.author,
    attachment: mapAttachmentList(row),
    replyTo: mapReplyPreview(row.replyToMessage),
    forwardedFrom: mapForwardedFrom(row),
    reactions: mapReactions(row.reactions, viewerUserId),
    poll: mapPoll((row.polls as DbRow[])?.[0], viewerUserId),
  }
}

export async function createDialogMessage(input: {
  content: string
  dialogId: number
  authorId: number
  status: string
  attachments?: MediaAttachment[]
  replyToMessageId?: number | null
  forwardedFromAuthorId?: number | null
  forwardedFromAuthorName?: string | null
}) {
  const created = await prisma.message.create({
    data: {
      content: input.content,
      status: input.status,
      dialogId: input.dialogId,
      authorId: input.authorId,
      replyToMessageId: input.replyToMessageId ?? null,
      forwardedFromAuthorId: input.forwardedFromAuthorId ?? null,
      forwardedFromAuthorName: input.forwardedFromAuthorName ?? null,
      attachments: input.attachments?.length
        ? {
            create: input.attachments.map((attachment, index) => ({
              kind: attachment.kind,
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
      author: { select: AUTHOR_SELECT },
      attachments: { orderBy: { position: "asc" } },
      ...REPLY_INCLUDE,
    },
  })

  return {
    id: created.id,
    content: created.content,
    status: created.status,
    createdAt: toIsoString(created.createdAt),
    dialogId: created.dialogId,
    author: created.author,
    attachment: (created.attachments ?? []).map(mapAttachment),
    replyTo: mapReplyPreview(created.replyToMessage),
    forwardedFrom: mapForwardedFrom(created),
    reactions: [] as Array<{ emoji: string; count: number; reactedByMe: boolean }>,
    poll: null as ReturnType<typeof mapPoll>,
  }
}

export async function createDialogPoll(input: {
  dialogId: number
  authorId: number
  question: string
  options: string[]
  allowMultiple: boolean
}) {
  const created = await prisma.message.create({
    data: {
      content: input.question,
      dialogId: input.dialogId,
      authorId: input.authorId,
      polls: {
        create: {
          question: input.question,
          allowMultiple: input.allowMultiple,
          options: {
            create: input.options.map((text, index) => ({ text, position: index })),
          },
        },
      },
    },
    include: {
      author: { select: AUTHOR_SELECT },
      attachments: { orderBy: { position: "asc" } },
      ...POLL_INCLUDE,
    },
  })

  return {
    id: created.id,
    content: created.content,
    status: created.status,
    createdAt: toIsoString(created.createdAt),
    dialogId: created.dialogId,
    author: created.author,
    attachment: mapAttachmentList(created),
    replyTo: null,
    forwardedFrom: null,
    reactions: [] as Array<{ emoji: string; count: number; reactedByMe: boolean }>,
    poll: mapPoll((created.polls as DbRow[])?.[0], input.authorId),
  }
}

export async function setDialogMessageReaction(messageId: number, userId: number, emoji: string | null) {
  if (emoji === null) {
    await prisma.messageReaction.deleteMany({ where: { messageId, userId } })
    return
  }

  await prisma.messageReaction.upsert({
    where: { messageId_userId: { messageId, userId } },
    update: { emoji },
    create: { messageId, userId, emoji },
  })
}

export async function voteDialogPoll(pollId: number, userId: number, optionIds: number[]) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { id: true, allowMultiple: true, options: { select: { id: true } } },
  })

  if (!poll) {
    return null
  }

  const validOptionIds = new Set((poll.options as DbRow[]).map((option) => option.id))
  const requestedOptionIds = optionIds.filter((id) => validOptionIds.has(id))

  if (requestedOptionIds.length === 0) {
    return null
  }

  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.pollVote.deleteMany({
      where: { userId, pollOption: { pollId } },
    })

    const optionsToVote = poll.allowMultiple ? requestedOptionIds : requestedOptionIds.slice(0, 1)
    for (const pollOptionId of optionsToVote) {
      await tx.pollVote.create({ data: { pollOptionId, userId } })
    }
  })

  return true
}

export async function getDialogMessageMedia(messageId: number, dialogId: number) {
  const row = await prisma.message.findFirst({
    where: { id: messageId, dialogId },
    select: {
      mediaKind: true,
      mediaUrl: true,
      attachments: {
        orderBy: { position: "asc" },
        select: {
          url: true,
        },
      },
    },
  })

  if (!row) {
    return null
  }

  return {
    media_kind: row.mediaKind,
    media_url: row.mediaUrl,
    attachment_urls: row.attachments.map((item: DbRow) => item.url),
  }
}

export async function getChannelMessages(channelId: number, viewerUserId: number) {
  const rows = await prisma.channelMessage.findMany({
    where: { channelId },
    orderBy: { id: "asc" },
    include: {
      author: { select: AUTHOR_SELECT },
      attachments: { orderBy: { position: "asc" } },
      reactions: { select: { userId: true, emoji: true } },
      ...REPLY_INCLUDE,
      ...POLL_INCLUDE,
    },
  })

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    channelId: row.channelId,
    createdAt: toIsoString(row.createdAt),
    author: row.author,
    attachment: mapAttachmentList(row),
    replyTo: mapReplyPreview(row.replyToMessage),
    forwardedFrom: mapForwardedFrom(row),
    reactions: mapReactions(row.reactions, viewerUserId),
    poll: mapPoll((row.polls as DbRow[])?.[0], viewerUserId),
  }))
}

export async function getChannelMessage(messageId: number, channelId: number, viewerUserId: number) {
  const row = await prisma.channelMessage.findFirst({
    where: { id: messageId, channelId },
    include: {
      author: { select: AUTHOR_SELECT },
      attachments: { orderBy: { position: "asc" } },
      reactions: { select: { userId: true, emoji: true } },
      ...REPLY_INCLUDE,
      ...POLL_INCLUDE,
    },
  })

  if (!row) {
    return null
  }

  return {
    id: row.id,
    content: row.content,
    channelId: row.channelId,
    createdAt: toIsoString(row.createdAt),
    authorId: row.authorId,
    author: row.author,
    attachment: mapAttachmentList(row),
    replyTo: mapReplyPreview(row.replyToMessage),
    forwardedFrom: mapForwardedFrom(row),
    reactions: mapReactions(row.reactions, viewerUserId),
    poll: mapPoll((row.polls as DbRow[])?.[0], viewerUserId),
  }
}

export async function createChannelMessage(input: {
  content: string
  channelId: number
  authorId: number
  attachments?: MediaAttachment[]
  replyToMessageId?: number | null
  forwardedFromAuthorId?: number | null
  forwardedFromAuthorName?: string | null
}) {
  const created = await prisma.channelMessage.create({
    data: {
      channelId: input.channelId,
      authorId: input.authorId,
      content: input.content,
      replyToMessageId: input.replyToMessageId ?? null,
      forwardedFromAuthorId: input.forwardedFromAuthorId ?? null,
      forwardedFromAuthorName: input.forwardedFromAuthorName ?? null,
      attachments: input.attachments?.length
        ? {
            create: input.attachments.map((attachment, index) => ({
              kind: attachment.kind,
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
      author: { select: AUTHOR_SELECT },
      attachments: { orderBy: { position: "asc" } },
      ...REPLY_INCLUDE,
    },
  })

  return {
    id: created.id,
    content: created.content,
    channelId: created.channelId,
    createdAt: toIsoString(created.createdAt),
    author: created.author,
    attachment: (created.attachments ?? []).map(mapAttachment),
    replyTo: mapReplyPreview(created.replyToMessage),
    forwardedFrom: mapForwardedFrom(created),
    reactions: [] as Array<{ emoji: string; count: number; reactedByMe: boolean }>,
    poll: null as ReturnType<typeof mapPoll>,
  }
}

export async function createChannelPoll(input: {
  channelId: number
  authorId: number
  question: string
  options: string[]
  allowMultiple: boolean
}) {
  const created = await prisma.channelMessage.create({
    data: {
      content: input.question,
      channelId: input.channelId,
      authorId: input.authorId,
      polls: {
        create: {
          question: input.question,
          allowMultiple: input.allowMultiple,
          options: {
            create: input.options.map((text, index) => ({ text, position: index })),
          },
        },
      },
    },
    include: {
      author: { select: AUTHOR_SELECT },
      attachments: { orderBy: { position: "asc" } },
      ...POLL_INCLUDE,
    },
  })

  return {
    id: created.id,
    content: created.content,
    channelId: created.channelId,
    createdAt: toIsoString(created.createdAt),
    author: created.author,
    attachment: mapAttachmentList(created),
    replyTo: null,
    forwardedFrom: null,
    reactions: [] as Array<{ emoji: string; count: number; reactedByMe: boolean }>,
    poll: mapPoll((created.polls as DbRow[])?.[0], input.authorId),
  }
}

export async function setChannelMessageReaction(
  channelMessageId: number,
  userId: number,
  emoji: string | null
) {
  if (emoji === null) {
    await prisma.channelMessageReaction.deleteMany({ where: { channelMessageId, userId } })
    return
  }

  await prisma.channelMessageReaction.upsert({
    where: { channelMessageId_userId: { channelMessageId, userId } },
    update: { emoji },
    create: { channelMessageId, userId, emoji },
  })
}

export async function voteChannelPoll(pollId: number, userId: number, optionIds: number[]) {
  return voteDialogPoll(pollId, userId, optionIds)
}
