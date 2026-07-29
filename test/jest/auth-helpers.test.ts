jest.mock("@/shared/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}))
jest.mock("@/shared/lib/user-activity", () => ({
  touchUserActivity: jest.fn(),
}))
jest.mock("@/shared/lib/auth/session", () => ({
  AUTH_SESSION_COOKIE: "session",
  AUTH_TOKEN_COOKIE: "token",
  verifyAuthToken: jest.fn(),
}))
jest.mock("next/headers", () => ({ cookies: jest.fn() }))

import { getCurrentUser } from "@/shared/lib/auth/current-user"
import { getAuthorizedUserIdFromRequest } from "@/shared/lib/auth/request-user"

const { prisma: mockPrisma } = jest.requireMock("@/shared/lib/db/prisma") as {
  prisma: { user: { findUnique: jest.Mock } }
}
const { touchUserActivity: mockTouchUserActivity } = jest.requireMock(
  "@/shared/lib/user-activity"
) as { touchUserActivity: jest.Mock }
const { verifyAuthToken: mockVerifyAuthToken } = jest.requireMock(
  "@/shared/lib/auth/session"
) as { verifyAuthToken: jest.Mock }
const { cookies: mockCookies } = jest.requireMock("next/headers") as {
  cookies: jest.Mock
}

describe("auth helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("request auth helper returns null or user id", async () => {
    const request = {
      cookies: {
        get: (name: string) => {
          if (name === "token") return { value: "token-value" }
          if (name === "session") return { value: "sid" }
          return undefined
        },
      },
    }

    mockVerifyAuthToken.mockResolvedValueOnce(null)
    await expect(getAuthorizedUserIdFromRequest(request as never)).resolves.toBeNull()

    mockVerifyAuthToken.mockResolvedValueOnce({ sid: "other", userId: 4 })
    await expect(getAuthorizedUserIdFromRequest(request as never)).resolves.toBeNull()

    mockVerifyAuthToken.mockResolvedValueOnce({ sid: "sid", userId: 4 })
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 4, isBlocked: false })
    await expect(
      getAuthorizedUserIdFromRequest(request as never, { touchActivity: false })
    ).resolves.toBe(4)

    mockVerifyAuthToken.mockResolvedValueOnce({ sid: "sid", userId: 9 })
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 9, isBlocked: false })
    await expect(getAuthorizedUserIdFromRequest(request as never)).resolves.toBe(9)
    expect(mockTouchUserActivity).toHaveBeenCalledWith(9)
  })

  test("current user helper validates cookies, token and user lookup", async () => {
    mockCookies.mockResolvedValue({
      get: (name: string) => {
        if (name === "token") return { value: "token-value" }
        if (name === "session") return { value: "sid" }
        return undefined
      },
    })

    mockVerifyAuthToken.mockResolvedValueOnce(null)
    await expect(getCurrentUser()).resolves.toBeNull()

    mockVerifyAuthToken.mockResolvedValueOnce({ sid: "other", userId: 4 })
    await expect(getCurrentUser()).resolves.toBeNull()

    mockVerifyAuthToken.mockResolvedValueOnce({ sid: "sid", userId: 4 })
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    await expect(getCurrentUser()).resolves.toBeNull()

    mockVerifyAuthToken
      .mockResolvedValueOnce({ sid: "sid", userId: 4 })
      .mockResolvedValueOnce({ sid: "sid", userId: 4 })
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 4,
        email: "user@example.com",
        firstName: "Ivan",
        lastName: null,
        username: "ivan_test",
        phone: "12345678",
        role: "user",
        premiumUntil: null,
        starsBalance: 0,
        partnerStarsEarned: 0,
        avatarId: null,
        avatarTone: null,
        avatarUrl: null,
        isBlocked: false,
        lastSeenAt: null,
        profileVisibility: "everyone",
        showEmailInProfile: true,
        showPhoneInProfile: true,
        showGiftsInProfile: true,
      })
      .mockResolvedValueOnce({
        id: 4,
        email: "user@example.com",
        firstName: "Ivan",
        lastName: null,
        username: "ivan_test",
        phone: "12345678",
        role: "user",
        premiumUntil: null,
        starsBalance: 0,
        partnerStarsEarned: 0,
        avatarId: null,
        avatarTone: null,
        avatarUrl: null,
        isBlocked: false,
        lastSeenAt: null,
        profileVisibility: "everyone",
        showEmailInProfile: true,
        showPhoneInProfile: true,
        showGiftsInProfile: true,
      })

    await expect(getCurrentUser()).resolves.toMatchObject({ id: 4 })
    await expect(getCurrentUser({ touchActivity: false })).resolves.toMatchObject({ id: 4 })
    expect(mockTouchUserActivity).toHaveBeenCalledWith(4)
  })
})
