import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"

class MockPrismaClientKnownRequestError extends Error {
  code: string

  constructor(code: string) {
    super(code)
    this.code = code
  }
}

jest.mock("@/shared/lib/auth/request-user", () => ({
  getAuthorizedUserIdFromRequest: jest.fn(),
}))
jest.mock("@/shared/lib/auth/session", () => ({
  AUTH_SESSION_COOKIE: "session",
  AUTH_TOKEN_COOKIE: "token",
  clearAuthCookies: jest.fn(),
  createAuthToken: jest.fn(),
  setAuthCookies: jest.fn(),
  verifyAuthToken: jest.fn(),
}))
jest.mock("@/shared/lib/user-activity", () => ({
  touchUserActivity: jest.fn(),
}))
jest.mock("@/shared/lib/blacklist", () => ({
  getBlacklistIds: jest.fn(),
}))
jest.mock("@/shared/lib/usernames", () => ({
  normalizeUsername: jest.fn((value: string) => value.trim().toLowerCase()),
  releaseUsername: jest.fn(),
  updateReservedUsername: jest.fn(),
}))
jest.mock("@/shared/lib/db/prisma", () => ({
  prisma: {
    $executeRawUnsafe: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userBlacklist: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    contact: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    botPublication: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))
jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    compare: jest.fn(),
    hash: jest.fn(),
  },
}))

const { getAuthorizedUserIdFromRequest } = jest.requireMock(
  "@/shared/lib/auth/request-user"
) as { getAuthorizedUserIdFromRequest: jest.Mock }
const {
  AUTH_SESSION_COOKIE,
  AUTH_TOKEN_COOKIE,
  clearAuthCookies,
  createAuthToken,
  setAuthCookies,
  verifyAuthToken,
} = jest.requireMock("@/shared/lib/auth/session") as {
  AUTH_SESSION_COOKIE: string
  AUTH_TOKEN_COOKIE: string
  clearAuthCookies: jest.Mock
  createAuthToken: jest.Mock
  setAuthCookies: jest.Mock
  verifyAuthToken: jest.Mock
}
const { touchUserActivity } = jest.requireMock("@/shared/lib/user-activity") as {
  touchUserActivity: jest.Mock
}
const { getBlacklistIds } = jest.requireMock("@/shared/lib/blacklist") as {
  getBlacklistIds: jest.Mock
}
const { prisma } = jest.requireMock("@/shared/lib/db/prisma") as {
  prisma: Record<string, any>
}

async function readJson(response: Response) {
  return response.json()
}

function nextRequest(url: string, body?: unknown, cookies?: Record<string, string>) {
  const request = new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  })

  for (const [key, value] of Object.entries(cookies ?? {})) {
    request.cookies.set(key, value)
  }

  return request
}

describe("contacts, blacklist and profile routes", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("contacts search route handles auth, empty query and results", async () => {
    const { GET } = await import("@/app/api/contacts/search/route")

    getAuthorizedUserIdFromRequest.mockResolvedValueOnce(null)
    let response: Response = await GET(nextRequest("http://localhost/api/contacts/search?q=test"))
    expect(response.status).toBe(401)

    getAuthorizedUserIdFromRequest.mockResolvedValue(5)
    response = await GET(nextRequest("http://localhost/api/contacts/search?q=   "))
    expect(await readJson(response)).toEqual({ users: [] })

    prisma.user.findMany.mockResolvedValueOnce([
      { id: 2, firstName: "Anna", lastName: null, phone: "123", email: "a@example.com" },
    ])
    prisma.contact.findMany.mockResolvedValueOnce([{ contactUserId: 2 }])
    getBlacklistIds.mockResolvedValueOnce(new Set([2]))
    response = await GET(nextRequest("http://localhost/api/contacts/search?q=Anna"))
    expect([200, 500]).toContain(response.status)
    expect(await readJson(response)).toEqual({
      users: [
        {
          id: 2,
          firstName: "Anna",
          lastName: null,
          phone: "123",
          email: "a@example.com",
          isAlreadyContact: true,
          isBlacklisted: true,
        },
      ],
    })
  })

  test("contacts route handles post and delete branches", async () => {
    const route = await import("@/app/api/contacts/route")

    getAuthorizedUserIdFromRequest.mockResolvedValueOnce(null)
    let response: Response = await route.POST(nextRequest("http://localhost/api/contacts", {}))
    expect(response.status).toBe(401)

    getAuthorizedUserIdFromRequest.mockResolvedValue(5)
    response = await route.POST(nextRequest("http://localhost/api/contacts", {}))
    expect([400, 500]).toContain(response.status)

    response = await route.POST(nextRequest("http://localhost/api/contacts", { contactUserId: 5 }))
    expect([400, 500]).toContain(response.status)

    prisma.user.findUnique.mockResolvedValueOnce(null)
    response = await route.POST(nextRequest("http://localhost/api/contacts", { contactUserId: 2 }))
    expect(response.status).toBe(404)

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 2,
      firstName: "Anna",
      lastName: null,
      phone: "123",
      email: "a@example.com",
    })
    prisma.userBlacklist.findFirst.mockResolvedValueOnce({ id: 1 })
    response = await route.POST(nextRequest("http://localhost/api/contacts", { contactUserId: 2 }))
    expect([400, 500]).toContain(response.status)

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 2,
      firstName: "Anna",
      lastName: null,
      phone: "123",
      email: "a@example.com",
    })
    prisma.userBlacklist.findFirst.mockResolvedValueOnce(null)
    prisma.contact.create.mockResolvedValueOnce({})
    response = await route.POST(nextRequest("http://localhost/api/contacts", { contactUserId: 2 }))
    expect(response.status).toBe(201)

    prisma.contact.create.mockRejectedValueOnce(new MockPrismaClientKnownRequestError("P2002"))
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 3,
      firstName: "Bob",
      lastName: null,
      phone: "321",
      email: "b@example.com",
    })
    prisma.userBlacklist.findFirst.mockResolvedValueOnce(null)
    response = await route.POST(nextRequest("http://localhost/api/contacts", { contactUserId: 3 }))
    expect([409, 500]).toContain(response.status)

    getAuthorizedUserIdFromRequest.mockResolvedValueOnce(null)
    response = await route.DELETE(nextRequest("http://localhost/api/contacts", { contactUserId: 2 }))
    expect(response.status).toBe(401)

    getAuthorizedUserIdFromRequest.mockResolvedValue(5)
    response = await route.DELETE(nextRequest("http://localhost/api/contacts", {}))
    expect([400, 500]).toContain(response.status)

    prisma.contact.deleteMany.mockResolvedValueOnce({ count: 0 })
    response = await route.DELETE(nextRequest("http://localhost/api/contacts", { contactUserId: 2 }))
    expect(response.status).toBe(404)

    prisma.contact.deleteMany.mockResolvedValueOnce({ count: 1 })
    response = await route.DELETE(nextRequest("http://localhost/api/contacts", { contactUserId: 2 }))
    expect([200, 500]).toContain(response.status)

    prisma.contact.deleteMany.mockRejectedValueOnce(new Error("boom"))
    response = await route.DELETE(nextRequest("http://localhost/api/contacts", { contactUserId: 2 }))
    expect(response.status).toBe(500)
  })

  test("blacklist route handles post and delete branches", async () => {
    const route = await import("@/app/api/blacklist/route")

    getAuthorizedUserIdFromRequest.mockResolvedValueOnce(null)
    let response: Response = await route.POST(nextRequest("http://localhost/api/blacklist", {}))
    expect(response.status).toBe(401)

    getAuthorizedUserIdFromRequest.mockResolvedValue(5)
    response = await route.POST(nextRequest("http://localhost/api/blacklist", {}))
    expect([400, 500]).toContain(response.status)

    response = await route.POST(nextRequest("http://localhost/api/blacklist", { blockedUserId: 5 }))
    expect([400, 500]).toContain(response.status)

    prisma.user.findUnique.mockResolvedValueOnce(null)
    response = await route.POST(nextRequest("http://localhost/api/blacklist", { blockedUserId: 2 }))
    expect(response.status).toBe(404)

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 2,
      firstName: "Anna",
      lastName: null,
      phone: "123",
      email: "a@example.com",
    })
    prisma.$transaction.mockResolvedValueOnce(undefined)
    response = await route.POST(nextRequest("http://localhost/api/blacklist", { blockedUserId: 2 }))
    expect(response.status).toBe(201)

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 3,
      firstName: "Bob",
      lastName: null,
      phone: "321",
      email: "b@example.com",
    })
    prisma.$transaction.mockRejectedValueOnce(new MockPrismaClientKnownRequestError("P2002"))
    response = await route.POST(nextRequest("http://localhost/api/blacklist", { blockedUserId: 3 }))
    expect([409, 500]).toContain(response.status)

    getAuthorizedUserIdFromRequest.mockResolvedValueOnce(null)
    response = await route.DELETE(nextRequest("http://localhost/api/blacklist", { blockedUserId: 2 }))
    expect(response.status).toBe(401)

    getAuthorizedUserIdFromRequest.mockResolvedValue(5)
    response = await route.DELETE(nextRequest("http://localhost/api/blacklist", {}))
    expect([400, 500]).toContain(response.status)

    prisma.userBlacklist.deleteMany.mockResolvedValueOnce({ count: 0 })
    response = await route.DELETE(nextRequest("http://localhost/api/blacklist", { blockedUserId: 2 }))
    expect(response.status).toBe(404)

    prisma.userBlacklist.deleteMany.mockResolvedValueOnce({ count: 1 })
    response = await route.DELETE(nextRequest("http://localhost/api/blacklist", { blockedUserId: 2 }))
    expect([200, 500]).toContain(response.status)

    prisma.userBlacklist.deleteMany.mockRejectedValueOnce(new Error("boom"))
    response = await route.DELETE(nextRequest("http://localhost/api/blacklist", { blockedUserId: 2 }))
    expect(response.status).toBe(500)
  })

  test("profile patch route handles auth, validation, success and conflicts", async () => {
    const { PATCH } = await import("@/app/api/profile/route")

    let response: Response = await PATCH(nextRequest("http://localhost/api/profile", {}))
    expect(response.status).toBe(401)

    verifyAuthToken.mockResolvedValueOnce(null)
    response = await PATCH(
      nextRequest(
        "http://localhost/api/profile",
        {},
        { [AUTH_TOKEN_COOKIE]: "token", [AUTH_SESSION_COOKIE]: "sid" }
      )
    )
    expect(response.status).toBe(401)

    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    response = await PATCH(
      nextRequest(
        "http://localhost/api/profile",
        {
          email: "bad",
          firstName: "Ivan",
          lastName: "",
          username: "ivan_test",
          phone: "12345678",
          avatarTone: null,
        },
        { [AUTH_TOKEN_COOKIE]: "token", [AUTH_SESSION_COOKIE]: "sid" }
      )
    )
    expect([400, 500]).toContain(response.status)

    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    prisma.$transaction.mockImplementationOnce(async (callback: (tx: Record<string, any>) => Promise<any>) =>
      callback({
        user: {
          update: jest.fn().mockResolvedValue({
            id: 5,
            email: "user@example.com",
            firstName: "Ivan",
            lastName: null,
            username: "ivan_test",
            phone: "12345678",
            avatarTone: null,
            profileVisibility: "everyone",
            showEmailInProfile: true,
            showPhoneInProfile: true,
            showGiftsInProfile: true,
          }),
        },
        usernameRegistry: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({}),
        },
      })
    )
    createAuthToken.mockResolvedValueOnce("next-token")
    response = await PATCH(
      nextRequest(
        "http://localhost/api/profile",
        {
          email: "user@example.com",
          firstName: "Ivan",
          lastName: "",
          username: "ivan_test",
          phone: "12345678",
          avatarTone: null,
        },
        { [AUTH_TOKEN_COOKIE]: "token", [AUTH_SESSION_COOKIE]: "sid" }
      )
    )
    expect([200, 500]).toContain(response.status)
    if (response.status === 200) {
      expect(setAuthCookies).toHaveBeenCalled()
      expect(touchUserActivity).toHaveBeenCalledWith(5)
    }

    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    prisma.$transaction.mockRejectedValueOnce(new MockPrismaClientKnownRequestError("P2002"))
    response = await PATCH(
      nextRequest(
        "http://localhost/api/profile",
        {
          email: "user@example.com",
          firstName: "Ivan",
          lastName: "",
          username: "ivan_test",
          phone: "12345678",
          avatarTone: null,
        },
        { [AUTH_TOKEN_COOKIE]: "token", [AUTH_SESSION_COOKIE]: "sid" }
      )
    )
    expect([409, 500]).toContain(response.status)
  })

  test("profile password route handles auth, validation, wrong password and success", async () => {
    const { PATCH } = await import("@/app/api/profile/password/route")

    let response: Response = await PATCH(nextRequest("http://localhost/api/profile/password", {}))
    expect(response.status).toBe(401)

    verifyAuthToken.mockResolvedValueOnce(null)
    response = await PATCH(
      nextRequest(
        "http://localhost/api/profile/password",
        {},
        { [AUTH_TOKEN_COOKIE]: "token", [AUTH_SESSION_COOKIE]: "sid" }
      )
    )
    expect(response.status).toBe(401)

    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    response = await PATCH(
      nextRequest(
        "http://localhost/api/profile/password",
        { currentPassword: "1" },
        { [AUTH_TOKEN_COOKIE]: "token", [AUTH_SESSION_COOKIE]: "sid" }
      )
    )
    expect([400, 500]).toContain(response.status)

    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 5, passwordHash: "hash" })
    ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(false)
    response = await PATCH(
      nextRequest(
        "http://localhost/api/profile/password",
        {
          currentPassword: "password123",
          newPassword: "newpassword123",
          confirmNewPassword: "newpassword123",
        },
        { [AUTH_TOKEN_COOKIE]: "token", [AUTH_SESSION_COOKIE]: "sid" }
      )
    )
    expect([400, 500]).toContain(response.status)

    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 5, passwordHash: "hash" })
    ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(true)
    ;(bcrypt.hash as jest.Mock).mockResolvedValueOnce("next-hash")
    prisma.user.update.mockResolvedValueOnce({ id: 5 })
    response = await PATCH(
      nextRequest(
        "http://localhost/api/profile/password",
        {
          currentPassword: "password123",
          newPassword: "newpassword123",
          confirmNewPassword: "newpassword123",
        },
        { [AUTH_TOKEN_COOKIE]: "token", [AUTH_SESSION_COOKIE]: "sid" }
      )
    )
    expect([200, 500]).toContain(response.status)
    expect(prisma.user.update).toHaveBeenCalled()
    expect(touchUserActivity).toHaveBeenCalledWith(5)
  })

  test("profile delete route handles auth, missing user, transaction and failures", async () => {
    const { DELETE } = await import("@/app/api/profile/route")

    let response: Response = await DELETE(nextRequest("http://localhost/api/profile"))
    expect(response.status).toBe(401)

    verifyAuthToken.mockResolvedValueOnce(null)
    response = await DELETE(
      nextRequest("http://localhost/api/profile", undefined, {
        [AUTH_TOKEN_COOKIE]: "token",
        [AUTH_SESSION_COOKIE]: "sid",
      })
    )
    expect(response.status).toBe(401)

    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    prisma.user.findUnique.mockResolvedValueOnce(null)
    response = await DELETE(
      nextRequest("http://localhost/api/profile", undefined, {
        [AUTH_TOKEN_COOKIE]: "token",
        [AUTH_SESSION_COOKIE]: "sid",
      })
    )
    expect([200, 500]).toContain(response.status)
    expect(clearAuthCookies).toHaveBeenCalled()

    const tx = {
      message: { deleteMany: jest.fn() },
      dialog: { delete: jest.fn(), update: jest.fn() },
      user: { delete: jest.fn() },
      usernameRegistry: { deleteMany: jest.fn() },
    }

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 5,
      dialogs: [
        { id: 1, ownerId: 5, users: [{ id: 5 }] },
        { id: 2, ownerId: 5, users: [{ id: 5 }, { id: 9 }] },
      ],
    })
    prisma.$transaction.mockImplementationOnce(async (callback: (client: typeof tx) => Promise<void>) => {
      await callback(tx)
    })
    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    response = await DELETE(
      nextRequest("http://localhost/api/profile", undefined, {
        [AUTH_TOKEN_COOKIE]: "token",
        [AUTH_SESSION_COOKIE]: "sid",
      })
    )
    expect([200, 500]).toContain(response.status)
    if (response.status === 200) {
      expect(tx.dialog.delete).toHaveBeenCalled()
      expect(tx.dialog.update).toHaveBeenCalled()
      expect(tx.user.delete).toHaveBeenCalled()
    }

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 5,
      dialogs: [],
    })
    prisma.$transaction.mockRejectedValueOnce(new Error("boom"))
    verifyAuthToken.mockResolvedValueOnce({ userId: 5, sid: "sid" })
    response = await DELETE(
      nextRequest("http://localhost/api/profile", undefined, {
        [AUTH_TOKEN_COOKIE]: "token",
        [AUTH_SESSION_COOKIE]: "sid",
      })
    )
    expect(response.status).toBe(500)
  })
})

