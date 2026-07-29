import { NextRequest } from "next/server"

jest.mock("@/features/auth/api/auth-service", () => ({
  loginUser: jest.fn(),
  requestRecoveryCode: jest.fn(),
  recoverUserAccount: jest.fn(),
  registerUser: jest.fn(),
}))
jest.mock("@/shared/lib/auth/session", () => ({
  createAuthToken: jest.fn(),
  createSessionId: jest.fn(),
  setAuthCookies: jest.fn(),
  clearAuthCookies: jest.fn(),
}))
jest.mock("@/shared/lib/user-activity", () => ({
  touchUserActivity: jest.fn(),
}))
jest.mock("@/shared/lib/auth/request-user", () => ({
  getAuthorizedUserIdFromRequest: jest.fn(),
}))
jest.mock("@/shared/lib/notifications/push", () => ({
  getPushConfigurationError: jest.fn(),
  getPublicVapidKey: jest.fn(),
  isPushConfigured: jest.fn(),
  removePushSubscription: jest.fn(),
  savePushSubscription: jest.fn(),
}))
jest.mock("@/shared/lib/mail", () => ({
  getMailConfigurationError: jest.fn(),
  isMailConfigured: jest.fn(),
}))

const { loginUser, requestRecoveryCode, recoverUserAccount, registerUser } = jest.requireMock(
  "@/features/auth/api/auth-service"
) as {
  loginUser: jest.Mock
  requestRecoveryCode: jest.Mock
  recoverUserAccount: jest.Mock
  registerUser: jest.Mock
}
const {
  createAuthToken,
  createSessionId,
  setAuthCookies,
  clearAuthCookies,
} = jest.requireMock("@/shared/lib/auth/session") as {
  createAuthToken: jest.Mock
  createSessionId: jest.Mock
  setAuthCookies: jest.Mock
  clearAuthCookies: jest.Mock
}
const { touchUserActivity } = jest.requireMock("@/shared/lib/user-activity") as {
  touchUserActivity: jest.Mock
}
const { getAuthorizedUserIdFromRequest } = jest.requireMock(
  "@/shared/lib/auth/request-user"
) as {
  getAuthorizedUserIdFromRequest: jest.Mock
}
const {
  getPushConfigurationError,
  getPublicVapidKey,
  isPushConfigured,
  removePushSubscription,
  savePushSubscription,
} = jest.requireMock("@/shared/lib/notifications/push") as {
  getPushConfigurationError: jest.Mock
  getPublicVapidKey: jest.Mock
  isPushConfigured: jest.Mock
  removePushSubscription: jest.Mock
  savePushSubscription: jest.Mock
}
const { getMailConfigurationError, isMailConfigured } = jest.requireMock(
  "@/shared/lib/mail"
) as {
  getMailConfigurationError: jest.Mock
  isMailConfigured: jest.Mock
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function readJson(response: Response) {
  return response.json()
}

describe("auth and notification routes", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("auth login route handles validation, service error, success and failure", async () => {
    const { POST } = await import("@/app/api/auth/login/route")

    let response = await POST(jsonRequest({ email: "bad", password: "123" }))
    expect(response.status).toBe(400)

    loginUser.mockResolvedValueOnce({ ok: false, status: 401, message: "bad creds" })
    response = await POST(jsonRequest({ email: "user@example.com", password: "password123" }))
    expect(response.status).toBe(401)
    expect(await readJson(response)).toEqual({ message: "bad creds" })

    createSessionId.mockReturnValue("sid")
    createAuthToken.mockResolvedValue("token")
    loginUser.mockResolvedValueOnce({
      ok: true,
      user: { id: 5, email: "user@example.com" },
    })
    response = await POST(jsonRequest({ email: "user@example.com", password: "password123" }))
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({
      user: { id: 5, email: "user@example.com" },
    })
    expect(touchUserActivity).toHaveBeenCalledWith(5, true)
    expect(setAuthCookies).toHaveBeenCalled()

    loginUser.mockRejectedValueOnce(new Error("boom"))
    response = await POST(jsonRequest({ email: "user@example.com", password: "password123" }))
    expect(response.status).toBe(500)
  })

  test("auth recover request-code route handles config, validation and failures", async () => {
    const { POST } = await import("@/app/api/auth/recover/request-code/route")

    isMailConfigured.mockReturnValueOnce(false)
    getMailConfigurationError.mockReturnValueOnce("mail missing")
    let response = await POST(jsonRequest({ phone: "12345678" }))
    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({ message: "mail missing" })

    isMailConfigured.mockReturnValueOnce(true)
    response = await POST(jsonRequest({ phone: "123" }))
    expect(response.status).toBe(400)

    isMailConfigured.mockReturnValueOnce(true)
    requestRecoveryCode.mockResolvedValueOnce({ ok: true })
    response = await POST(jsonRequest({ phone: "12345678" }))
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ ok: true })

    isMailConfigured.mockReturnValueOnce(true)
    requestRecoveryCode.mockRejectedValueOnce(new Error("boom"))
    response = await POST(jsonRequest({ phone: "12345678" }))
    expect(response.status).toBe(500)
  })

  test("auth recover route handles validation, service error, success and failure", async () => {
    const { POST } = await import("@/app/api/auth/recover/route")

    let response = await POST(jsonRequest({ phone: "123", code: "123" }))
    expect(response.status).toBe(400)

    recoverUserAccount.mockResolvedValueOnce({ ok: false, status: 401, message: "bad creds" })
    response = await POST(jsonRequest({ phone: "12345678", code: "123456" }))
    expect(response.status).toBe(401)
    expect(await readJson(response)).toEqual({ message: "bad creds" })

    createSessionId.mockReturnValue("sid")
    createAuthToken.mockResolvedValue("token")
    recoverUserAccount.mockResolvedValueOnce({
      ok: true,
      user: { id: 8, email: "user@example.com" },
    })
    response = await POST(jsonRequest({ phone: "12345678", code: "123456" }))
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({
      user: { id: 8, email: "user@example.com" },
    })
    expect(touchUserActivity).toHaveBeenCalledWith(8, true)
    expect(setAuthCookies).toHaveBeenCalled()

    recoverUserAccount.mockRejectedValueOnce(new Error("boom"))
    response = await POST(jsonRequest({ phone: "12345678", code: "123456" }))
    expect(response.status).toBe(500)
  })

  test("auth register route handles validation, service error, success and failure", async () => {
    const { POST } = await import("@/app/api/auth/register/route")

    let response = await POST(jsonRequest({ email: "bad" }))
    expect(response.status).toBe(400)

    registerUser.mockResolvedValueOnce({
      ok: false,
      status: 409,
      message: "duplicate",
      fieldErrors: { email: ["duplicate"] },
    })
    response = await POST(
      jsonRequest({
        email: "user@example.com",
        password: "password123",
        confirmPassword: "password123",
        firstName: "Ivan",
        lastName: "",
        username: "ivan_test",
        phone: "12345678",
      })
    )
    expect(response.status).toBe(409)

    createSessionId.mockReturnValue("sid")
    createAuthToken.mockResolvedValue("token")
    registerUser.mockResolvedValueOnce({
      ok: true,
      user: { id: 7, email: "user@example.com" },
    })
    response = await POST(
      jsonRequest({
        email: "user@example.com",
        password: "password123",
        confirmPassword: "password123",
        firstName: "Ivan",
        lastName: "",
        username: "ivan_test",
        phone: "12345678",
      })
    )
    expect(response.status).toBe(201)
    expect(touchUserActivity).toHaveBeenCalledWith(7, true)
    expect(setAuthCookies).toHaveBeenCalled()

    registerUser.mockRejectedValueOnce(new Error("boom"))
    response = await POST(
      jsonRequest({
        email: "user@example.com",
        password: "password123",
        confirmPassword: "password123",
        firstName: "Ivan",
        lastName: "",
        username: "ivan_test",
        phone: "12345678",
      })
    )
    expect(response.status).toBe(500)
  })

  test("auth logout route clears cookies", async () => {
    const { POST } = await import("@/app/api/auth/logout/route")

    const response = await POST()
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ ok: true })
    expect(clearAuthCookies).toHaveBeenCalled()
  })

  test("notifications subscribe route handles auth, config, bad body and success", async () => {
    const { POST } = await import("@/app/api/notifications/subscribe/route")
    getAuthorizedUserIdFromRequest.mockResolvedValueOnce(null)
    let response = await POST(new NextRequest("http://localhost/api/notifications/subscribe", { method: "POST" }))
    expect(response.status).toBe(401)

    getAuthorizedUserIdFromRequest.mockResolvedValue(5)
    isPushConfigured.mockReturnValue(false)
    getPushConfigurationError.mockReturnValue("missing key")
    response = await POST(new NextRequest("http://localhost/api/notifications/subscribe", { method: "POST" }))
    expect(response.status).toBe(503)

    isPushConfigured.mockReturnValue(true)
    response = await POST(new NextRequest("http://localhost/api/notifications/subscribe", { method: "POST" }))
    expect(response.status).toBe(400)

    savePushSubscription.mockRejectedValueOnce(new Error("bad"))
    response = await POST(
      new NextRequest("http://localhost/api/notifications/subscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: "e" }),
      })
    )
    expect(response.status).toBe(400)

    savePushSubscription.mockResolvedValueOnce(undefined)
    response = await POST(
      new NextRequest("http://localhost/api/notifications/subscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: "e", keys: { p256dh: "p", auth: "a" } }),
      })
    )
    expect(response.status).toBe(200)
    expect(savePushSubscription).toHaveBeenCalledWith(5, expect.any(Object))
  })

  test("notifications unsubscribe route handles auth, missing endpoint and success", async () => {
    const { POST } = await import("@/app/api/notifications/unsubscribe/route")

    getAuthorizedUserIdFromRequest.mockResolvedValueOnce(null)
    let response = await POST(new NextRequest("http://localhost", { method: "POST" }))
    expect(response.status).toBe(401)

    getAuthorizedUserIdFromRequest.mockResolvedValue(9)
    response = await POST(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ endpoint: "  " }),
      })
    )
    expect(response.status).toBe(400)

    response = await POST(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ endpoint: "endpoint" }),
      })
    )
    expect(response.status).toBe(200)
    expect(removePushSubscription).toHaveBeenCalledWith(9, "endpoint")
  })

  test("notifications vapid public key route handles missing and configured keys", async () => {
    const { GET } = await import("@/app/api/notifications/vapid-public-key/route")

    getPublicVapidKey.mockReturnValueOnce(null)
    getPushConfigurationError.mockReturnValueOnce("missing")
    let response = await GET()
    expect(response.status).toBe(503)

    getPublicVapidKey.mockReturnValueOnce("public-key")
    response = await GET()
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ publicKey: "public-key" })
  })
})
