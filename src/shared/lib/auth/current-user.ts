import { cookies } from "next/headers"

import type { EmblemToneId } from "@/features/profile/lib/emblem"
import { prisma } from "@/shared/lib/db/prisma"
import { touchUserActivity } from "@/shared/lib/user-activity"

import {
  AUTH_SESSION_COOKIE,
  AUTH_TOKEN_COOKIE,
  verifyAuthToken,
} from "./session"

export type CurrentUser = {
  id: number
  email: string
  firstName: string
  lastName: string | null
  username: string
  phone: string
  role: string
  premiumUntil: Date | null
  starsBalance: number
  partnerStarsEarned: number
  avatarId: number | null
  avatarTone: EmblemToneId | null
  avatarUrl: string | null
  lastSeenAt: Date | null
  profileVisibility: "everyone" | "contacts"
  showEmailInProfile: boolean
  showPhoneInProfile: boolean
  showGiftsInProfile: boolean
}

export async function getCurrentUser(options?: { touchActivity?: boolean }) {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value
  const sessionId = cookieStore.get(AUTH_SESSION_COOKIE)?.value

  if (!token || !sessionId) {
    return null
  }

  const payload = await verifyAuthToken(token)
  if (!payload || payload.sid !== sessionId) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      username: true,
      phone: true,
      role: true,
      premiumUntil: true,
      starsBalance: true,
      partnerStarsEarned: true,
      avatarId: true,
      avatarTone: true,
      avatarUrl: true,
      isBlocked: true,
      lastSeenAt: true,
      profileVisibility: true,
      showEmailInProfile: true,
      showPhoneInProfile: true,
      showGiftsInProfile: true,
    },
  })

  if (user?.isBlocked) {
    return null
  }

  if (user && options?.touchActivity !== false) {
    await touchUserActivity(user.id)
  }

  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    phone: user.phone,
    role: user.role,
    premiumUntil: user.premiumUntil,
    starsBalance: user.starsBalance,
    partnerStarsEarned: user.partnerStarsEarned,
    avatarId: user.avatarId,
    avatarTone: user.avatarTone as EmblemToneId | null,
    avatarUrl: user.avatarUrl,
    lastSeenAt: user.lastSeenAt,
    profileVisibility: user.profileVisibility,
    showEmailInProfile: user.showEmailInProfile,
    showPhoneInProfile: user.showPhoneInProfile,
    showGiftsInProfile: user.showGiftsInProfile,
  }
}
