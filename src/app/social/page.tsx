import { redirect } from "next/navigation"

import { Providers } from "@/app/providers"
import { PwaRegisterClient } from "@/app/pwa-register-client"
import { SocialNetworkHome } from "@/features/social/ui/social-network-home"
import { getCurrentUser } from "@/shared/lib/auth/current-user"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"
import type { MediaAttachment } from "@/shared/lib/media/constants"

function mapAttachmentFromPost(post: DbRow): MediaAttachment[] {
  if (post.attachments.length > 0) {
    return post.attachments.map((attachment: DbRow) => ({
      kind: attachment.kind as MediaAttachment["kind"],
      url: attachment.url,
      name: attachment.name,
      mime: attachment.mime,
      size: attachment.size,
    }))
  }

  if (!post.mediaKind || !post.mediaUrl || !post.mediaName || !post.mediaMime || post.mediaSize === null) {
    return []
  }

  return [{
    kind: post.mediaKind as MediaAttachment["kind"],
    url: post.mediaUrl,
    name: post.mediaName,
    mime: post.mediaMime,
    size: post.mediaSize,
  }]
}

function extractTrendingTopics(posts: DbRow[]) {
  const topicMap = new Map<string, number>()

  for (const post of posts) {
    const matches = post.content.match(/#[\p{L}\p{N}_-]+/gu) ?? []

    for (const match of matches) {
      const normalized = match.toLowerCase()
      topicMap.set(normalized, (topicMap.get(normalized) ?? 0) + 1)
    }
  }

  return Array.from(topicMap.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([tag, count]) => ({ tag, count }))
}

export default async function SocialPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth")
  }

  const [
    usersCount,
    postsCount,
    channelsCount,
    contactsCount,
    latestPosts,
    channels,
    creators,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.newsPost.count(),
    prisma.channel.count(),
    prisma.contact.count({
      where: {
        ownerId: user.id,
      },
    }),
    prisma.newsPost.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
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
          },
        },
        attachments: {
          orderBy: { position: "asc" },
        },
        comments: {
          take: 2,
          orderBy: { createdAt: "desc" },
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
              },
            },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    }),
    prisma.channel.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarTone: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            participants: true,
            messages: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      take: 4,
      where: {
        newsPosts: {
          some: {},
        },
      },
      orderBy: {
        newsPosts: {
          _count: "desc",
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        avatarTone: true,
        avatarUrl: true,
        _count: {
          select: {
            newsPosts: true,
            channelMemberships: true,
          },
        },
      },
    }),
  ])

  return (
    <Providers>
      <PwaRegisterClient />
      <SocialNetworkHome
        currentUser={{
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          avatarTone: user.avatarTone,
          avatarUrl: user.avatarUrl,
        }}
        stats={{
          usersCount,
          postsCount,
          channelsCount,
          contactsCount,
        }}
        trendingTopics={extractTrendingTopics(latestPosts)}
        featuredCreators={creators.map((creator) => ({
          id: creator.id,
          firstName: creator.firstName,
          lastName: creator.lastName,
          email: creator.email,
          role: creator.role,
          avatarTone: creator.avatarTone,
          avatarUrl: creator.avatarUrl,
          postsCount: creator._count.newsPosts,
          communitiesCount: creator._count.channelMemberships,
        }))}
        communities={channels.map((channel) => ({
          id: channel.id,
          title: channel.title,
          username: channel.username,
          description: channel.description,
          avatarUrl: channel.avatarUrl,
          participantsCount: channel._count.participants,
          messagesCount: channel._count.messages,
          owner: channel.owner,
        }))}
        feed={latestPosts.map((post) => ({
          id: post.id,
          content: post.content,
          createdAt: post.createdAt.toISOString(),
          author: post.author,
          attachment: mapAttachmentFromPost(post),
          likesCount: post._count.likes,
          commentsCount: post._count.comments,
          commentsPreview: post.comments.map((comment: DbRow) => ({
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt.toISOString(),
            author: comment.author,
          })),
        }))}
      />
    </Providers>
  )
}
