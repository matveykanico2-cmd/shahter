import { prisma, type DbRow } from "@/shared/lib/db/prisma"

const TECHNICAL_DEVELOPER_EMAILS = new Set(["matveykanico@gmail.com"])

type ProtectedUser = {
  id: number
  email: string
  role: string
}

function hasIncomingMessageProtection(user: ProtectedUser) {
  return user.role.trim().toLowerCase() !== "user" || TECHNICAL_DEVELOPER_EMAILS.has(user.email.trim().toLowerCase())
}

export async function canWriteToProtectedUser(actorId: number, targetUserId: number) {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      role: true,
    },
  })

  if (!targetUser) {
    return { ok: false as const, code: "USER_NOT_FOUND" as const }
  }

  if (!hasIncomingMessageProtection(targetUser as ProtectedUser)) {
    return { ok: true as const }
  }

  const inverseContact = await prisma.contact.findFirst({
    where: {
      ownerId: targetUserId,
      contactUserId: actorId,
    },
    select: { id: true },
  })

  if (inverseContact) {
    return { ok: true as const }
  }

  return { ok: false as const, code: "CONTACT_REQUIRED" as const }
}

export async function canWriteToDialog(dialogId: number, actorId: number) {
  const dialog = await prisma.dialog.findFirst({
    where: {
      id: dialogId,
      users: {
        some: { id: actorId },
      },
    },
    select: {
      id: true,
      users: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  })

  if (!dialog) {
    return { ok: false as const, code: "DIALOG_NOT_FOUND" as const }
  }

  if (dialog.users.length !== 2) {
    return { ok: true as const }
  }

  const otherUser = dialog.users.find((user: DbRow) => user.id !== actorId)

  if (!otherUser || !hasIncomingMessageProtection(otherUser)) {
    return { ok: true as const }
  }

  const inverseContact = await prisma.contact.findFirst({
    where: {
      ownerId: otherUser.id,
      contactUserId: actorId,
    },
    select: { id: true },
  })

  if (inverseContact) {
    return { ok: true as const }
  }

  return { ok: false as const, code: "CONTACT_REQUIRED" as const }
}
