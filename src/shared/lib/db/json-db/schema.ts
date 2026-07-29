import type { ModelDef } from "./types"

/**
 * Hand-maintained mirror of prisma/schema/models/*.prisma (now deleted).
 * Field names, relation names and casing here must match what the
 * application code passes to select/include/where, since this schema
 * drives the JSON query engine's behavior.
 */
export const MODELS: Record<string, ModelDef> = {
  user: {
    collection: "users",
    idField: "id",
    uniqueFields: ["email", "phone", "username"],
    uniqueCompound: [],
    relations: {
      referredBy: { kind: "belongsTo", target: "user", foreignKey: "referredById" },
      referrals: { kind: "hasMany", target: "user", foreignKey: "referredById" },
      ownedContacts: { kind: "hasMany", target: "contact", foreignKey: "ownerId" },
      inContacts: { kind: "hasMany", target: "contact", foreignKey: "contactUserId" },
      ownedBlacklistEntries: { kind: "hasMany", target: "userBlacklist", foreignKey: "ownerId" },
      blockedByUsers: { kind: "hasMany", target: "userBlacklist", foreignKey: "blockedUserId" },
      pushSubscriptions: { kind: "hasMany", target: "pushSubscription", foreignKey: "userId" },
      dialogs: { kind: "manyToMany", target: "dialog", join: "dialogUsers", thisKey: "userId", otherKey: "dialogId" },
      messages: { kind: "hasMany", target: "message", foreignKey: "authorId" },
      blockedInDialogs: { kind: "hasMany", target: "dialogBlockedUser", foreignKey: "userId" },
      blockedDialogActions: { kind: "hasMany", target: "dialogBlockedUser", foreignKey: "blockedById" },
      ownedChannels: { kind: "hasMany", target: "channel", foreignKey: "ownerId" },
      channelMemberships: { kind: "hasMany", target: "channelParticipant", foreignKey: "userId" },
      channelMessages: { kind: "hasMany", target: "channelMessage", foreignKey: "authorId" },
      newsPosts: { kind: "hasMany", target: "newsPost", foreignKey: "authorId" },
      newsPostLikes: { kind: "hasMany", target: "newsPostLike", foreignKey: "userId" },
      newsPostComments: { kind: "hasMany", target: "newsPostComment", foreignKey: "authorId" },
      adCampaigns: { kind: "hasMany", target: "adCampaign", foreignKey: "ownerId" },
      botPublications: { kind: "hasMany", target: "botPublication", foreignKey: "ownerId" },
      purchaseRequests: { kind: "hasMany", target: "purchaseRequest", foreignKey: "userId" },
      reviewedPurchaseRequests: { kind: "hasMany", target: "purchaseRequest", foreignKey: "reviewedByUserId" },
      sentStarTransactions: { kind: "hasMany", target: "starTransaction", foreignKey: "senderId" },
      receivedStarTransactions: { kind: "hasMany", target: "starTransaction", foreignKey: "recipientId" },
      sentGiftTransactions: { kind: "hasMany", target: "giftTransaction", foreignKey: "senderId" },
      receivedGiftTransactions: { kind: "hasMany", target: "giftTransaction", foreignKey: "recipientId" },
    },
    ownedRelations: [{ field: "referredBy", foreignKey: "referredById", target: "user", onDelete: "setNull" }],
    defaults: {
      starsBalance: 0,
      partnerStarsEarned: 0,
      isBlocked: false,
      profileVisibility: "everyone",
      showEmailInProfile: true,
      showPhoneInProfile: true,
      showGiftsInProfile: true,
    },
    createdAtField: "createdAt",
    dateFields: ["createdAt", "premiumUntil", "lastSeenAt", "updatedAt"],
  },

  dialog: {
    collection: "dialogs",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      users: { kind: "manyToMany", target: "user", join: "dialogUsers", thisKey: "dialogId", otherKey: "userId" },
      Messages: { kind: "hasMany", target: "message", foreignKey: "dialogId" },
      blockedUsers: { kind: "hasMany", target: "dialogBlockedUser", foreignKey: "dialogId" },
    },
    ownedRelations: [],
    defaults: {},
    dateFields: [],
  },

  message: {
    collection: "messages",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      dialog: { kind: "belongsTo", target: "dialog", foreignKey: "dialogId" },
      author: { kind: "belongsTo", target: "user", foreignKey: "authorId" },
      attachments: { kind: "hasMany", target: "messageAttachment", foreignKey: "messageId" },
      replyToMessage: { kind: "belongsTo", target: "message", foreignKey: "replyToMessageId" },
      replies: { kind: "hasMany", target: "message", foreignKey: "replyToMessageId" },
      forwardedFromAuthor: { kind: "belongsTo", target: "user", foreignKey: "forwardedFromAuthorId" },
      reactions: { kind: "hasMany", target: "messageReaction", foreignKey: "messageId" },
      polls: { kind: "hasMany", target: "poll", foreignKey: "messageId" },
    },
    ownedRelations: [
      { field: "dialog", foreignKey: "dialogId", target: "dialog", onDelete: "cascade" },
      { field: "author", foreignKey: "authorId", target: "user", onDelete: "cascade" },
      { field: "replyToMessage", foreignKey: "replyToMessageId", target: "message", onDelete: "setNull" },
      { field: "forwardedFromAuthor", foreignKey: "forwardedFromAuthorId", target: "user", onDelete: "setNull" },
    ],
    defaults: { status: "SENT" },
    createdAtField: "createdAt",
    dateFields: ["createdAt", "updatedAt"],
  },

  messageAttachment: {
    collection: "messageAttachments",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      message: { kind: "belongsTo", target: "message", foreignKey: "messageId" },
    },
    ownedRelations: [{ field: "message", foreignKey: "messageId", target: "message", onDelete: "cascade" }],
    defaults: { position: 0 },
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  contact: {
    collection: "contacts",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [["ownerId", "contactUserId"]],
    relations: {
      owner: { kind: "belongsTo", target: "user", foreignKey: "ownerId" },
      contactUser: { kind: "belongsTo", target: "user", foreignKey: "contactUserId" },
    },
    ownedRelations: [
      { field: "owner", foreignKey: "ownerId", target: "user", onDelete: "cascade" },
      { field: "contactUser", foreignKey: "contactUserId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    dateFields: [],
  },

  dialogBlockedUser: {
    collection: "dialogBlockedUsers",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [["dialogId", "userId"]],
    relations: {
      dialog: { kind: "belongsTo", target: "dialog", foreignKey: "dialogId" },
      user: { kind: "belongsTo", target: "user", foreignKey: "userId" },
      blockedBy: { kind: "belongsTo", target: "user", foreignKey: "blockedById" },
    },
    ownedRelations: [
      { field: "dialog", foreignKey: "dialogId", target: "dialog", onDelete: "cascade" },
      { field: "user", foreignKey: "userId", target: "user", onDelete: "cascade" },
      { field: "blockedBy", foreignKey: "blockedById", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  channel: {
    collection: "channels",
    idField: "id",
    uniqueFields: ["username"],
    uniqueCompound: [],
    relations: {
      owner: { kind: "belongsTo", target: "user", foreignKey: "ownerId" },
      participants: { kind: "hasMany", target: "channelParticipant", foreignKey: "channelId" },
      messages: { kind: "hasMany", target: "channelMessage", foreignKey: "channelId" },
    },
    ownedRelations: [{ field: "owner", foreignKey: "ownerId", target: "user", onDelete: "cascade" }],
    defaults: {},
    createdAtField: "createdAt",
    updatedAtField: "updatedAt",
    dateFields: ["createdAt", "updatedAt"],
  },

  channelParticipant: {
    collection: "channelParticipants",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [["channelId", "userId"]],
    relations: {
      channel: { kind: "belongsTo", target: "channel", foreignKey: "channelId" },
      user: { kind: "belongsTo", target: "user", foreignKey: "userId" },
    },
    ownedRelations: [
      { field: "channel", foreignKey: "channelId", target: "channel", onDelete: "cascade" },
      { field: "user", foreignKey: "userId", target: "user", onDelete: "cascade" },
    ],
    defaults: { role: "MEMBER" },
    createdAtField: "createdAt",
    updatedAtField: "updatedAt",
    dateFields: ["createdAt", "updatedAt"],
  },

  channelMessage: {
    collection: "channelMessages",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      channel: { kind: "belongsTo", target: "channel", foreignKey: "channelId" },
      author: { kind: "belongsTo", target: "user", foreignKey: "authorId" },
      attachments: { kind: "hasMany", target: "channelMessageAttachment", foreignKey: "channelMessageId" },
      replyToMessage: { kind: "belongsTo", target: "channelMessage", foreignKey: "replyToMessageId" },
      replies: { kind: "hasMany", target: "channelMessage", foreignKey: "replyToMessageId" },
      forwardedFromAuthor: { kind: "belongsTo", target: "user", foreignKey: "forwardedFromAuthorId" },
      reactions: { kind: "hasMany", target: "channelMessageReaction", foreignKey: "channelMessageId" },
      polls: { kind: "hasMany", target: "poll", foreignKey: "channelMessageId" },
    },
    ownedRelations: [
      { field: "channel", foreignKey: "channelId", target: "channel", onDelete: "cascade" },
      { field: "author", foreignKey: "authorId", target: "user", onDelete: "cascade" },
      { field: "replyToMessage", foreignKey: "replyToMessageId", target: "channelMessage", onDelete: "setNull" },
      { field: "forwardedFromAuthor", foreignKey: "forwardedFromAuthorId", target: "user", onDelete: "setNull" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    updatedAtField: "updatedAt",
    dateFields: ["createdAt", "updatedAt"],
  },

  channelMessageAttachment: {
    collection: "channelMessageAttachments",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      channelMessage: { kind: "belongsTo", target: "channelMessage", foreignKey: "channelMessageId" },
    },
    ownedRelations: [
      { field: "channelMessage", foreignKey: "channelMessageId", target: "channelMessage", onDelete: "cascade" },
    ],
    defaults: { position: 0 },
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  newsPost: {
    collection: "newsPosts",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      author: { kind: "belongsTo", target: "user", foreignKey: "authorId" },
      likes: { kind: "hasMany", target: "newsPostLike", foreignKey: "postId" },
      comments: { kind: "hasMany", target: "newsPostComment", foreignKey: "postId" },
      attachments: { kind: "hasMany", target: "newsPostAttachment", foreignKey: "postId" },
    },
    ownedRelations: [{ field: "author", foreignKey: "authorId", target: "user", onDelete: "cascade" }],
    defaults: {},
    createdAtField: "createdAt",
    updatedAtField: "updatedAt",
    dateFields: ["createdAt", "updatedAt"],
  },

  newsPostLike: {
    collection: "newsPostLikes",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [["postId", "userId"]],
    relations: {
      post: { kind: "belongsTo", target: "newsPost", foreignKey: "postId" },
      user: { kind: "belongsTo", target: "user", foreignKey: "userId" },
    },
    ownedRelations: [
      { field: "post", foreignKey: "postId", target: "newsPost", onDelete: "cascade" },
      { field: "user", foreignKey: "userId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  newsPostComment: {
    collection: "newsPostComments",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      post: { kind: "belongsTo", target: "newsPost", foreignKey: "postId" },
      author: { kind: "belongsTo", target: "user", foreignKey: "authorId" },
    },
    ownedRelations: [
      { field: "post", foreignKey: "postId", target: "newsPost", onDelete: "cascade" },
      { field: "author", foreignKey: "authorId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    updatedAtField: "updatedAt",
    dateFields: ["createdAt", "updatedAt"],
  },

  newsPostAttachment: {
    collection: "newsPostAttachments",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      post: { kind: "belongsTo", target: "newsPost", foreignKey: "postId" },
    },
    ownedRelations: [{ field: "post", foreignKey: "postId", target: "newsPost", onDelete: "cascade" }],
    defaults: { position: 0 },
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  userBlacklist: {
    collection: "userBlacklist",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [["ownerId", "blockedUserId"]],
    relations: {
      owner: { kind: "belongsTo", target: "user", foreignKey: "ownerId" },
      blockedUser: { kind: "belongsTo", target: "user", foreignKey: "blockedUserId" },
    },
    ownedRelations: [
      { field: "owner", foreignKey: "ownerId", target: "user", onDelete: "cascade" },
      { field: "blockedUser", foreignKey: "blockedUserId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  otp: {
    collection: "otps",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {},
    ownedRelations: [],
    defaults: {},
    dateFields: [],
  },

  purchaseRequest: {
    collection: "purchaseRequests",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      user: { kind: "belongsTo", target: "user", foreignKey: "userId" },
      reviewedBy: { kind: "belongsTo", target: "user", foreignKey: "reviewedByUserId" },
    },
    ownedRelations: [
      { field: "user", foreignKey: "userId", target: "user", onDelete: "cascade" },
      { field: "reviewedBy", foreignKey: "reviewedByUserId", target: "user", onDelete: "setNull" },
    ],
    defaults: { premiumMonths: 0, starsAmount: 0 },
    createdAtField: "createdAt",
    dateFields: ["createdAt", "paidAt", "reviewedAt"],
  },

  pushSubscription: {
    collection: "pushSubscriptions",
    idField: "id",
    uniqueFields: ["endpoint"],
    uniqueCompound: [],
    relations: {
      user: { kind: "belongsTo", target: "user", foreignKey: "userId" },
    },
    ownedRelations: [{ field: "user", foreignKey: "userId", target: "user", onDelete: "cascade" }],
    defaults: {},
    createdAtField: "createdAt",
    updatedAtField: "updatedAt",
    dateFields: ["createdAt", "updatedAt"],
  },

  starTransaction: {
    collection: "starTransactions",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      sender: { kind: "belongsTo", target: "user", foreignKey: "senderId" },
      recipient: { kind: "belongsTo", target: "user", foreignKey: "recipientId" },
    },
    ownedRelations: [
      { field: "sender", foreignKey: "senderId", target: "user", onDelete: "setNull" },
      { field: "recipient", foreignKey: "recipientId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  giftTransaction: {
    collection: "giftTransactions",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      sender: { kind: "belongsTo", target: "user", foreignKey: "senderId" },
      recipient: { kind: "belongsTo", target: "user", foreignKey: "recipientId" },
    },
    ownedRelations: [
      { field: "sender", foreignKey: "senderId", target: "user", onDelete: "setNull" },
      { field: "recipient", foreignKey: "recipientId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  adCampaign: {
    collection: "adCampaigns",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      owner: { kind: "belongsTo", target: "user", foreignKey: "ownerId" },
    },
    ownedRelations: [{ field: "owner", foreignKey: "ownerId", target: "user", onDelete: "cascade" }],
    defaults: { clicks: 0, impressions: 0 },
    createdAtField: "createdAt",
    updatedAtField: "updatedAt",
    dateFields: ["createdAt", "updatedAt", "startsAt", "endsAt"],
  },

  botPublication: {
    collection: "botPublications",
    idField: "id",
    uniqueFields: ["username"],
    uniqueCompound: [],
    relations: {
      owner: { kind: "belongsTo", target: "user", foreignKey: "ownerId" },
    },
    ownedRelations: [{ field: "owner", foreignKey: "ownerId", target: "user", onDelete: "cascade" }],
    defaults: { isBlocked: false },
    createdAtField: "publishedAt",
    updatedAtField: "updatedAt",
    dateFields: ["publishedAt", "updatedAt"],
  },

  usernameRegistry: {
    collection: "usernameRegistry",
    idField: "id",
    uniqueFields: ["username"],
    uniqueCompound: [["entityType", "entityId"]],
    relations: {},
    ownedRelations: [],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  messageReaction: {
    collection: "messageReactions",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [["messageId", "userId"]],
    relations: {
      message: { kind: "belongsTo", target: "message", foreignKey: "messageId" },
      user: { kind: "belongsTo", target: "user", foreignKey: "userId" },
    },
    ownedRelations: [
      { field: "message", foreignKey: "messageId", target: "message", onDelete: "cascade" },
      { field: "user", foreignKey: "userId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  channelMessageReaction: {
    collection: "channelMessageReactions",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [["channelMessageId", "userId"]],
    relations: {
      channelMessage: { kind: "belongsTo", target: "channelMessage", foreignKey: "channelMessageId" },
      user: { kind: "belongsTo", target: "user", foreignKey: "userId" },
    },
    ownedRelations: [
      { field: "channelMessage", foreignKey: "channelMessageId", target: "channelMessage", onDelete: "cascade" },
      { field: "user", foreignKey: "userId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  poll: {
    collection: "polls",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      message: { kind: "belongsTo", target: "message", foreignKey: "messageId" },
      channelMessage: { kind: "belongsTo", target: "channelMessage", foreignKey: "channelMessageId" },
      options: { kind: "hasMany", target: "pollOption", foreignKey: "pollId" },
    },
    ownedRelations: [
      { field: "message", foreignKey: "messageId", target: "message", onDelete: "cascade" },
      { field: "channelMessage", foreignKey: "channelMessageId", target: "channelMessage", onDelete: "cascade" },
    ],
    defaults: { allowMultiple: false },
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },

  pollOption: {
    collection: "pollOptions",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [],
    relations: {
      poll: { kind: "belongsTo", target: "poll", foreignKey: "pollId" },
      votes: { kind: "hasMany", target: "pollVote", foreignKey: "pollOptionId" },
    },
    ownedRelations: [{ field: "poll", foreignKey: "pollId", target: "poll", onDelete: "cascade" }],
    defaults: { position: 0 },
    dateFields: [],
  },

  pollVote: {
    collection: "pollVotes",
    idField: "id",
    uniqueFields: [],
    uniqueCompound: [["pollOptionId", "userId"]],
    relations: {
      pollOption: { kind: "belongsTo", target: "pollOption", foreignKey: "pollOptionId" },
      user: { kind: "belongsTo", target: "user", foreignKey: "userId" },
    },
    ownedRelations: [
      { field: "pollOption", foreignKey: "pollOptionId", target: "pollOption", onDelete: "cascade" },
      { field: "user", foreignKey: "userId", target: "user", onDelete: "cascade" },
    ],
    defaults: {},
    createdAtField: "createdAt",
    dateFields: ["createdAt"],
  },
}

export const MANY_TO_MANY_JOIN_TABLES = ["dialogUsers"] as const

export function getModel(name: string): ModelDef {
  const model = MODELS[name]
  if (!model) {
    throw new Error(`Unknown JSON DB model: ${name}`)
  }
  return model
}
