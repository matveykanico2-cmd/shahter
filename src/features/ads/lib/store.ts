import type { CreateAdCampaignInput } from "@/features/ads/model/schemas"
import { prisma } from "@/shared/lib/db/prisma"

export type AdCampaignStatus = "draft" | "active" | "paused"
export type AdCampaignAudience = "all" | "client" | "user"

export type AdCampaignOwner = {
  id: number
  firstName: string
  lastName: string | null
  email: string
  role: string
  avatarTone: string | null
  isBlocked: boolean
}

export type AdCampaign = {
  id: number
  ownerId: number
  title: string
  description: string
  ctaText: string
  targetUrl: string
  audience: AdCampaignAudience
  budget: number
  status: AdCampaignStatus
  clicks: number
  impressions: number
  createdAt: string
  updatedAt: string
  startsAt: string | null
  endsAt: string | null
  owner: AdCampaignOwner
}

const STATUS_ORDER: Record<string, number> = { active: 0, draft: 1 }

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return new Date(value).toISOString()
  return new Date().toISOString()
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return toIso(value)
}

function mapCampaign(row: Record<string, unknown>): AdCampaign {
  const owner = row.owner as Record<string, unknown>
  return {
    id: row.id as number,
    ownerId: row.ownerId as number,
    title: row.title as string,
    description: row.description as string,
    ctaText: row.ctaText as string,
    targetUrl: row.targetUrl as string,
    audience: row.audience as AdCampaignAudience,
    budget: row.budget as number,
    status: row.status as AdCampaignStatus,
    clicks: row.clicks as number,
    impressions: row.impressions as number,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    startsAt: toIsoOrNull(row.startsAt),
    endsAt: toIsoOrNull(row.endsAt),
    owner: {
      id: owner.id as number,
      firstName: owner.firstName as string,
      lastName: (owner.lastName as string | null) ?? null,
      email: owner.email as string,
      role: owner.role as string,
      avatarTone: (owner.avatarTone as string | null) ?? null,
      isBlocked: Boolean(owner.isBlocked),
    },
  }
}

function sortCampaigns(rows: AdCampaign[]): AdCampaign[] {
  return rows.slice().sort((a, b) => {
    const aOrder = STATUS_ORDER[a.status] ?? 2
    const bOrder = STATUS_ORDER[b.status] ?? 2
    if (aOrder !== bOrder) return aOrder - bOrder
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

async function queryCampaigns(where: Record<string, unknown>) {
  const rows = await prisma.adCampaign.findMany({
    where,
    include: {
      owner: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true, avatarTone: true, isBlocked: true },
      },
    },
  })

  return sortCampaigns(rows.map(mapCampaign))
}

export async function listPublicAdCampaigns() {
  return queryCampaigns({ status: "active" })
}

export async function listAdCampaignsByOwner(ownerId: number) {
  return queryCampaigns({ ownerId })
}

export async function createAdCampaign(ownerId: number, input: CreateAdCampaignInput) {
  const created = await prisma.adCampaign.create({
    data: {
      ownerId,
      title: input.title,
      description: input.description,
      ctaText: input.ctaText,
      targetUrl: input.targetUrl,
      audience: input.audience,
      budget: input.budget,
      status: "draft",
      clicks: 0,
      impressions: 0,
    },
    include: {
      owner: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true, avatarTone: true, isBlocked: true },
      },
    },
  })

  return mapCampaign(created)
}

export async function getOwnedAdCampaign(adId: number, ownerId: number) {
  const [campaign] = await queryCampaigns({ id: adId, ownerId })
  return campaign ?? null
}

export async function updateAdCampaignStatus(
  adId: number,
  ownerId: number,
  status: AdCampaignStatus
) {
  const existing = await prisma.adCampaign.findFirst({ where: { id: adId, ownerId } })
  if (!existing) {
    return getOwnedAdCampaign(adId, ownerId)
  }

  await prisma.adCampaign.updateMany({
    where: { id: adId, ownerId },
    data: {
      status,
      startsAt: status === "active" ? new Date() : existing.startsAt,
      updatedAt: new Date(),
    },
  })

  return getOwnedAdCampaign(adId, ownerId)
}

export async function deleteAdCampaign(adId: number, ownerId: number) {
  await prisma.adCampaign.deleteMany({ where: { id: adId, ownerId } })
}

export async function recordAdCampaignClick(adId: number) {
  const existing = await prisma.adCampaign.findFirst({ where: { id: adId, status: "active" } })
  if (!existing) return

  await prisma.adCampaign.updateMany({
    where: { id: adId, status: "active" },
    data: {
      clicks: { increment: 1 },
      updatedAt: new Date(),
    },
  })
}
