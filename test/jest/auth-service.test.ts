var MockPrismaClientKnownRequestError = class PrismaClientKnownRequestError extends Error {
  code: string
  meta?: { target?: string[] }

  constructor(code: string, meta?: { target?: string[] }) {
    super(code)
    this.code = code
    this.meta = meta
  }
}

jest.mock("@/shared/lib/db/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    otp: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    starTransaction: {
      create: jest.fn(),
    },
    contact: {
      deleteMany: jest.fn(),
    },
    userBlacklist: {
      deleteMany: jest.fn(),
    },
    message: {
      deleteMany: jest.fn(),
    },
    dialog: {
      delete: jest.fn(),
      update: jest.fn(),
    },
    pushSubscription: {
      deleteMany: jest.fn(),
    },
  },
}))
jest.mock("@/shared/lib/mail", () => ({
  sendRecoveryCodeEmail: jest.fn(),
}))
jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    hash: jest.fn(),
    compare: jest.fn(),
  },
}))
async function loadAuthService() {
  jest.resetModules()
  const module = await import("@/features/auth/api/auth-service")
  const { prisma } = jest.requireMock("@/shared/lib/db/prisma") as {
    prisma: {
      $transaction: jest.Mock
      otp: {
        create: jest.Mock
        deleteMany: jest.Mock
        findFirst: jest.Mock
      }
      user: {
        count: jest.Mock
        findFirst: jest.Mock
        create: jest.Mock
        findUnique: jest.Mock
        update: jest.Mock
      }
      starTransaction: {
        create: jest.Mock
      }
      contact: {
        deleteMany: jest.Mock
      }
      userBlacklist: {
        deleteMany: jest.Mock
      }
      message: {
        deleteMany: jest.Mock
      }
      dialog: {
        delete: jest.Mock
        update: jest.Mock
      }
      pushSubscription: {
        deleteMany: jest.Mock
      }
    }
  }
  const bcrypt = jest.requireMock("bcryptjs").default as {
    hash: jest.Mock
    compare: jest.Mock
  }
  const mail = jest.requireMock("@/shared/lib/mail") as {
    sendRecoveryCodeEmail: jest.Mock
  }

  return {
    ...module,
    mockPrisma: prisma,
    bcrypt,
    mail,
  }
}

describe("auth-service", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("registerUser rejects invalid invite and duplicates", async () => {
    const { registerUser, mockPrisma } = await loadAuthService()

    mockPrisma.user.findFirst.mockResolvedValueOnce({
      email: "user@example.com",
      phone: "12345678",
    })

    await expect(
      registerUser({
        email: "USER@example.com",
        password: "password123",
        firstName: "Ivan",
        username: "ivan_test",
        phone: "12345678",
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      fieldErrors: {
        email: ["Пользователь с таким email уже существует"],
        phone: ["Пользователь с таким телефоном уже существует"],
      },
    })

    mockPrisma.user.findFirst.mockResolvedValueOnce(null)
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    await expect(
      registerUser({
        email: "new@example.com",
        password: "password123",
        firstName: "Ivan",
        username: "ivan_new",
        phone: "12345679",
        referrerId: 999,
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      fieldErrors: {
        referrerId: ["Партнёрская ссылка недействительна"],
      },
    })
  })

  test("registerUser creates user and handles unique constraint", async () => {
    const { registerUser, mockPrisma, bcrypt } = await loadAuthService()

    mockPrisma.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    mockPrisma.user.count.mockResolvedValue(0)
    bcrypt.hash.mockResolvedValue("hash")
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 7, isBlocked: false })
      .mockResolvedValueOnce({ id: 7, role: "user", premiumUntil: null })
    mockPrisma.$transaction
      .mockImplementationOnce(async (callback: any) =>
        callback({
          user: {
            create: jest.fn().mockResolvedValue({ id: 1, email: "user@example.com" }),
          },
          usernameRegistry: {
            create: jest.fn().mockResolvedValue({}),
          },
        })
      )
      .mockRejectedValueOnce(new MockPrismaClientKnownRequestError("P2002", { target: ["email"] }))

    await expect(
      registerUser({
        email: "USER@example.com",
        password: "password123",
        firstName: "Ivan",
        lastName: "Petrov",
        username: "ivan_partner",
        phone: "12345678",
        referrerId: 7,
      })
    ).resolves.toEqual({
      ok: true,
      user: { id: 1, email: "user@example.com" },
    })
    expect(mockPrisma.user.update).toHaveBeenCalled()
    expect(mockPrisma.starTransaction.create).toHaveBeenCalled()

    await expect(
      registerUser({
        email: "other@example.com",
        password: "password123",
        firstName: "Ivan",
        username: "ivan_other",
        phone: "12345679",
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      fieldErrors: {
        email: ["Пользователь с таким email уже существует"],
      },
    })
  })

  test("loginUser validates missing user, wrong password and success", async () => {
    const { loginUser, mockPrisma, bcrypt } = await loadAuthService()

    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1, email: "user@example.com", passwordHash: "hash" })
      .mockResolvedValueOnce({ id: 1, email: "user@example.com", passwordHash: "hash" })
    bcrypt.compare.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await expect(loginUser({ email: "USER@example.com", password: "password123" })).resolves.toEqual({
      ok: false,
      status: 401,
      message: "Неверный email или пароль",
    })
    await expect(loginUser({ email: "USER@example.com", password: "password123" })).resolves.toEqual({
      ok: false,
      status: 401,
      message: "Неверный email или пароль",
    })
    await expect(loginUser({ email: "USER@example.com", password: "password123" })).resolves.toEqual({
      ok: true,
      user: { id: 1, email: "user@example.com" },
    })
  })

  test("recoverUserAccount clears account data after successful login", async () => {
    const { recoverUserAccount, mockPrisma } = await loadAuthService()

    mockPrisma.otp.findFirst.mockResolvedValueOnce({
      id: 10,
      code: 123456,
      expiredAt: Date.now() + 60_000,
    })
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, email: "user@example.com" })
      .mockResolvedValueOnce({
        id: 1,
        dialogs: [
          {
            id: 5,
            ownerId: 1,
            users: [{ id: 1 }, { id: 2 }, { id: 3 }],
          },
          {
            id: 6,
            ownerId: 1,
            users: [{ id: 1 }],
          },
        ],
      })
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        otp: { deleteMany: jest.fn(), create: jest.fn() },
        contact: { deleteMany: jest.fn() },
        userBlacklist: { deleteMany: jest.fn() },
        message: { deleteMany: jest.fn() },
        dialog: { delete: jest.fn(), update: jest.fn() },
        pushSubscription: { deleteMany: jest.fn() },
        user: { update: jest.fn() },
      })
    )

    await expect(
      recoverUserAccount({ phone: "12345678", code: "123456" })
    ).resolves.toEqual({
      ok: true,
      user: { id: 1, email: "user@example.com" },
    })
    expect(mockPrisma.$transaction).toHaveBeenCalled()
  })

  test("requestRecoveryCode stores otp and sends email", async () => {
    const { requestRecoveryCode, mockPrisma, mail } = await loadAuthService()

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 1,
      email: "user@example.com",
      phone: "12345678",
    })
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        otp: { deleteMany: jest.fn(), create: jest.fn() },
      })
    )

    await expect(requestRecoveryCode({ phone: "12345678" })).resolves.toEqual({ ok: true })
    expect(mockPrisma.$transaction).toHaveBeenCalled()
    expect(mail.sendRecoveryCodeEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      code: expect.stringMatching(/^\d{6}$/),
    })
  })
})
