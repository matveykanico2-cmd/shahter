import { redirect } from "next/navigation"

import { Providers } from "@/app/providers"
import { PwaRegisterClient } from "@/app/pwa-register-client"
import { ChannelsHome } from "@/features/channels/ui/channels-home"
import { getCurrentUser } from "@/shared/lib/auth/current-user"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ channelId?: string }>
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth")
  }

  const params = await searchParams
  const parsedChannelId = Number(params.channelId)
  const requestedChannelId =
    Number.isInteger(parsedChannelId) && parsedChannelId > 0 ? parsedChannelId : null

  const contacts = await prisma.contact.findMany({
    where: { ownerId: user.id },
    select: {
      contactUser: {
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
    orderBy: { id: "desc" },
  })

  const channels = await prisma.channel.findMany({
    where: {
      participants: {
        some: {
          userId: user.id,
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
      messages: {
        orderBy: { id: "desc" },
        take: 1,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarTone: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  const initialChannelId =
    requestedChannelId && channels.some((channel) => channel.id === requestedChannelId)
      ? requestedChannelId
      : channels[0]?.id ?? null

  return (
    <Providers>
      <PwaRegisterClient />
      <ChannelsHome
        user={{
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatarTone: user.avatarTone,
          avatarUrl: user.avatarUrl,
        }}
        contacts={contacts.map((item) => item.contactUser)}
        initialChannelId={initialChannelId}
        channels={channels.map((channel) => ({
          id: channel.id,
          title: channel.title,
          username: channel.username,
          description: channel.description,
          avatarUrl: channel.avatarUrl,
          ownerId: channel.ownerId,
          myRole:
            channel.participants.find((participant: DbRow) => participant.user.id === user.id)?.role ?? null,
          participants:
            channel.ownerId === user.id
              ? channel.participants.map((participant: DbRow) => ({
                  channelRole: participant.role,
                  ...participant.user,
                }))
              : [],
          lastMessage: channel.messages[0]
            ? {
                id: channel.messages[0].id,
                channelId: channel.messages[0].channelId,
                content: channel.messages[0].content,
                createdAt: channel.messages[0].createdAt.toISOString(),
                author: channel.messages[0].author,
                attachment:
                  channel.messages[0].mediaKind &&
                  channel.messages[0].mediaUrl &&
                  channel.messages[0].mediaName &&
                  channel.messages[0].mediaMime &&
                  channel.messages[0].mediaSize !== null
                    ? {
                        kind: channel.messages[0].mediaKind as "FILE",
                        url: channel.messages[0].mediaUrl,
                        name: channel.messages[0].mediaName,
                        mime: channel.messages[0].mediaMime,
                        size: channel.messages[0].mediaSize,
                      }
                    : null,
              }
            : null,
        }))}
      />
    </Providers>
  )
}
