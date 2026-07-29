import { hasAdministrativeAccess } from "@/shared/lib/auth/roles"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"

type ProfileGift = {
  id: number
  giftKey: string
  giftName: string
  starsSpent: number
  note: string | null
  createdAt: string
  sender: {
    id: number
    firstName: string
    lastName: string | null
  } | null
}

export type ViewedContactProfile = {
  id: number
  email: string | null
  firstName: string
  lastName: string | null
  username: string
  phone: string | null
  role: string
  avatarTone: string | null
  avatarUrl: string | null
  isBlocked: boolean
  starsBalance: number
  partnerStarsEarned: number
  createdAt: string
  giftsVisible: boolean
  gifts: ProfileGift[]
}

export async function getViewedContactProfile(viewerUserId: number, contactUserId: number) {
  const isSelfProfile = contactUserId === viewerUserId

  const [requester, user, blacklistEntry, isViewerInContacts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { role: true },
    }),
    prisma.user.findUnique({
      where: { id: contactUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        phone: true,
        role: true,
        avatarTone: true,
        avatarUrl: true,
        isBlocked: true,
        starsBalance: true,
        partnerStarsEarned: true,
        createdAt: true,
        profileVisibility: true,
        showEmailInProfile: true,
        showPhoneInProfile: true,
        showGiftsInProfile: true,
        receivedGiftTransactions: {
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            giftKey: true,
            giftName: true,
            starsSpent: true,
            note: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    }),
    prisma.userBlacklist.findFirst({
      where: {
        ownerId: viewerUserId,
        blockedUserId: contactUserId,
      },
      select: { id: true },
    }),
    prisma.contact.findFirst({
      where: {
        ownerId: contactUserId,
        contactUserId: viewerUserId,
      },
      select: { id: true },
    }),
  ])

  if (!user) {
    return {
      ok: false as const,
      status: 404,
      message: "Пользователь не найден",
    }
  }

  if (blacklistEntry) {
    return {
      ok: false as const,
      status: 403,
      message: "Пользователь находится в чёрном списке",
    }
  }

  const isPrivilegedViewer = isSelfProfile || hasAdministrativeAccess(requester?.role)
  const canViewByPrivacy =
    isPrivilegedViewer || user.profileVisibility === "everyone" || Boolean(isViewerInContacts)

  if (!canViewByPrivacy) {
    return {
      ok: false as const,
      status: 403,
      message: "Профиль доступен только контактам",
    }
  }

  const canSeeEmail = isPrivilegedViewer || user.showEmailInProfile
  const canSeePhone = isPrivilegedViewer || user.showPhoneInProfile
  const canSeeGifts = isPrivilegedViewer || user.showGiftsInProfile

  return {
    ok: true as const,
    profile: {
      id: user.id,
      email: canSeeEmail ? user.email : null,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phone: canSeePhone ? user.phone : null,
      role: user.role,
      avatarTone: user.avatarTone,
      avatarUrl: user.avatarUrl,
      isBlocked: user.isBlocked,
      starsBalance: user.starsBalance,
      partnerStarsEarned: user.partnerStarsEarned,
      createdAt: user.createdAt.toISOString(),
      giftsVisible: canSeeGifts,
      gifts: (canSeeGifts ? user.receivedGiftTransactions : []).map((gift: DbRow) => ({
        id: gift.id,
        giftKey: gift.giftKey,
        giftName: gift.giftName,
        starsSpent: gift.starsSpent,
        note: gift.note,
        createdAt: gift.createdAt.toISOString(),
        sender: gift.sender
          ? {
              id: gift.sender.id,
              firstName: gift.sender.firstName,
              lastName: gift.sender.lastName,
            }
          : null,
      })),
    } satisfies ViewedContactProfile,
  }
}
