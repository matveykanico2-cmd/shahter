import { redirect } from "next/navigation"

import { Providers } from "@/app/providers"
import { PwaRegisterClient } from "@/app/pwa-register-client"
import { listAdCampaignsByOwner, listPublicAdCampaigns } from "@/features/ads/lib/store"
import { FeedHome } from "@/features/feed/ui/feed-home"
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

export default async function FeedPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth")
  }

  const posts = await prisma.newsPost.findMany({
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
      likes: {
        where: { userId: user.id },
        select: { id: true },
      },
      comments: {
        orderBy: { createdAt: "asc" },
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
        },
      },
      _count: {
        select: {
          likes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const [ads, myAds] = await Promise.all([
    listPublicAdCampaigns(),
    listAdCampaignsByOwner(user.id),
  ])

  return (
    <Providers>
      <PwaRegisterClient />
      <FeedHome
        user={{
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          avatarTone: user.avatarTone,
          avatarUrl: user.avatarUrl,
        }}
        posts={posts.map((post) => ({
          id: post.id,
          content: post.content,
          createdAt: post.createdAt.toISOString(),
          author: post.author,
          attachment: mapAttachmentFromPost(post),
          likesCount: post._count.likes,
          likedByMe: post.likes.length > 0,
          comments: post.comments.map((comment: DbRow) => ({
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt.toISOString(),
            author: comment.author,
          })),
        }))}
        ads={ads}
        myAds={myAds}
      />
    </Providers>
  )
}
