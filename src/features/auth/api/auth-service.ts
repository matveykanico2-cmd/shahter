import bcrypt from "bcryptjs"

import { env } from "@/shared/config/env"
import { ADMIN_ROLE, USER_ROLE } from "@/shared/lib/auth/roles"
import {
  extendPremiumUntilByDays,
  resolveRoleAfterPremiumPurchase,
} from "@/shared/lib/billing/premium"
import { prisma, type DbRow } from "@/shared/lib/db/prisma"
import { isPrismaKnownRequestError } from "@/shared/lib/db/prisma-errors"
import { sendRecoveryCodeEmail } from "@/shared/lib/mail"
import {
  PARTNER_REWARD_PREMIUM_DAYS,
  PARTNER_REWARD_STARS,
} from "@/shared/lib/rewards/catalog"
import { normalizeUsername, reserveUsername } from "@/shared/lib/usernames"

async function resolveInitialRole(email: string) {
  const elevatedUsersCount = await prisma.user.count({
    where: {
      role: {
        in: [ADMIN_ROLE],
      },
    },
  })

  if (elevatedUsersCount > 0) {
    return USER_ROLE
  }

  if (env.BOOTSTRAP_ADMIN_EMAIL) {
    return email === env.BOOTSTRAP_ADMIN_EMAIL ? ADMIN_ROLE : USER_ROLE
  }

  return ADMIN_ROLE
}

type AuthResult =
  | { ok: true; user: { id: number; email: string } }
  | {
      ok: false
      status: number
      message: string
      fieldErrors?: Record<string, string[]>
    }

function createRecoveryCode() {
  return Math.floor(100_000 + Math.random() * 900_000)
}

async function clearUserAccountData(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      dialogs: {
        select: {
          id: true,
          ownerId: true,
          users: {
            select: { id: true },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  })

  if (!user) {
    return false
  }

  await prisma.$transaction(async (tx) => {
    await tx.contact.deleteMany({
      where: { ownerId: userId },
    })

    await tx.userBlacklist.deleteMany({
      where: { ownerId: userId },
    })

    for (const dialog of user.dialogs) {
      const remainingUserIds = dialog.users
        .map((item: DbRow) => item.id)
        .filter((id: number) => id !== user.id)

      if (remainingUserIds.length === 0) {
        await tx.message.deleteMany({
          where: { dialogId: dialog.id },
        })

        await tx.dialog.delete({
          where: { id: dialog.id },
        })
        continue
      }

      const nextOwnerId = dialog.ownerId === user.id ? remainingUserIds[0] : dialog.ownerId

      await tx.dialog.update({
        where: { id: dialog.id },
        data: {
          ownerId: nextOwnerId,
          users: {
            disconnect: { id: user.id },
          },
        },
      })
    }

    await tx.message.deleteMany({
      where: { authorId: user.id },
    })

    await tx.pushSubscription.deleteMany({
      where: { userId },
    })

    await tx.user.update({
      where: { id: userId },
      data: {
        updatedAt: new Date(),
      },
    })
  })

  return true
}

export async function registerUser(input: {
  email: string
  password: string
  firstName: string
  lastName?: string
  username: string
  phone: string
  referrerId?: number
}): Promise<AuthResult> {
  const email = input.email.toLowerCase()
  const duplicateUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { phone: input.phone }],
    },
    select: {
      email: true,
      phone: true,
    },
  })

  if (duplicateUser) {
    const fieldErrors: Record<string, string[]> = {}

    if (duplicateUser.email === email) {
      fieldErrors.email = ["Пользователь с таким email уже существует"]
    }

    if (duplicateUser.phone === input.phone) {
      fieldErrors.phone = ["Пользователь с таким телефоном уже существует"]
    }

    return {
      ok: false,
      status: 409,
      message: "Пользователь уже существует",
      fieldErrors,
    }
  }

  if (input.referrerId) {
    const referrer = await prisma.user.findUnique({
      where: { id: input.referrerId },
      select: {
        id: true,
        isBlocked: true,
      },
    })

    if (!referrer || referrer.isBlocked) {
      return {
        ok: false,
        status: 400,
        message: "Партнёрская ссылка недействительна",
        fieldErrors: {
          referrerId: ["Партнёрская ссылка недействительна"],
        },
      }
    }
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const role = await resolveInitialRole(email)

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName || null,
          username: normalizeUsername(input.username),
          phone: input.phone,
          role,
          referredById: input.referrerId ?? null,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
        },
      })

      await reserveUsername(tx, input.username, "user", created.id)
      return created
    })

    if (input.referrerId) {
      const referrer = await prisma.user.findUnique({
        where: { id: input.referrerId },
        select: {
          id: true,
          role: true,
          premiumUntil: true,
        },
      })

      if (referrer) {
        await prisma.user.update({
          where: { id: input.referrerId },
          data: {
            role: resolveRoleAfterPremiumPurchase(referrer.role),
            premiumUntil: extendPremiumUntilByDays(
              referrer.premiumUntil,
              PARTNER_REWARD_PREMIUM_DAYS
            ),
            starsBalance: {
              increment: PARTNER_REWARD_STARS,
            },
            partnerStarsEarned: {
              increment: PARTNER_REWARD_STARS,
            },
            updatedAt: new Date(),
          },
        })
      }

      await prisma.starTransaction.create({
        data: {
          senderId: null,
          recipientId: input.referrerId,
          amount: PARTNER_REWARD_STARS,
          kind: "PARTNER_REWARD",
          note: `Награда за регистрацию пользователя ${user.email}: ${PARTNER_REWARD_STARS} звёзд и ${PARTNER_REWARD_PREMIUM_DAYS} дней premium`,
        },
      })
    }

    return { ok: true, user: user as { id: number; email: string } }
  } catch (error) {
    if (isPrismaKnownRequestError(error, "P2002")) {
      const targets = Array.isArray(error.meta?.target) ? error.meta.target : []
      const fieldErrors: Record<string, string[]> = {}

      if (targets.includes("email")) {
        fieldErrors.email = ["Пользователь с таким email уже существует"]
      }

      if (targets.includes("phone")) {
        fieldErrors.phone = ["Пользователь с таким телефоном уже существует"]
      }

      if (targets.includes("username") || targets.includes("username_registry_username_key")) {
        fieldErrors.username = ["Этот username уже занят"]
      }

      return {
        ok: false,
        status: 409,
        message: "Пользователь уже существует",
        fieldErrors,
      }
    }

    throw error
  }
}

export async function loginUser(input: {
  email: string
  password: string
}): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isBlocked: true,
    },
  })

  if (!user) {
    return { ok: false, status: 401, message: "Неверный email или пароль" }
  }

  if (user.isBlocked) {
    return { ok: false, status: 403, message: "Аккаунт заблокирован" }
  }

  const passwordMatch = await bcrypt.compare(input.password, user.passwordHash)

  if (!passwordMatch) {
    return { ok: false, status: 401, message: "Неверный email или пароль" }
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
    },
  }
}

export async function requestRecoveryCode(input: {
  phone: string
}): Promise<{ ok: true } | AuthResult> {
  const phone = input.phone.trim()
  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      email: true,
      phone: true,
    },
  })

  if (!user) {
    return { ok: false, status: 404, message: "Аккаунт не найден" }
  }

  const code = createRecoveryCode()
  const expiredAt = Date.now() + 10 * 60 * 1000

  await prisma.$transaction(async (tx) => {
    await tx.otp.deleteMany({
      where: {
        OR: [{ phone }, { email: user.email }],
      },
    })

    await tx.otp.create({
      data: {
        code,
        email: user.email,
        phone,
        expiredAt,
      },
    })
  })

  await sendRecoveryCodeEmail({
    to: user.email,
    code: code.toString(),
  })

  return { ok: true }
}

export async function recoverUserAccount(input: {
  phone: string
  code: string
}): Promise<AuthResult> {
  const phone = input.phone.trim()
  const otp = await prisma.otp.findFirst({
    where: { phone },
    orderBy: { id: "desc" },
    select: {
      id: true,
      code: true,
      expiredAt: true,
    },
  })

  if (!otp || otp.expiredAt < Date.now() || otp.code !== Number(input.code.trim())) {
    return { ok: false, status: 401, message: "Неверный код подтверждения" }
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      email: true,
    },
  })

  if (!user) {
    return { ok: false, status: 404, message: "Аккаунт не найден" }
  }

  const cleared = await clearUserAccountData(user.id)
  if (!cleared) {
    return { ok: false, status: 404, message: "Аккаунт не найден" }
  }

  await prisma.otp.deleteMany({
    where: {
      OR: [{ phone }, { email: user.email }],
    },
  })

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
    },
  }
}
