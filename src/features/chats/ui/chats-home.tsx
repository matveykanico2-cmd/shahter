"use client"

import {
  ArrowLeftIcon,
  BarChart3Icon,
  CircleIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  FileImageIcon,
  ForwardIcon,
  MicIcon,
  MusicIcon,
  PaperclipIcon,
  PhoneCallIcon,
  ReplyIcon,
  RefreshCcwIcon,
  SmilePlusIcon,
  StopCircleIcon,
  UserPlusIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { AccountStatusBadge } from "@/components/ui/account-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { LogoutButton } from "@/features/auth/ui/logout-button"
import {
  type BotChatMessage,
  type BotConfig,
  buildBotReply,
  createInitialBotMessages,
} from "@/features/bots/lib/runtime"
import { ChatCallOverlay } from "@/features/calls/ui/chat-call-overlay"
import { useI18n } from "@/features/i18n/model/i18n-provider"
import { LanguageToggle } from "@/features/i18n/ui/language-toggle"
import { BottomNav } from "@/features/navigation/ui/bottom-nav"
import { PushToggle } from "@/features/notifications/ui/push-toggle"
import {
  getDialogDisplayTitle,
  getDialogUserName,
} from "@/features/chats/lib/dialog-title"
import { ThemeToggle } from "@/features/theme/ui/theme-toggle"
import { hasAdministrativeAccess } from "@/shared/lib/auth/roles"
import type { MediaAttachment, MediaKind } from "@/shared/lib/media/constants"
import { BotAvatar } from "@/shared/ui/bot-avatar"
import { CountryFlagBadge } from "@/shared/ui/country-flag-badge"
import { switchCameraInMediaStream } from "@/shared/lib/media/camera"
import { MessageAttachmentView } from "@/shared/ui/message-attachment-view"
import { UserAvatar } from "@/shared/ui/user-avatar"

type UserShort = {
  id: number
  firstName: string
  lastName: string | null
  email: string
  role: string
  phone?: string | null
  avatarTone?: string | null
  avatarUrl?: string | null
  isBlocked?: boolean
  lastSeenAt?: string | null
  isOnline?: boolean
}

type ContactUser = {
  id: number
  firstName: string
  lastName: string | null
  email: string
  phone: string
  role: string
  avatarTone?: string | null
  avatarUrl?: string | null
  isBlocked?: boolean
}

type MessageReaction = {
  emoji: string
  count: number
  reactedByMe: boolean
}

type PollOption = {
  id: number
  text: string
  votesCount: number
  votedByMe: boolean
}

type MessagePoll = {
  id: number
  question: string
  allowMultiple: boolean
  totalVotes: number
  options: PollOption[]
}

type ChatMessage = {
  id: number
  content: string
  status?: string | null
  createdAt: string
  dialogId: number
  attachment?: MediaAttachment | MediaAttachment[] | null
  author: {
    id: number
    firstName: string
    lastName: string | null
    avatarTone?: string | null
    avatarUrl?: string | null
  }
  replyTo?: { id: number; content: string; author: { id: number; firstName: string; lastName: string | null } } | null
  forwardedFrom?: { authorId: number | null; authorName: string } | null
  reactions?: MessageReaction[]
  poll?: MessagePoll | null
}

const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"]

type ChatDialog = {
  id: number
  ownerId: number
  title: string | null
  users: UserShort[]
  unreadCount: number
  lastMessage: ChatMessage | null
}

type BotConversationMessage = BotChatMessage & {
  createdAt: string
}

export type ChatsHomeProps = {
  user: UserShort
  dialogs: ChatDialog[]
  contacts: ContactUser[]
  channels?: Array<{
    id: number
    title: string
    username?: string | null
    description: string | null
    avatarUrl?: string | null
  }>
  bots?: Array<{
    id: number
    name: string
    username?: string | null
    niche: string | null
    avatarUrl?: string | null
    config: BotConfig
  }>
  initialDialogId: number | null
  initialBotId?: number | null
  initialCallMode?: "audio" | "video" | null
  initialAnswerIncoming?: boolean
  initialAnswerCallId?: string | null
}

type ComposerAttachment = {
  kind: MediaKind
  file: File
}

type ChannelSearchResult = {
  id: number
  title: string
  username?: string | null
  description: string | null
  avatarUrl?: string | null
  ownerId: number
  memberCount: number
  joined: boolean
  myRole?: string | null
}

type DiscoveryUserResult = {
  id: number
  username?: string | null
  firstName: string
  lastName: string | null
  email: string
  phone?: string | null
  role: string
  avatarTone?: string | null
  avatarUrl?: string | null
  isAlreadyContact?: boolean
  isBlacklisted?: boolean
}

type DiscoveryBotResult = {
  id: number
  username?: string | null
  name: string
  niche: string | null
  avatarUrl?: string | null
}

const GALLERY_ACCEPT = "image/*,video/*"
const AUDIO_ACCEPT = "audio/*"
const FILES_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.csv,.json,.rtf,application/*,text/*"

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getDialogMembersSubtitle(dialog: ChatDialog, currentUserId: number) {
  if (dialog.users.length === 2) {
    const otherUser = dialog.users.find((item) => item.id !== currentUserId)
    if (otherUser) {
      return getUserPresenceLabel(otherUser)
    }
  }

  const names = dialog.users
    .filter((item) => item.id !== currentUserId)
    .map((item) => getDialogUserName(item))

  if (names.length === 0) {
    return "Только вы"
  }

  return names.join(", ")
}

function getTypingLabel(dialog: ChatDialog, currentUserId: number, typingUserIds: number[]) {
  const typingUsers = dialog.users.filter(
    (dialogUser) => dialogUser.id !== currentUserId && typingUserIds.includes(dialogUser.id)
  )

  if (typingUsers.length === 0) {
    return null
  }

  if (typingUsers.length === 1 && dialog.users.length === 2) {
    return "Печатает..."
  }

  const names = typingUsers.map((dialogUser) => getDialogUserName(dialogUser))
  return `${names.join(", ")} печатает...`
}

function formatLastSeen(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getUserPresenceLabel(user: UserShort) {
  if (user.isOnline) {
    return "Онлайн"
  }

  if (user.lastSeenAt) {
    return `Был(а) в сети ${formatLastSeen(user.lastSeenAt)}`
  }

  return "Статус неизвестен"
}

function OnlineDot() {
  return <span className="inline-block size-2 rounded-full bg-green-500 align-middle" />
}

function PresenceLabel({ user, className = "" }: { user: UserShort; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      {user.isOnline ? <OnlineDot /> : null}
      <span className="truncate">{getUserPresenceLabel(user)}</span>
    </span>
  )
}

function getDirectDialogOtherUser(dialog: ChatDialog, currentUserId: number) {
  if (dialog.users.length !== 2) {
    return null
  }

  return dialog.users.find((item) => item.id !== currentUserId) ?? null
}

function getDialogAvatarUser(dialog: ChatDialog, currentUserId: number) {
  return (
    getDirectDialogOtherUser(dialog, currentUserId) ??
    dialog.users.find((item) => item.id !== currentUserId) ??
    dialog.users[0] ??
    null
  )
}

function buildEntityLink(username: string | null | undefined, fallbackPath: string) {
  const normalizedUsername = username?.trim().replace(/^@+/, "")
  return normalizedUsername ? `/@${normalizedUsername}` : fallbackPath
}

function canLeaveDialog(dialog: ChatDialog, currentUserId: number) {
  return dialog.users.length > 2 && dialog.users.some((item) => item.id === currentUserId)
}

function canDeleteDialog(dialog: ChatDialog, currentUserId: number) {
  if (dialog.users.length === 2) {
    return dialog.users.some((item) => item.id === currentUserId)
  }

  return dialog.ownerId === currentUserId
}

function canManageDialogParticipants(dialog: ChatDialog, currentUserId: number) {
  return dialog.ownerId === currentUserId && dialog.users.length > 2
}

function canRemoveParticipant(
  dialog: ChatDialog,
  currentUserId: number,
  participantId: number
) {
  return (
    canManageDialogParticipants(dialog, currentUserId) &&
    dialog.users.length > 2 &&
    participantId !== currentUserId &&
    participantId !== dialog.ownerId
  )
}

function getAvailableContactsForDialog(dialog: ChatDialog, contacts: ContactUser[]) {
  const participantIds = new Set(dialog.users.map((item) => item.id))
  return contacts.filter((contact) => !participantIds.has(contact.id))
}

function withUpdatedDialogMessage(dialogs: ChatDialog[], message: ChatMessage) {
  const index = dialogs.findIndex((item) => item.id === message.dialogId)
  if (index === -1) {
    return dialogs
  }

  const next = [...dialogs]
  const [found] = next.splice(index, 1)
  next.unshift({
    ...found,
    lastMessage: message,
  })
  return next
}

function normalizeMessageStatus(status: ChatMessage["status"]): "SENT" | "DELIVERED" | "READ" {
  const normalized = status?.toUpperCase()
  if (normalized === "SENT" || normalized === "READ" || normalized === "DELIVERED") {
    return normalized
  }
  return "DELIVERED"
}

function MessageStatusIcon({ status }: { status: ChatMessage["status"] }) {
  const normalized = normalizeMessageStatus(status)
  if (normalized === "SENT") {
    return <CheckIcon className="size-3" />
  }

  const toneClass = normalized === "READ" ? "text-sky-500" : ""
  return (
    <span className={`inline-flex ${toneClass}`}>
      <CheckIcon className="-mr-1 size-3" />
      <CheckIcon className="size-3" />
    </span>
  )
}

function parseEventPayload<T>(event: Event) {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as T
  } catch {
    return null
  }
}

function createRecordedFile(parts: BlobPart[], mimeType: string, baseName: string) {
  const extension =
    mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("webm") ? "webm" : "bin"

  return new File(parts, `${baseName}.${extension}`, { type: mimeType })
}

function createBotConversationMessage(role: BotChatMessage["role"], content: string): BotConversationMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

function createBotConversationSeed(config: BotConfig) {
  return createInitialBotMessages(config).map((message) => ({
    ...message,
    createdAt: new Date().toISOString(),
  }))
}

export function ChatsHome({
  user,
  dialogs: initialDialogs,
  contacts,
  channels: initialChannels = [],
  bots: initialBots = [],
  initialDialogId,
  initialBotId = null,
  initialCallMode = null,
  initialAnswerIncoming = false,
  initialAnswerCallId = null,
}: ChatsHomeProps) {
  const { tr } = useI18n()
  const hasInitialBot =
    !initialDialogId && Boolean(initialBotId && initialBots.some((bot) => bot.id === initialBotId))
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingPreviewRef = useRef<HTMLVideoElement | null>(null)
  const pendingRecordingKindRef = useRef<"VOICE" | "VIDEO_NOTE" | null>(null)
  const discardPendingRecordingRef = useRef(false)
  const isSwitchingRecordingCameraRef = useRef(false)
  const typingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingSentRef = useRef(false)
  const lastDialogResyncAtRef = useRef(0)
  const callRequestNonceRef = useRef(1)
  const [recordingCameraFacing, setRecordingCameraFacing] = useState<"user" | "environment">("user")
  const [dialogs, setDialogs] = useState(initialDialogs)
  const [channels, setChannels] = useState(initialChannels)
  const [bots] = useState(initialBots)
  const [selectedBotId, setSelectedBotId] = useState<number | null>(
    hasInitialBot ? initialBotId : null
  )
  const [botMessagesById, setBotMessagesById] = useState<Record<number, BotConversationMessage[]>>({})
  const [selectedDialogId, setSelectedDialogId] = useState<number | null>(
    initialDialogId ?? null
  )
  const [isDialogView, setIsDialogView] = useState(Boolean(initialDialogId || hasInitialBot))
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [messagesReloadKey, setMessagesReloadKey] = useState(0)
  const [sseSince, setSseSince] = useState(0)
  const [messageText, setMessageText] = useState("")
  const [typingUserIds, setTypingUserIds] = useState<number[]>([])
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([])
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [isRecordingVideoNote, setIsRecordingVideoNote] = useState(false)
  const [callStartRequest, setCallStartRequest] = useState<{
    media: "audio" | "video"
    nonce: number
  } | null>(initialDialogId && initialCallMode ? { media: initialCallMode, nonce: 1 } : null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState("")
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null)
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null)
  const [forwardTargetDialogId, setForwardTargetDialogId] = useState<number | null>(null)
  const [isForwarding, startForwarding] = useTransition()
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null)
  const [showPollForm, setShowPollForm] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false)
  const [isCreatingPoll, startCreatingPoll] = useTransition()
  const [votingPollId, setVotingPollId] = useState<number | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([])
  const [newChatTitle, setNewChatTitle] = useState("")
  const [newChannelTitle, setNewChannelTitle] = useState("")
  const [newChannelUsername, setNewChannelUsername] = useState("")
  const [newChannelDescription, setNewChannelDescription] = useState("")
  const [newChannelAvatarFile, setNewChannelAvatarFile] = useState<File | null>(null)
  const [channelSearchQuery, setChannelSearchQuery] = useState("")
  const [channelSearchResults, setChannelSearchResults] = useState<ChannelSearchResult[]>([])
  const [discoveryUsers, setDiscoveryUsers] = useState<DiscoveryUserResult[]>([])
  const [discoveryBots, setDiscoveryBots] = useState<DiscoveryBotResult[]>([])
  const [isChannelSearchLoading, setIsChannelSearchLoading] = useState(false)
  const [openDialogMenuId, setOpenDialogMenuId] = useState<number | null>(null)
  const [showParticipants, setShowParticipants] = useState(false)
  const [showAddParticipants, setShowAddParticipants] = useState(false)
  const [selectedParticipantIdsToAdd, setSelectedParticipantIdsToAdd] = useState<number[]>([])
  const [isCreating, startCreating] = useTransition()
  const [isSending, startSending] = useTransition()
  const [isEditing, startEditing] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [isDeletingDialog, startDeletingDialog] = useTransition()
  const [isLeavingDialog, startLeavingDialog] = useTransition()
  const [isAddingParticipants, startAddingParticipants] = useTransition()
  const [isRemovingParticipant, startRemovingParticipant] = useTransition()
  const [isCreatingChannel, startCreatingChannel] = useTransition()
  const dialogsRef = useRef(initialDialogs)
  const activeDialogIdRef = useRef<number | null>(initialDialogId ?? null)
  const unreadDialogsCount = useMemo(
    () => dialogs.filter((dialog) => dialog.unreadCount > 0).length,
    [dialogs]
  )
  const orderedDialogs = useMemo(() => {
    return [...dialogs].sort((left, right) => {
      const leftHasUnread = left.unreadCount > 0 ? 1 : 0
      const rightHasUnread = right.unreadCount > 0 ? 1 : 0
      return rightHasUnread - leftHasUnread
    })
  }, [dialogs])

  const requestDialogResync = useCallback(() => {
    const now = Date.now()
    if (now - lastDialogResyncAtRef.current < 2000) {
      return
    }

    lastDialogResyncAtRef.current = now
    setMessagesReloadKey((value) => value + 1)
  }, [])

  const activeDialogId = useMemo(() => {
    if (selectedBotId) {
      return null
    }

    if (selectedDialogId && dialogs.some((item) => item.id === selectedDialogId)) {
      return selectedDialogId
    }
    return null
  }, [dialogs, selectedBotId, selectedDialogId])

  const selectedDialog = useMemo(
    () => dialogs.find((item) => item.id === activeDialogId) ?? null,
    [activeDialogId, dialogs]
  )
  const selectedBot = useMemo(
    () => bots.find((item) => item.id === selectedBotId) ?? null,
    [bots, selectedBotId]
  )
  const botMessages = useMemo(() => {
    if (!selectedBot) {
      return null
    }

    return botMessagesById[selectedBot.id] ?? []
  }, [botMessagesById, selectedBot])
  const selectedDialogAvailableContacts = useMemo(
    () => (selectedDialog ? getAvailableContactsForDialog(selectedDialog, contacts) : []),
    [contacts, selectedDialog]
  )
  const trimmedChannelSearchQuery = channelSearchQuery.trim()
  const newChannelAvatarPreviewUrl = useMemo(
    () => (newChannelAvatarFile ? URL.createObjectURL(newChannelAvatarFile) : null),
    [newChannelAvatarFile]
  )

  useEffect(() => {
    if (!newChannelAvatarPreviewUrl) {
      return
    }

    return () => {
      URL.revokeObjectURL(newChannelAvatarPreviewUrl)
    }
  }, [newChannelAvatarPreviewUrl])
  const isMessageListReady = selectedBot ? botMessages !== null : messages !== null

  function startDialogCall(media: "audio" | "video") {
    if (!activeDialogId) {
      return
    }

    callRequestNonceRef.current += 1
    setCallStartRequest({ media, nonce: callRequestNonceRef.current })
  }

  function openPublicProfile(userId: number) {
    if (userId === user.id) {
      location.assign("/")
      return
    }

    location.assign(`/people/${userId}`)
  }

  function resetComposer() {
    setMessageText("")
    setComposerAttachments([])
    setReplyingToMessage(null)
    resetComposerInputs()
    stopTyping()
  }

  function resetComposerInputs() {
    if (galleryInputRef.current) {
      galleryInputRef.current.value = ""
    }
    if (audioInputRef.current) {
      audioInputRef.current.value = ""
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const sendTypingState = useCallback((isTyping: boolean, dialogId: number | null) => {
    if (!dialogId) {
      return
    }

    void fetch(`/api/chats/${dialogId}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTyping }),
    }).catch(() => null)
  }, [])

  const stopTyping = useCallback(() => {
    if (typingResetTimerRef.current) {
      clearTimeout(typingResetTimerRef.current)
      typingResetTimerRef.current = null
    }

    if (!isTypingSentRef.current) {
      return
    }

    isTypingSentRef.current = false
    sendTypingState(false, activeDialogIdRef.current)
  }, [sendTypingState])

  const pingTyping = useCallback(() => {
    if (!activeDialogId || !messageText.trim()) {
      stopTyping()
      return
    }

    if (!isTypingSentRef.current) {
      isTypingSentRef.current = true
      sendTypingState(true, activeDialogId)
    }

    if (typingResetTimerRef.current) {
      clearTimeout(typingResetTimerRef.current)
    }

    typingResetTimerRef.current = setTimeout(() => {
      stopTyping()
    }, 2500)
  }, [activeDialogId, messageText, sendTypingState, stopTyping])

  function addAttachment(kind: MediaKind, file: File | null) {
    if (!file) {
      return
    }

    setComposerAttachments((prev) => [...prev, { kind, file }])
  }

  function addAttachments(kind: MediaKind, files: FileList | File[] | null | undefined) {
    if (!files) {
      return
    }

    const nextFiles = Array.from(files).filter((file) => file.size > 0)
    if (nextFiles.length === 0) {
      return
    }

    setComposerAttachments((prev) => [
      ...prev,
      ...nextFiles.map((file) => ({ kind, file })),
    ])
  }

  function stopActiveRecorderTracks() {
    for (const track of recordingStreamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    recordingStreamRef.current = null
  }

  function resetRecordingState() {
    mediaRecorderRef.current = null
    pendingRecordingKindRef.current = null
    discardPendingRecordingRef.current = false
    isSwitchingRecordingCameraRef.current = false
    setRecordingCameraFacing("user")
    setIsRecordingVoice(false)
    setIsRecordingVideoNote(false)
    stopActiveRecorderTracks()
  }

  async function startMediaRecording(kind: "VOICE" | "VIDEO_NOTE") {
    if (!activeDialogId || mediaRecorderRef.current) {
      return
    }

    if (typeof MediaRecorder === "undefined") {
      toast.error("Запись не поддерживается в этом браузере")
      return
    }

    const mimeType =
      kind === "VOICE"
        ? MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : "video/webm"

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "VOICE"
          ? { audio: true }
          : {
              audio: true,
              video: {
                facingMode: recordingCameraFacing,
                width: { ideal: 480 },
                height: { ideal: 480 },
              },
            }
      )

      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks: BlobPart[] = []

      mediaRecorderRef.current = recorder
      recordingStreamRef.current = stream
      pendingRecordingKindRef.current = kind
      discardPendingRecordingRef.current = false
      setIsRecordingVoice(kind === "VOICE")
      setIsRecordingVideoNote(kind === "VIDEO_NOTE")

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      recorder.onerror = () => {
        if (kind === "VIDEO_NOTE" && isSwitchingRecordingCameraRef.current) {
          return
        }

        resetRecordingState()
        toast.error(kind === "VOICE" ? "Не удалось записать голосовое" : "Не удалось записать кружок")
      }

      recorder.onstop = () => {
        isSwitchingRecordingCameraRef.current = false
        const nextKind = pendingRecordingKindRef.current
        const shouldDiscard = discardPendingRecordingRef.current
        const finalMimeType = recorder.mimeType || mimeType
        resetRecordingState()

        if (shouldDiscard || !nextKind || chunks.length === 0) {
          return
        }

        const nextFile = createRecordedFile(
          chunks,
          finalMimeType,
          nextKind === "VOICE" ? "voice-message" : "video-note"
        )
        addAttachment(nextKind, nextFile)
      }

      recorder.start()
    } catch {
      resetRecordingState()
      toast.error(kind === "VOICE" ? "Не удалось включить микрофон" : "Не удалось включить камеру")
    }
  }

  function stopMediaRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder) {
      return
    }

    if (recorder.state !== "inactive") {
      recorder.stop()
    } else {
      resetRecordingState()
    }
  }

  function cancelMediaRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder) {
      return
    }

    discardPendingRecordingRef.current = true

    if (recorder.state !== "inactive") {
      recorder.stop()
      return
    }

    resetRecordingState()
  }

  async function switchRecordingCamera() {
    if (!isRecordingVideoNote || !recordingStreamRef.current) {
      return
    }

    const nextFacing = recordingCameraFacing === "user" ? "environment" : "user"

    try {
      const currentStream = recordingStreamRef.current
      isSwitchingRecordingCameraRef.current = true
      const nextMedia = await switchCameraInMediaStream({
        currentStream,
        nextFacing,
        width: 480,
        height: 480,
        preserveAudio: true,
        enabled: true,
        stopCurrentTrack: false,
      })

      recordingStreamRef.current = currentStream
      setRecordingCameraFacing(nextMedia.facing)

      if (recordingPreviewRef.current) {
        recordingPreviewRef.current.srcObject = recordingStreamRef.current
        void recordingPreviewRef.current.play().catch(() => null)
      }

      window.setTimeout(() => {
        isSwitchingRecordingCameraRef.current = false
      }, 400)
    } catch {
      isSwitchingRecordingCameraRef.current = false
      toast.error("Не удалось переключить камеру")
    }
  }

  useEffect(() => {
    dialogsRef.current = dialogs
  }, [dialogs])

  useEffect(() => {
    if (!trimmedChannelSearchQuery) {
      setChannelSearchResults([])
      setDiscoveryUsers([])
      setDiscoveryBots([])
      setIsChannelSearchLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setIsChannelSearchLoading(true)

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/discovery/search?q=${encodeURIComponent(trimmedChannelSearchQuery)}`,
          { signal: controller.signal }
        )
        const data = await response.json().catch(() => null)

        if (!response.ok) {
          if (!cancelled) {
            setChannelSearchResults([])
            setDiscoveryUsers([])
            setDiscoveryBots([])
          }
          return
        }

        if (!cancelled) {
          setChannelSearchResults(
            Array.isArray(data?.channels) ? (data.channels as ChannelSearchResult[]) : []
          )
          setDiscoveryUsers(
            Array.isArray(data?.users) ? (data.users as DiscoveryUserResult[]) : []
          )
          setDiscoveryBots(
            Array.isArray(data?.bots) ? (data.bots as DiscoveryBotResult[]) : []
          )
        }
      } catch {
        if (!cancelled) {
          setChannelSearchResults([])
          setDiscoveryUsers([])
          setDiscoveryBots([])
        }
      } finally {
        if (!cancelled) {
          setIsChannelSearchLoading(false)
        }
      }
    }, 250)

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [trimmedChannelSearchQuery])

  useEffect(() => {
    activeDialogIdRef.current = activeDialogId
  }, [activeDialogId])

  useEffect(() => {
    return () => {
      stopTyping()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
      stopActiveRecorderTracks()
    }
  }, [stopTyping])

  useEffect(() => {
    pingTyping()
  }, [pingTyping])

  useEffect(() => {
    const preview = recordingPreviewRef.current
    if (!preview) {
      return
    }

    preview.srcObject = isRecordingVideoNote ? recordingStreamRef.current : null
    if (isRecordingVideoNote) {
      void preview.play().catch(() => null)
    }

    return () => {
      preview.srcObject = null
    }
  }, [isRecordingVideoNote])

  const handleDialogAccessLost = useCallback(
    (dialogId: number, reason: "deleted" | "removed") => {
      const hadDialog = dialogsRef.current.some((item) => item.id === dialogId)
      setDialogs((prev) => prev.filter((item) => item.id !== dialogId))

      if (!hadDialog) {
        return
      }

      if (activeDialogIdRef.current === dialogId) {
        setIsDialogView(false)
        setSelectedDialogId(null)
        setMessages([])
        setTypingUserIds([])
        setSseSince(0)
        setShowParticipants(false)
        setShowAddParticipants(false)
        setSelectedParticipantIdsToAdd([])
      }

      toast.error(tr(reason === "removed" ? "Вас удалили из чата" : "Чат удалён владельцем"))
    },
    [tr]
  )

  useEffect(() => {
    if (!isDialogView || !activeDialogId) {
      return
    }

    const controller = new AbortController()
    fetch(`/api/chats/${activeDialogId}/messages`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          if (response.status === 404) {
            const code = data?.code === "REMOVED_FROM_CHAT" ? "REMOVED_FROM_CHAT" : "CHAT_DELETED"
            const error = new Error(data?.message ?? "Не удалось получить сообщения")
            ;(error as Error & { code?: string }).code = code
            throw error
          }
          throw new Error(data?.message ?? "Не удалось получить сообщения")
        }
        return response.json()
      })
      .then((data: { messages: ChatMessage[] }) => {
        setMessages(data.messages)
        setSseSince(data.messages[data.messages.length - 1]?.id ?? 0)
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          const code = (error as Error & { code?: string }).code
          if (code === "CHAT_DELETED") {
            handleDialogAccessLost(activeDialogId, "deleted")
            return
          }

          if (code === "REMOVED_FROM_CHAT") {
            handleDialogAccessLost(activeDialogId, "removed")
            return
          }

          toast.error(error.message)
          setMessages([])
        }
      })

    return () => controller.abort()
  }, [activeDialogId, handleDialogAccessLost, isDialogView, messagesReloadKey])

  useEffect(() => {
    if (!isDialogView || !activeDialogId || !isMessageListReady) {
      return
    }

    const eventSource = new EventSource(`/api/chats/${activeDialogId}/events?since=${sseSince}`)
    eventSource.addEventListener("message", (event) => {
      const nextMessage = parseEventPayload<ChatMessage>(event)
      if (!nextMessage) {
        return
      }

      setMessages((prev) => {
        if (!prev) {
          return [nextMessage]
        }
        if (prev.some((item) => item.id === nextMessage.id)) {
          return prev
        }
        return [...prev, nextMessage]
      })
      setDialogs((prev) => {
        const updated = withUpdatedDialogMessage(prev, nextMessage)
        if (nextMessage.author.id === user.id || isDialogView) {
          return updated
        }

        return updated.map((dialog) =>
          dialog.id === nextMessage.dialogId
            ? { ...dialog, unreadCount: dialog.unreadCount + 1 }
            : dialog
        )
      })
    })

    eventSource.addEventListener("chat-error", (event) => {
      const payload = parseEventPayload<{ message?: string }>(event)
      eventSource.close()
      requestDialogResync()
      if (!messages?.length) {
        toast.error(payload?.message ?? "Ошибка обновления чата")
      }
    })

    eventSource.addEventListener("status", (event) => {
      const payload = parseEventPayload<{
        id: number
        status: ChatMessage["status"]
      }>(event)
      if (!payload) {
        return
      }

      setMessages((prev) =>
        prev
          ? prev.map((item) =>
              item.id === payload.id ? { ...item, status: payload.status } : item
            )
          : prev
      )
      setDialogs((prev) =>
        prev.map((dialog) =>
          dialog.id === activeDialogId && dialog.lastMessage?.id === payload.id
            ? { ...dialog, lastMessage: { ...dialog.lastMessage, status: payload.status } }
            : dialog
        )
      )
    })

    eventSource.addEventListener("typing", (event) => {
      const payload = parseEventPayload<{ userIds?: number[] }>(event)
      setTypingUserIds(Array.isArray(payload?.userIds) ? payload.userIds : [])
    })

    eventSource.addEventListener("chat-deleted", () => {
      handleDialogAccessLost(activeDialogId, "deleted")
      eventSource.close()
    })

    eventSource.addEventListener("chat-removed", () => {
      handleDialogAccessLost(activeDialogId, "removed")
      eventSource.close()
    })

    eventSource.onerror = () => {
      eventSource.close()
      requestDialogResync()
    }

    return () => eventSource.close()
  }, [
    activeDialogId,
    handleDialogAccessLost,
    isDialogView,
    isMessageListReady,
    messages,
    requestDialogResync,
    sseSince,
    user.id,
  ])

  useEffect(() => {
    if (!isDialogView || !activeDialogId) {
      return
    }

    void fetch(`/api/chats/${activeDialogId}/messages/read`, { method: "POST" }).catch(() => null)
  }, [activeDialogId, isDialogView])

  useEffect(() => {
    const eventSource = new EventSource("/api/chats/unread/events")

    eventSource.addEventListener("unread", (event) => {
      const payload = parseEventPayload<{
        dialogIds?: number[]
        presenceByUserId?: Record<string, { lastSeenAt: string | null; isOnline: boolean }>
        unreadByDialog?: Record<string, number>
      }>(event)
      if (!payload) {
        return
      }

      const unreadByDialog = payload.unreadByDialog ?? {}
      const presenceByUserId = payload.presenceByUserId ?? {}
      const hasDialogIds = Array.isArray(payload.dialogIds)
      const allowedDialogIds = new Set(payload.dialogIds ?? [])

      setDialogs((prev) =>
        prev
          .filter((dialog) => !hasDialogIds || allowedDialogIds.has(dialog.id))
          .map((dialog) => ({
            ...dialog,
            users: dialog.users.map((dialogUser) => {
              const presence = presenceByUserId[String(dialogUser.id)]
              return presence
                ? {
                    ...dialogUser,
                    lastSeenAt: presence.lastSeenAt,
                    isOnline: presence.isOnline,
                  }
                : dialogUser
            }),
            unreadCount: unreadByDialog[String(dialog.id)] ?? 0,
          }))
      )
    })

    eventSource.addEventListener("chat-deleted", (event) => {
      const payload = parseEventPayload<{ dialogId?: number }>(event)
      if (typeof payload?.dialogId === "number") {
        handleDialogAccessLost(payload.dialogId, "deleted")
      }
    })

    eventSource.addEventListener("chat-removed", (event) => {
      const payload = parseEventPayload<{ dialogId?: number }>(event)
      if (typeof payload?.dialogId === "number") {
        handleDialogAccessLost(payload.dialogId, "removed")
      }
    })

    eventSource.addEventListener("chat-error", () => {
      // Keep UI functional even if unread stream has temporary issues.
    })

    return () => eventSource.close()
  }, [handleDialogAccessLost])

  useEffect(() => {
    if (!isDialogView || !activeDialogId || !messages || messages.length === 0) {
      return
    }

    const unreadIncomingIds = messages
      .filter(
        (message) =>
          message.author.id !== user.id && normalizeMessageStatus(message.status) !== "READ"
      )
      .map((message) => message.id)

    if (unreadIncomingIds.length === 0) {
      return
    }

    void fetch(`/api/chats/${activeDialogId}/messages/read`, { method: "POST" })
      .then(async (response) => {
        if (!response.ok) {
          return
        }
        const data = (await response.json().catch(() => null)) as
          | { readMessageIds?: number[] }
          | null
        const readSet = new Set(data?.readMessageIds ?? [])
        if (readSet.size === 0) {
          return
        }

        setMessages((prev) =>
          prev
            ? prev.map((item) =>
                readSet.has(item.id) ? { ...item, status: "READ" } : item
              )
            : prev
        )
        setDialogs((prev) =>
          prev.map((dialog) =>
            dialog.id === activeDialogId
              ? {
                  ...dialog,
                  unreadCount: 0,
                  lastMessage:
                    dialog.lastMessage && readSet.has(dialog.lastMessage.id)
                      ? { ...dialog.lastMessage, status: "READ" }
                      : dialog.lastMessage,
                }
              : dialog
          )
        )
      })
      .catch(() => null)
  }, [activeDialogId, isDialogView, messages, user.id])

  useEffect(() => {
    if (!selectedBot || botMessagesById[selectedBot.id]) {
      return
    }

    setBotMessagesById((prev) => ({
      ...prev,
      [selectedBot.id]: createBotConversationSeed(selectedBot.config),
    }))
  }, [botMessagesById, selectedBot])

  useEffect(() => {
    if (!isMessageListReady || !isDialogView) {
      return
    }

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    })
  }, [activeDialogId, botMessages, isDialogView, isMessageListReady, messages, selectedBotId])

  function openDialog(dialogId: number) {
    stopTyping()
    setOpenDialogMenuId(null)
    setShowParticipants(false)
    setShowAddParticipants(false)
    setSelectedParticipantIdsToAdd([])
    setTypingUserIds([])
    setSelectedBotId(null)
    setDialogs((prev) =>
      prev.map((dialog) =>
        dialog.id === dialogId ? { ...dialog, unreadCount: 0 } : dialog
      )
    )
    setSelectedDialogId(dialogId)
    setMessages(null)
    setMessagesReloadKey((prev) => prev + 1)
    setSseSince(0)
    setIsDialogView(true)
    setShowCreateForm(false)
    setEditingMessageId(null)
    setEditingText("")
  }

  function openBot(botId: number) {
    const nextBot = bots.find((item) => item.id === botId)
    if (!nextBot) {
      return
    }

    stopTyping()
    setOpenDialogMenuId(null)
    setShowParticipants(false)
    setShowAddParticipants(false)
    setSelectedParticipantIdsToAdd([])
    setTypingUserIds([])
    setSelectedDialogId(null)
    setMessages(null)
    setEditingMessageId(null)
    setEditingText("")
    setSelectedBotId(botId)
    setIsDialogView(true)
    setShowCreateForm(false)
    setBotMessagesById((prev) =>
      prev[botId]
        ? prev
        : {
            ...prev,
            [botId]: createBotConversationSeed(nextBot.config),
          }
    )
  }

  function toggleContact(contactId: number) {
    setSelectedContactIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    )
  }

  function toggleParticipantToAdd(contactId: number) {
    setSelectedParticipantIdsToAdd((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    )
  }

  function createChat() {
    if (selectedContactIds.length === 0) {
      toast.error("Выберите хотя бы один контакт")
      return
    }

    const isGroupChat = selectedContactIds.length >= 2
    if (isGroupChat && !newChatTitle.trim()) {
      toast.error("Для группового чата укажите название")
      return
    }

    startCreating(async () => {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: selectedContactIds,
          title: newChatTitle.trim(),
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось создать чат")
        return
      }

      if (data?.existing && typeof data.dialogId === "number") {
        openDialog(data.dialogId)
        setShowCreateForm(false)
        setSelectedContactIds([])
        setNewChatTitle("")
        return
      }

      const dialog = data.dialog as ChatDialog
      setDialogs((prev) => [{ ...dialog, unreadCount: 0 }, ...prev])
      setSelectedContactIds([])
      setNewChatTitle("")
      openDialog(dialog.id)
      toast.success("Чат создан")
    })
  }

  function createChannelFromChats() {
    if (newChannelTitle.trim().length < 2) {
      toast.error("Укажите название канала")
      return
    }

    if (newChannelUsername.trim().length < 4) {
      toast.error("Укажите username канала")
      return
    }

    startCreatingChannel(async () => {
      const formData = new FormData()
      formData.set(
        "channel",
        JSON.stringify({
          title: newChannelTitle.trim(),
          username: newChannelUsername.trim(),
          description: newChannelDescription.trim(),
        })
      )

      if (newChannelAvatarFile) {
        formData.set("avatarFile", newChannelAvatarFile)
      }

      const response = await fetch("/api/channels", {
        method: "POST",
        body: formData,
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось создать канал")
        return
      }

      setChannels((prev) => [data.channel, ...prev])
      setNewChannelTitle("")
      setNewChannelUsername("")
      setNewChannelDescription("")
      setNewChannelAvatarFile(null)
      if (channelAvatarInputRef.current) {
        channelAvatarInputRef.current.value = ""
      }
      toast.success("Канал создан")
      location.assign(`/channels?channelId=${data.channel.id}`)
    })
  }

  function sendMessage() {
    if (!activeDialogId && !selectedBot) {
      return
    }

    const content = messageText.trim()
    if (!content && composerAttachments.length === 0) {
      return
    }

    if (selectedBot) {
      if (composerAttachments.length > 0) {
        toast.error("В чате с ботом пока доступны только текстовые сообщения")
        return
      }

      const userMessage = createBotConversationMessage("user", content)
      const botReply = createBotConversationMessage("bot", buildBotReply(selectedBot.config, content))

      setBotMessagesById((prev) => ({
        ...prev,
        [selectedBot.id]: [
          ...(prev[selectedBot.id] ?? createBotConversationSeed(selectedBot.config)),
          userMessage,
          botReply,
        ],
      }))
      resetComposer()
      return
    }

    const replyToMessageId = replyingToMessage?.id ?? null

    startSending(async () => {
      const body =
        composerAttachments.length > 0
          ? (() => {
              const formData = new FormData()
              formData.set("content", content)
              if (replyToMessageId) {
                formData.set("replyToMessageId", String(replyToMessageId))
              }
              for (const attachment of composerAttachments) {
                formData.append("attachmentKinds", attachment.kind)
                formData.append("attachments", attachment.file)
              }
              return formData
            })()
          : JSON.stringify({ content, replyToMessageId })

      const response = await fetch(`/api/chats/${activeDialogId}/messages`, {
        method: "POST",
        ...(body instanceof FormData
          ? { body }
          : {
              headers: { "Content-Type": "application/json" },
              body,
            }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось отправить сообщение")
        return
      }

      const nextMessage = data.message as ChatMessage
      resetComposer()
      setMessages((prev) => {
        if (!prev) {
          return [nextMessage]
        }
        if (prev.some((item) => item.id === nextMessage.id)) {
          return prev
        }
        return [...prev, nextMessage]
      })
      setDialogs((prev) => withUpdatedDialogMessage(prev, nextMessage))
    })
  }

  function beginEdit(message: ChatMessage) {
    setEditingMessageId(message.id)
    setEditingText(message.content)
  }

  function saveEdit(messageId: number) {
    if (!activeDialogId) {
      return
    }

    const content = editingText.trim()
    if (!content) {
      toast.error("Сообщение не может быть пустым")
      return
    }

    startEditing(async () => {
      const response = await fetch(`/api/chats/${activeDialogId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось изменить сообщение")
        return
      }

      const updated = data.message as ChatMessage
      setMessages((prev) =>
        prev ? prev.map((item) => (item.id === updated.id ? { ...item, content: updated.content } : item)) : prev
      )
      setDialogs((prev) =>
        prev.map((dialog) =>
            dialog.id === activeDialogId && dialog.lastMessage?.id === updated.id
              ? { ...dialog, lastMessage: { ...dialog.lastMessage, content: updated.content } }
              : dialog
        )
      )
      setEditingMessageId(null)
      setEditingText("")
    })
  }

  function removeMessage(messageId: number) {
    if (!activeDialogId) {
      return
    }

    startDeleting(async () => {
      const response = await fetch(`/api/chats/${activeDialogId}/messages/${messageId}`, {
        method: "DELETE",
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось удалить сообщение")
        return
      }

      setMessages((prev) => {
        if (!prev) {
          return prev
        }
        const next = prev.filter((item) => item.id !== messageId)
        const nextLast = next[next.length - 1] ?? null

        setDialogs((dialogsPrev) =>
          dialogsPrev.map((dialog) =>
            dialog.id === activeDialogId && dialog.lastMessage?.id === messageId
              ? { ...dialog, lastMessage: nextLast }
              : dialog
          )
        )

        return next
      })
      setEditingMessageId(null)
      setEditingText("")
    })
  }

  function toggleReaction(message: ChatMessage, emoji: string) {
    if (!activeDialogId) {
      return
    }

    setReactionPickerMessageId(null)
    const alreadyReacted = message.reactions?.some((item) => item.emoji === emoji && item.reactedByMe)
    const method = alreadyReacted ? "DELETE" : "POST"

    void (async () => {
      const response = await fetch(`/api/chats/${activeDialogId}/messages/${message.id}/reactions`, {
        method,
        ...(method === "POST"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) }
          : {}),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось поставить реакцию")
        return
      }

      setMessages((prev) =>
        prev
          ? prev.map((item) =>
              item.id === message.id ? { ...item, reactions: data.reactions as MessageReaction[] } : item
            )
          : prev
      )
    })()
  }

  function forwardMessage() {
    if (!forwardingMessage || !forwardTargetDialogId) {
      return
    }

    startForwarding(async () => {
      const response = await fetch(
        `/api/chats/${forwardingMessage.dialogId}/messages/${forwardingMessage.id}/forward`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetDialogId: forwardTargetDialogId }),
        }
      )

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось переслать сообщение")
        return
      }

      toast.success("Сообщение переслано")
      const nextMessage = data.message as ChatMessage
      setDialogs((prev) => withUpdatedDialogMessage(prev, nextMessage))
      if (activeDialogId === forwardTargetDialogId) {
        setMessages((prev) => {
          if (!prev) return [nextMessage]
          if (prev.some((item) => item.id === nextMessage.id)) return prev
          return [...prev, nextMessage]
        })
      }
      setForwardingMessage(null)
      setForwardTargetDialogId(null)
    })
  }

  function addPollOptionField() {
    setPollOptions((prev) => (prev.length >= 10 ? prev : [...prev, ""]))
  }

  function updatePollOptionField(index: number, value: string) {
    setPollOptions((prev) => prev.map((option, i) => (i === index ? value : option)))
  }

  function removePollOptionField(index: number) {
    setPollOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)))
  }

  function resetPollForm() {
    setShowPollForm(false)
    setPollQuestion("")
    setPollOptions(["", ""])
    setPollAllowMultiple(false)
  }

  function createPoll() {
    if (!activeDialogId) {
      return
    }

    const question = pollQuestion.trim()
    const options = pollOptions.map((option) => option.trim()).filter(Boolean)

    if (!question || options.length < 2) {
      toast.error("Укажите вопрос и минимум 2 варианта ответа")
      return
    }

    startCreatingPoll(async () => {
      const response = await fetch(`/api/chats/${activeDialogId}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, options, allowMultiple: pollAllowMultiple }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось создать опрос")
        return
      }

      const nextMessage = data.message as ChatMessage
      resetPollForm()
      setMessages((prev) => {
        if (!prev) return [nextMessage]
        if (prev.some((item) => item.id === nextMessage.id)) return prev
        return [...prev, nextMessage]
      })
      setDialogs((prev) => withUpdatedDialogMessage(prev, nextMessage))
    })
  }

  function votePoll(message: ChatMessage, optionId: number) {
    if (!activeDialogId || !message.poll) {
      return
    }

    const poll = message.poll
    const alreadyVoted = poll.options.find((option) => option.id === optionId)?.votedByMe
    if (alreadyVoted && !poll.allowMultiple) {
      return
    }

    const nextOptionIds = poll.allowMultiple
      ? alreadyVoted
        ? poll.options.filter((option) => option.votedByMe && option.id !== optionId).map((option) => option.id)
        : [...poll.options.filter((option) => option.votedByMe).map((option) => option.id), optionId]
      : [optionId]

    if (nextOptionIds.length === 0) {
      return
    }

    setVotingPollId(poll.id)
    void (async () => {
      const response = await fetch(`/api/chats/${activeDialogId}/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIds: nextOptionIds }),
      })

      const data = await response.json().catch(() => null)
      setVotingPollId(null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось проголосовать")
        return
      }

      setMessages((prev) =>
        prev
          ? prev.map((item) => (item.id === message.id ? { ...item, poll: data.poll as MessagePoll } : item))
          : prev
      )
    })()
  }

  function removeDialog(dialogId: number) {
    setOpenDialogMenuId(null)
    startDeletingDialog(async () => {
      const response = await fetch(`/api/chats/${dialogId}`, {
        method: "DELETE",
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось удалить чат")
        return
      }

      setDialogs((prev) => prev.filter((item) => item.id !== dialogId))
      if (activeDialogId === dialogId) {
        setIsDialogView(false)
        setSelectedDialogId(null)
        setMessages([])
        setSseSince(0)
        setShowParticipants(false)
      }
      toast.success("Чат удалён")
    })
  }

  function leaveDialog(dialogId: number) {
    setOpenDialogMenuId(null)
    startLeavingDialog(async () => {
      const response = await fetch(`/api/chats/${dialogId}/leave`, {
        method: "POST",
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось покинуть чат")
        return
      }

      setDialogs((prev) => prev.filter((item) => item.id !== dialogId))
      if (activeDialogId === dialogId) {
        setIsDialogView(false)
        setSelectedDialogId(null)
        setMessages([])
        setSseSince(0)
        setShowParticipants(false)
      }
      toast.success("Вы покинули чат")
    })
  }

  function addParticipants(dialogId: number) {
    if (selectedParticipantIdsToAdd.length === 0) {
      toast.error("Выберите хотя бы одного пользователя")
      return
    }

    startAddingParticipants(async () => {
      const response = await fetch(`/api/chats/${dialogId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds: selectedParticipantIdsToAdd }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось добавить участников")
        return
      }

      const nextMessage = data?.message as ChatMessage | undefined
      const users = Array.isArray(data?.users) ? (data.users as UserShort[]) : []

      setDialogs((prev) =>
        prev.map((dialog) =>
          dialog.id === dialogId
            ? {
                ...dialog,
                users: [...dialog.users, ...users],
                lastMessage: nextMessage ?? dialog.lastMessage,
              }
            : dialog
        )
      )

      if (nextMessage) {
        setMessages((prev) => {
          if (!prev) {
            return [nextMessage]
          }
          if (prev.some((item) => item.id === nextMessage.id)) {
            return prev
          }
          return [...prev, nextMessage]
        })
      }

      setShowParticipants(true)
      setShowAddParticipants(false)
      setSelectedParticipantIdsToAdd([])
      toast.success("Участники добавлены")
    })
  }

  function removeParticipant(dialogId: number, participantId: number) {
    startRemovingParticipant(async () => {
      const response = await fetch(`/api/chats/${dialogId}/participants`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: participantId }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось удалить участника")
        return
      }

      const nextMessage = data?.message as ChatMessage | undefined

      setDialogs((prev) =>
        prev.map((dialog) =>
          dialog.id === dialogId
            ? {
                ...dialog,
                users: dialog.users.filter((item) => item.id !== participantId),
                lastMessage: nextMessage ?? dialog.lastMessage,
              }
            : dialog
        )
      )

      if (nextMessage) {
        setMessages((prev) => {
          if (!prev) {
            return [nextMessage]
          }
          if (prev.some((item) => item.id === nextMessage.id)) {
            return prev
          }
          return [...prev, nextMessage]
        })
      }

      setSelectedParticipantIdsToAdd((prev) => prev.filter((id) => id !== participantId))
      toast.success("Участник удалён")
    })
  }

  const showListPanel = !isDialogView
  const showDialogPanel = isDialogView

  return (
    <main className="h-dvh overflow-hidden px-3 py-4 sm:px-6 sm:py-5">
      <header className="sticky top-0 z-20 shrink-0 rounded-[1.7rem] border border-white/50 bg-card/88 px-4 py-3 shadow-[0_20px_55px_-32px_rgba(15,23,42,0.48)] backdrop-blur-xl dark:border-white/8 sm:rounded-[2rem] sm:px-5 sm:py-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar
              firstName={user.firstName}
              lastName={user.lastName}
              avatarTone={user.avatarTone}
              avatarUrl={user.avatarUrl}
              className="size-14"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-lg font-semibold">{getDialogUserName(user)}</p>
                <CountryFlagBadge phone={user.phone} />
                <AccountStatusBadge
                  role={user.role}
                  email={user.email}
                  firstName={user.firstName}
                  lastName={user.lastName}
                  isBlocked={user.isBlocked}
                />
              </div>
              <p className="truncate text-sm text-muted-foreground">Личные и групповые диалоги</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PushToggle />
            <LanguageToggle />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto flex h-[calc(100dvh-144px)] w-full max-w-5xl min-h-0 py-3 pb-20 sm:h-[calc(100dvh-116px)] sm:py-4">
        <Card className="flex min-h-0 w-full flex-col border-border/70 bg-card/88 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.48)]">
          {showListPanel && (
            <CardHeader className="shrink-0 gap-3 border-b border-border/55 pb-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl font-semibold tracking-tight">{tr("Чаты")}</CardTitle>
                  <CardDescription>{tr("Общайтесь с пользователями из ваших контактов.")}</CardDescription>
                </div>
                <div className="space-y-1">
                  <Button
                    onClick={() => setShowCreateForm((prev) => !prev)}
                    disabled={contacts.length === 0}
                  >
                    {tr("Создать чат")}
                  </Button>
                  {contacts.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {tr("Чтобы создать чат, сначала добавьте контакты.")}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
          )}

          <CardContent
            className={`flex min-h-0 flex-1 flex-col pt-6 ${showDialogPanel ? "p-0 pt-0" : "space-y-4"}`}
          >
            {showListPanel && showCreateForm && contacts.length > 0 && (
              <div className="space-y-3 rounded-[1.6rem] border border-border/70 bg-background/78 p-4 shadow-sm">
                <p className="text-sm font-medium">Выберите пользователей для нового чата</p>
                <div className="grid max-h-[28dvh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {contacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(contact.id)}
                        onChange={() => toggleContact(contact.id)}
                      />
                      <span className="truncate">{getDialogUserName(contact)}</span>
                      <CountryFlagBadge phone={contact.phone} />
                    </label>
                  ))}
                </div>
                {selectedContactIds.length >= 2 && (
                  <Input
                    value={newChatTitle}
                    onChange={(event) => setNewChatTitle(event.target.value)}
                    placeholder="Название группового чата"
                  />
                )}
                <Button onClick={createChat} disabled={isCreating || selectedContactIds.length === 0}>
                  {isCreating ? "Создаём..." : "Создать"}
                </Button>
              </div>
            )}

            {showListPanel && (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-[1.75rem] border border-border/70 bg-background/74 p-2.5 shadow-sm">
                {orderedDialogs.length === 0 && bots.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/80 p-6 text-sm text-muted-foreground">
                    {tr("Чаты отсутствуют. Создайте новый чат с пользователем из контактов.")}
                  </div>
                )}
                {orderedDialogs.map((dialog) => (
                  <div key={dialog.id} className="flex items-start gap-2 rounded-[1.2rem] border border-transparent p-1">
                    <button
                      className="relative flex w-full items-start gap-3 rounded-[1.3rem] border border-border/60 bg-background/88 p-3.5 text-left transition-colors hover:bg-accent/45"
                      onClick={() => openDialog(dialog.id)}
                    >
                      {(() => {
                        const avatarUser = getDialogAvatarUser(dialog, user.id)
                        return avatarUser ? (
                          <UserAvatar
                            firstName={avatarUser.firstName}
                            lastName={avatarUser.lastName}
                            avatarTone={avatarUser.avatarTone}
                            avatarUrl={avatarUser.avatarUrl}
                            className="size-11 shrink-0"
                            textClassName="text-xs font-semibold"
                          />
                        ) : null
                      })()}
                      <div className="min-w-0 flex-1">
                      {dialog.unreadCount > 0 && (
                        <span className="absolute right-3 top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                          {dialog.unreadCount > 99 ? "99+" : dialog.unreadCount}
                        </span>
                      )}
                      <p className="truncate text-sm font-medium">
                        {getDialogDisplayTitle(dialog, user.id)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {dialog.lastMessage?.content ?? "Сообщений пока нет"}
                      </p>
                      </div>
                    </button>

                    {(canDeleteDialog(dialog, user.id) || canLeaveDialog(dialog, user.id)) && (
                      <div className="relative mt-2">
                        <button
                          type="button"
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/90 text-muted-foreground hover:bg-accent"
                          aria-label="Действия с чатом"
                          onClick={() =>
                            setOpenDialogMenuId((prev) => (prev === dialog.id ? null : dialog.id))
                          }
                        >
                          <EllipsisVerticalIcon className="size-4" />
                        </button>
                        {openDialogMenuId === dialog.id && (
                          <div className="absolute right-0 top-11 z-20 min-w-40 rounded-2xl border border-border bg-popover/96 p-1.5 shadow-xl backdrop-blur-xl">
                            {canLeaveDialog(dialog, user.id) && (
                              <button
                                type="button"
                                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => leaveDialog(dialog.id)}
                                disabled={isLeavingDialog}
                              >
                                Покинуть группу
                              </button>
                            )}
                            <button
                              type="button"
                              className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => removeDialog(dialog.id)}
                              disabled={isDeletingDialog}
                            >
                              Удалить чат
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {bots.length > 0 && (
                  <div className="space-y-2">
                    <div className="px-2 pt-1">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Боты
                      </p>
                    </div>
                    {bots.map((bot) => (
                      <div
                        key={`bot-dialog-${bot.id}`}
                        className="flex items-start gap-2 rounded-[1.2rem] border border-transparent p-1"
                      >
                        <button
                          type="button"
                          className="relative flex w-full items-start gap-3 rounded-[1.3rem] border border-border/60 bg-background/88 p-3.5 text-left transition-colors hover:bg-accent/45"
                          onClick={() => openBot(bot.id)}
                        >
                          <BotAvatar
                            avatarUrl={bot.avatarUrl}
                            alt={bot.name}
                            className="size-11 shrink-0"
                            iconClassName="size-5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{bot.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {bot.username ? `@${bot.username}` : bot.niche || "Открыть чат с ботом"}
                            </p>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-3 rounded-[1.2rem] border border-border/60 bg-background/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Создать канал</p>
                      <p className="text-xs text-muted-foreground">
                        Новый канал можно создать прямо из вкладки чатов.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 rounded-[1rem] border border-border/60 bg-background/70 p-3">
                      <UserAvatar
                        firstName={newChannelTitle.trim() || "Канал"}
                        lastName={null}
                        avatarUrl={newChannelAvatarPreviewUrl}
                        className="size-12 shrink-0"
                        textClassName="text-sm font-semibold"
                      />
                      <label className="flex-1 cursor-pointer">
                        <input
                          ref={channelAvatarInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="sr-only"
                          onChange={(event) =>
                            setNewChannelAvatarFile(event.target.files?.[0] ?? null)
                          }
                        />
                        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
                          <FileImageIcon className="size-4" />
                          {newChannelAvatarFile ? "Сменить аватар канала" : "Загрузить аватар канала"}
                        </span>
                      </label>
                      {newChannelAvatarFile ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setNewChannelAvatarFile(null)
                            if (channelAvatarInputRef.current) {
                              channelAvatarInputRef.current.value = ""
                            }
                          }}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                    <Input
                      value={newChannelTitle}
                      onChange={(event) => setNewChannelTitle(event.target.value)}
                      placeholder="Название канала"
                    />
                    <Input
                      value={newChannelUsername}
                      onChange={(event) => setNewChannelUsername(event.target.value)}
                      placeholder="@channel_username"
                      autoComplete="off"
                    />
                    <Input
                      value={newChannelDescription}
                      onChange={(event) => setNewChannelDescription(event.target.value)}
                      placeholder="Описание канала"
                    />
                    <Button
                      onClick={createChannelFromChats}
                      disabled={isCreatingChannel}
                      className="w-full"
                    >
                      {isCreatingChannel ? "Создаём канал..." : "Создать канал"}
                    </Button>
                  </div>
                </div>
                {channels.length > 0 && (
                  <div className="space-y-3 rounded-[1.2rem] border border-border/60 bg-background/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Каналы</p>
                        <p className="text-xs text-muted-foreground">
                          Всё собрано в одной вкладке рядом с диалогами.
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => location.assign("/bots")}>
                        Конструктор
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={channelSearchQuery}
                        onChange={(event) => setChannelSearchQuery(event.target.value)}
                        placeholder="Поиск пользователя, бота или канала"
                      />
                      {trimmedChannelSearchQuery ? (
                        <div className="space-y-2 rounded-[1rem] border border-border/60 bg-background/60 p-2">
                          <div className="flex items-center justify-between gap-2 px-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Результаты поиска
                            </p>
                            {isChannelSearchLoading ? (
                              <span className="text-xs text-muted-foreground">Ищем...</span>
                            ) : null}
                          </div>
                          {discoveryUsers.length > 0 ? (
                            <div className="space-y-2">
                              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                Пользователи
                              </p>
                              {discoveryUsers.map((foundUser) => (
                                <button
                                  key={`search-user-${foundUser.id}`}
                                  type="button"
                                  className="flex w-full items-start gap-3 rounded-[1rem] border border-border/60 bg-background/88 p-3 text-left transition-colors hover:bg-accent/45"
                                  onClick={() =>
                                    location.assign(
                                      buildEntityLink(
                                        foundUser.username,
                                        `/chats?contactId=${foundUser.id}`
                                      )
                                    )
                                  }
                                >
                                  <UserAvatar
                                    firstName={foundUser.firstName}
                                    lastName={foundUser.lastName}
                                    avatarTone={foundUser.avatarTone}
                                    avatarUrl={foundUser.avatarUrl}
                                    className="size-10 shrink-0"
                                  />
                                  <span className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {getDialogUserName(foundUser)}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {foundUser.username
                                        ? `@${foundUser.username}`
                                        : foundUser.phone || foundUser.email}
                                    </p>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                      {foundUser.isAlreadyContact
                                        ? "Уже в контактах"
                                        : "Можно написать без добавления в контакты"}
                                    </p>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {discoveryBots.length > 0 ? (
                            <div className="space-y-2">
                              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                Боты
                              </p>
                              {discoveryBots.map((bot) => (
                                <button
                                  key={`search-bot-${bot.id}`}
                                  type="button"
                                  className="flex w-full items-start gap-3 rounded-[1rem] border border-border/60 bg-background/88 p-3 text-left transition-colors hover:bg-accent/45"
                                  onClick={() =>
                                    location.assign(
                                      buildEntityLink(bot.username, `/chats?botId=${bot.id}`)
                                    )
                                  }
                                >
                                  <BotAvatar
                                    avatarUrl={bot.avatarUrl}
                                    alt={bot.name}
                                    className="size-10 shrink-0"
                                    iconClassName="size-4"
                                  />
                                  <span className="min-w-0">
                                    <p className="truncate text-sm font-medium">{bot.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {bot.username ? `@${bot.username}` : bot.niche || "Открыть чат с ботом"}
                                    </p>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {channelSearchResults.length > 0 ? (
                            <div className="space-y-2">
                              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                Каналы
                              </p>
                              {channelSearchResults.map((channel) => (
                              <button
                                key={`search-channel-${channel.id}`}
                                type="button"
                                className="flex w-full items-start gap-3 rounded-[1rem] border border-border/60 bg-background/88 p-3 text-left transition-colors hover:bg-accent/45"
                                onClick={() =>
                                  location.assign(
                                    buildEntityLink(
                                      channel.username,
                                      `/channels?channelId=${channel.id}`
                                    )
                                  )
                                }
                              >
                                <UserAvatar
                                  firstName={channel.title}
                                  lastName={null}
                                  avatarUrl={channel.avatarUrl}
                                  className="size-10 shrink-0"
                                />
                                  <span className="min-w-0">
                                    <p className="truncate text-sm font-medium"># {channel.title}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {channel.username
                                        ? `@${channel.username}`
                                        : channel.description || "Открыть канал"}
                                    </p>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                      {channel.joined
                                        ? `Вы уже внутри • ${channel.memberCount} участников`
                                        : `${channel.memberCount} участников`}
                                    </p>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : !isChannelSearchLoading &&
                            discoveryUsers.length === 0 &&
                            discoveryBots.length === 0 ? (
                            <p className="px-2 py-1 text-xs text-muted-foreground">
                              Ничего не найдено.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {channels.map((channel) => (
                      <button
                        key={`channel-${channel.id}`}
                        type="button"
                        className="flex w-full items-start gap-3 rounded-[1.1rem] border border-border/60 bg-background/88 p-3 text-left transition-colors hover:bg-accent/45"
                        onClick={() => location.assign(`/channels?channelId=${channel.id}`)}
                      >
                        <UserAvatar
                          firstName={channel.title}
                          lastName={null}
                          avatarUrl={channel.avatarUrl}
                          className="size-10 shrink-0"
                        />
                        <span className="min-w-0">
                          <p className="truncate text-sm font-medium"># {channel.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {channel.username
                              ? `@${channel.username}`
                              : channel.description || "Открыть канал"}
                          </p>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showDialogPanel && (
              <div className="flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-border/70 bg-background/68">
                <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/72 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {selectedDialog ? (
                      (() => {
                        const avatarUser = getDialogAvatarUser(selectedDialog, user.id)
                        return avatarUser ? (
                          <UserAvatar
                            firstName={avatarUser.firstName}
                            lastName={avatarUser.lastName}
                            avatarTone={avatarUser.avatarTone}
                            avatarUrl={avatarUser.avatarUrl}
                            className="size-11 shrink-0"
                            textClassName="text-xs font-semibold"
                          />
                        ) : null
                      })()
                    ) : selectedBot ? (
                      <BotAvatar className="size-11 shrink-0" iconClassName="size-5" />
                    ) : null}
                  <div className="min-w-0">
                    {selectedDialog ? (
                      <button
                        type="button"
                        className="truncate text-left text-sm font-semibold hover:text-primary"
                        onClick={() => {
                          const otherUser = getDirectDialogOtherUser(selectedDialog, user.id)
                          if (otherUser) {
                            openPublicProfile(otherUser.id)
                          }
                        }}
                      >
                        {getDialogDisplayTitle(selectedDialog, user.id)}
                      </button>
                    ) : selectedBot ? (
                      <button
                        type="button"
                        className="truncate text-left text-sm font-semibold hover:text-primary"
                        onClick={() => location.assign(`/bots?botId=${selectedBot.id}`)}
                      >
                        {selectedBot.name}
                      </button>
                    ) : (
                      <p className="truncate text-sm font-semibold">{tr("Выберите чат")}</p>
                    )}
                    {selectedDialog &&
                      (() => {
                        const otherUser = getDirectDialogOtherUser(selectedDialog, user.id)
                        const typingLabel = getTypingLabel(
                          selectedDialog,
                          user.id,
                          typingUserIds
                        )

                        if (typingLabel) {
                          return (
                            <p className="truncate text-xs text-primary">
                              {typingLabel}
                            </p>
                          )
                        }

                        if (otherUser) {
                          return (
                            <div className="text-xs text-muted-foreground">
                              <PresenceLabel user={otherUser} />
                            </div>
                          )
                        }

                        return (
                          <p className="truncate text-xs text-muted-foreground">
                            {getDialogMembersSubtitle(selectedDialog, user.id)}
                          </p>
                        )
                      })()}
                    {selectedBot ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedBot.username
                          ? `@${selectedBot.username}`
                          : selectedBot.niche || "Чат с ботом"}
                      </p>
                    ) : null}
                  </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedDialog ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startDialogCall("audio")}
                        >
                          <PhoneCallIcon className="size-4" />
                          Аудио
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startDialogCall("video")}
                        >
                          <VideoIcon className="size-4" />
                          Видео
                        </Button>
                      </>
                    ) : null}
                    {selectedDialog && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowParticipants((prev) => !prev)}
                      >
                        {showParticipants ? tr("Скрыть участников") : tr("Участники")}
                      </Button>
                    )}
                    {selectedDialog && canManageDialogParticipants(selectedDialog, user.id) && (
                      <Button
                        size="sm"
                        variant={showAddParticipants ? "secondary" : "outline"}
                        onClick={() => {
                          setShowParticipants(true)
                          setShowAddParticipants((prev) => !prev)
                          if (showAddParticipants) {
                            setSelectedParticipantIdsToAdd([])
                          }
                        }}
                      >
                        <UserPlusIcon className="size-4" />
                        Добавить участников
                      </Button>
                    )}
                    {selectedDialog &&
                      (canDeleteDialog(selectedDialog, user.id) ||
                        canLeaveDialog(selectedDialog, user.id)) && (
                        <div className="relative">
                          <button
                            type="button"
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/90 text-muted-foreground hover:bg-accent"
                            aria-label="Действия с чатом"
                            onClick={() =>
                              setOpenDialogMenuId((prev) =>
                                prev === selectedDialog.id ? null : selectedDialog.id
                              )
                            }
                          >
                            <EllipsisVerticalIcon className="size-4" />
                          </button>
                          {openDialogMenuId === selectedDialog.id && (
                            <div className="absolute right-0 top-11 z-20 min-w-52 rounded-2xl border border-border bg-popover/96 p-1.5 shadow-xl backdrop-blur-xl">
                              {selectedDialog && (
                                <button
                                  type="button"
                                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                                  onClick={() => {
                                    setOpenDialogMenuId(null)
                                    setShowParticipants(true)
                                    setShowAddParticipants((prev) => !prev)
                                  }}
                                >
                                  Добавить участников
                                </button>
                              )}
                              {canLeaveDialog(selectedDialog, user.id) && (
                                <button
                                  type="button"
                                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => leaveDialog(selectedDialog.id)}
                                  disabled={isLeavingDialog}
                                >
                                  Покинуть группу
                                </button>
                              )}
                              {canDeleteDialog(selectedDialog, user.id) && (
                                <button
                                  type="button"
                                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => removeDialog(selectedDialog.id)}
                                  disabled={isDeletingDialog}
                                >
                                  Удалить чат
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setIsDialogView(false)}
                    >
                      <ArrowLeftIcon className="size-4" />
                      {tr("Список")}
                    </Button>
                  </div>
                </div>
                {selectedDialog && showParticipants && (
                  <div className="max-h-[45dvh] shrink-0 overflow-y-auto border-b border-border/70 bg-muted/28 px-4 py-3">
                    <div className="space-y-2">
                      {canManageDialogParticipants(selectedDialog, user.id) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">Управление участниками</p>
                            <p className="text-xs text-muted-foreground">
                              Только админ чата может добавлять и удалять участников.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={showAddParticipants ? "secondary" : "outline"}
                            onClick={() => {
                              setShowAddParticipants((prev) => !prev)
                              if (showAddParticipants) {
                                setSelectedParticipantIdsToAdd([])
                              }
                            }}
                          >
                            {showAddParticipants ? "Скрыть форму" : "Добавить участников"}
                          </Button>
                        </div>
                      )}
                      {canManageDialogParticipants(selectedDialog, user.id) && showAddParticipants && (
                        <div className="space-y-3 rounded-[1.35rem] border border-border/70 bg-background/86 px-3 py-3">
                          <div>
                            <p className="text-sm font-medium">Добавить участников</p>
                            <p className="text-xs text-muted-foreground">
                              Доступны только пользователи из ваших контактов.
                            </p>
                          </div>
                          {selectedDialogAvailableContacts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Нет доступных контактов для добавления.
                            </p>
                          ) : (
                            <>
                              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                {selectedDialogAvailableContacts.map((contact) => (
                                  <label
                                    key={contact.id}
                                    className="flex cursor-pointer items-center gap-2 rounded-[1.1rem] border border-border/70 bg-background/80 p-2 text-sm"
                                  >
                                    <input
                                      type="checkbox"
                                      className="size-4 shrink-0 accent-primary"
                                      checked={selectedParticipantIdsToAdd.includes(contact.id)}
                                      onChange={() => toggleParticipantToAdd(contact.id)}
                                    />
                                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                                      <span className="truncate">{getDialogUserName(contact)}</span>
                                      <CountryFlagBadge phone={contact.phone} />
                                      <AccountStatusBadge
                                        role={contact.role}
                                        email={contact.email}
                                        firstName={contact.firstName}
                                        lastName={contact.lastName}
                                        isBlocked={contact.isBlocked}
                                      />
                                    </span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => addParticipants(selectedDialog.id)}
                                  disabled={
                                    isAddingParticipants || selectedParticipantIdsToAdd.length === 0
                                  }
                                >
                                  {isAddingParticipants ? "Добавляем..." : "Добавить"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setShowAddParticipants(false)
                                    setSelectedParticipantIdsToAdd([])
                                  }}
                                >
                                  Отмена
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <p className="text-xs font-medium text-muted-foreground">
                        Участники: {selectedDialog.users.length}
                      </p>
                      <div className="space-y-2 pr-1">
                        {selectedDialog.users.map((participant) => {
                          const isCurrentUser = participant.id === user.id
                          const isOwner = participant.id === selectedDialog.ownerId

                          return (
                            <div
                              key={participant.id}
                              className="rounded-[1.2rem] border border-border/70 bg-background/86 px-3 py-2.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      className="truncate text-left text-sm font-medium hover:text-primary"
                                      onClick={() =>
                                        isCurrentUser ? location.assign("/") : openPublicProfile(participant.id)
                                      }
                                    >
                                      {getDialogUserName(participant)}
                                      {isCurrentUser ? " (Вы)" : ""}
                                      {isOwner ? " • админ" : ""}
                                    </button>
                                    <CountryFlagBadge phone={participant.phone} />
                                    <AccountStatusBadge
                                      role={participant.role}
                                      email={participant.email}
                                      firstName={participant.firstName}
                                      lastName={participant.lastName}
                                      isBlocked={participant.isBlocked}
                                    />
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {participant.email}
                                  </p>
                                  <div className="text-xs text-muted-foreground">
                                    <PresenceLabel user={participant} />
                                  </div>
                                </div>
                                {canRemoveParticipant(selectedDialog, user.id, participant.id) && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={isRemovingParticipant}
                                    onClick={() => removeParticipant(selectedDialog.id, participant.id)}
                                  >
                                    Удалить
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {!activeDialogId && !selectedBot ? (
                    <p className="text-sm text-muted-foreground">Сначала выберите или создайте чат.</p>
                  ) : null}

                  {activeDialogId && messages === null ? (
                    <p className="text-sm text-muted-foreground">Загружаем сообщения...</p>
                  ) : null}

                  {selectedBot && botMessages !== null && botMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      История бота пуста. Напишите первое сообщение.
                    </p>
                  ) : null}

                  {activeDialogId && messages !== null && messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Сообщений пока нет. Напишите первое сообщение.
                    </p>
                  ) : null}

                  {selectedBot &&
                    botMessages?.map((message) => {
                      const mine = message.role === "user"

                      return (
                        <div
                          key={message.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`w-fit max-w-[85%] rounded-[1.35rem] px-3.5 py-2.5 text-sm shadow-sm ${
                              mine
                                ? "rounded-br-md bg-primary text-primary-foreground"
                                : "rounded-bl-md border border-white/45 bg-background/96 text-foreground dark:border-white/8"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            <p className="mt-1 text-[11px] opacity-75">
                              {mine ? "Вы" : selectedBot.name}
                              {" · "}
                              {formatTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      )
                    })}

                  {messages !== null &&
                    messages.map((message) => {
                      const mine = message.author.id === user.id
                      const isEditingMessage = editingMessageId === message.id

                      return (
                        <div
                          key={message.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div className="flex items-start gap-2">
                            {!mine ? (
                              <button
                                type="button"
                                className="mt-1 shrink-0"
                                onClick={() => openPublicProfile(message.author.id)}
                                aria-label={`Открыть профиль ${getDialogUserName(message.author)}`}
                              >
                                <UserAvatar
                                  firstName={message.author.firstName}
                                  lastName={message.author.lastName}
                                  avatarTone={message.author.avatarTone}
                                  avatarUrl={message.author.avatarUrl}
                                  className="size-9"
                                />
                              </button>
                            ) : null}
                            <div className="flex min-w-0 flex-col gap-1">
                              <div
                                className={`w-fit max-w-full rounded-[1.35rem] px-3.5 py-2.5 text-sm shadow-sm ${
                                  mine
                                    ? "rounded-br-md bg-primary text-primary-foreground"
                                    : "rounded-bl-md border border-white/45 bg-background/96 text-foreground dark:border-white/8"
                                }`}
                              >
                                {isEditingMessage ? (
                                  <div className="space-y-2">
                                    <Input
                                      value={editingText}
                                      onChange={(event) => setEditingText(event.target.value)}
                                      disabled={isEditing}
                                    />
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                      <Button
                                        size="sm"
                                        onClick={() => saveEdit(message.id)}
                                        disabled={isEditing}
                                      >
                                        {isEditing ? "Сохраняем..." : "Сохранить"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setEditingMessageId(null)
                                          setEditingText("")
                                        }}
                                      >
                                        Отмена
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {message.forwardedFrom ? (
                                      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium opacity-75">
                                        <ForwardIcon className="size-3" />
                                        Переслано от {message.forwardedFrom.authorName}
                                      </p>
                                    ) : null}
                                    {message.replyTo ? (
                                      <div className="mb-1.5 rounded-lg border-l-2 border-current/40 bg-black/5 px-2 py-1 text-xs opacity-90 dark:bg-white/10">
                                        <p className="font-medium">
                                          {getDialogUserName(message.replyTo.author)}
                                        </p>
                                        <p className="truncate">{message.replyTo.content}</p>
                                      </div>
                                    ) : null}
                                    {message.content ? (
                                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                    ) : null}
                                    <MessageAttachmentView attachment={message.attachment} compact />
                                    {message.poll ? (
                                      <div className="mt-1 space-y-2 rounded-xl border border-current/15 bg-black/5 p-2.5 dark:bg-white/8">
                                        <p className="flex items-center gap-1.5 text-sm font-medium">
                                          <BarChart3Icon className="size-4 shrink-0" />
                                          {message.poll.question}
                                        </p>
                                        <div className="space-y-1.5">
                                          {message.poll.options.map((option) => {
                                            const total = message.poll?.totalVotes ?? 0
                                            const percent =
                                              total > 0 ? Math.round((option.votesCount / total) * 100) : 0
                                            return (
                                              <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => votePoll(message, option.id)}
                                                disabled={votingPollId === message.poll?.id}
                                                className={`relative w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                                                  option.votedByMe ? "border-current" : "border-current/25"
                                                }`}
                                              >
                                                <span
                                                  className="absolute inset-y-0 left-0 bg-current/15"
                                                  style={{ width: `${percent}%` }}
                                                />
                                                <span className="relative flex items-center justify-between gap-2">
                                                  <span>
                                                    {option.text}
                                                    {option.votedByMe ? " ✓" : ""}
                                                  </span>
                                                  <span className="shrink-0 opacity-70">
                                                    {option.votesCount} · {percent}%
                                                  </span>
                                                </span>
                                              </button>
                                            )
                                          })}
                                        </div>
                                        <p className="text-[11px] opacity-70">
                                          {message.poll.totalVotes} голосов
                                          {message.poll.allowMultiple ? " · можно выбрать несколько" : ""}
                                        </p>
                                      </div>
                                    ) : null}
                                    <p className="mt-1 text-[11px] opacity-75">
                                      {!mine ? (
                                        <>
                                          <button
                                            type="button"
                                            className="hover:underline"
                                            onClick={() => openPublicProfile(message.author.id)}
                                          >
                                            {getDialogUserName(message.author)}
                                          </button>
                                          {" · "}
                                        </>
                                      ) : null}
                                      {formatTime(message.createdAt)}
                                      {mine && (
                                        <span className="ml-2 inline-flex align-middle">
                                          <MessageStatusIcon status={message.status} />
                                        </span>
                                      )}
                                    </p>
                                  </>
                                )}
                              </div>
                              {message.reactions && message.reactions.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {message.reactions.map((reaction) => (
                                    <button
                                      key={reaction.emoji}
                                      type="button"
                                      onClick={() => toggleReaction(message, reaction.emoji)}
                                      className={`rounded-full border px-2 py-0.5 text-xs ${
                                        reaction.reactedByMe
                                          ? "border-primary bg-primary/10"
                                          : "border-border/60 bg-background/60"
                                      }`}
                                    >
                                      {reaction.emoji} {reaction.count}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {!isEditingMessage && (
                              <div className="relative flex shrink-0 items-start gap-1">
                                {reactionPickerMessageId === message.id ? (
                                  <div className="absolute -top-11 right-0 z-10 flex gap-1 rounded-full border border-border/60 bg-background p-1.5 shadow-lg">
                                    {QUICK_REACTION_EMOJIS.map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        className="rounded-full p-1 text-base hover:bg-accent"
                                        onClick={() => toggleReaction(message, emoji)}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  className="inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/90 text-muted-foreground hover:bg-accent"
                                  aria-label="Добавить реакцию"
                                  onClick={() =>
                                    setReactionPickerMessageId((prev) =>
                                      prev === message.id ? null : message.id
                                    )
                                  }
                                >
                                  <SmilePlusIcon className="size-4" />
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    className="inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/90 text-muted-foreground hover:bg-accent"
                                    aria-label="Действия с сообщением"
                                  >
                                    <EllipsisVerticalIcon className="size-4" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem onClick={() => setReplyingToMessage(message)}>
                                      <ReplyIcon className="size-4" />
                                      Ответить
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setForwardingMessage(message)
                                        setForwardTargetDialogId(null)
                                      }}
                                    >
                                      <ForwardIcon className="size-4" />
                                      Переслать
                                    </DropdownMenuItem>
                                    {mine ? (
                                      <>
                                        <DropdownMenuItem onClick={() => beginEdit(message)}>
                                          Редактировать
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          variant="destructive"
                                          onClick={() => removeMessage(message.id)}
                                          disabled={isDeleting}
                                        >
                                          Удалить
                                        </DropdownMenuItem>
                                      </>
                                    ) : null}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="sticky bottom-0 shrink-0 border-t border-border/70 bg-background/88 p-3 backdrop-blur-xl">
                  <div className="space-y-2 rounded-[1.85rem] border border-white/45 bg-card/92 p-2.5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.65)] dark:border-white/8">
                    {replyingToMessage ? (
                      <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-accent/40 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            Ответ {getDialogUserName(replyingToMessage.author)}
                          </p>
                          <p className="truncate text-muted-foreground">{replyingToMessage.content}</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent"
                          aria-label="Отменить ответ"
                          onClick={() => setReplyingToMessage(null)}
                        >
                          <XIcon className="size-4" />
                        </button>
                      </div>
                    ) : null}
                    {showPollForm ? (
                      <div className="space-y-2 rounded-2xl border border-border/60 bg-accent/20 px-3 py-3 text-sm">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">Новый опрос</p>
                          <button
                            type="button"
                            className="rounded-full p-1 text-muted-foreground hover:bg-accent"
                            aria-label="Закрыть опрос"
                            onClick={resetPollForm}
                          >
                            <XIcon className="size-4" />
                          </button>
                        </div>
                        <Input
                          value={pollQuestion}
                          onChange={(event) => setPollQuestion(event.target.value)}
                          placeholder="Вопрос"
                        />
                        <div className="space-y-1.5">
                          {pollOptions.map((option, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <Input
                                value={option}
                                onChange={(event) => updatePollOptionField(index, event.target.value)}
                                placeholder={`Вариант ${index + 1}`}
                              />
                              {pollOptions.length > 2 ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent"
                                  aria-label="Удалить вариант"
                                  onClick={() => removePollOptionField(index)}
                                >
                                  <XIcon className="size-4" />
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={addPollOptionField}>
                            Добавить вариант
                          </Button>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={pollAllowMultiple}
                              onChange={(event) => setPollAllowMultiple(event.target.checked)}
                            />
                            Несколько вариантов
                          </label>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="w-full"
                          onClick={createPoll}
                          disabled={isCreatingPoll}
                        >
                          {isCreatingPoll ? "Создаём..." : "Создать опрос"}
                        </Button>
                      </div>
                    ) : null}
                    {isRecordingVoice || isRecordingVideoNote ? (
                      <div className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/8 px-3 py-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span>
                            {isRecordingVoice
                              ? "Идёт запись голосового..."
                              : "Идёт запись видеокружка..."}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={cancelMediaRecording}
                            >
                              <XIcon className="size-4" />
                              Отмена
                            </Button>
                            {isRecordingVideoNote ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void switchRecordingCamera()}
                              >
                                <RefreshCcwIcon className="size-4" />
                                Камера
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={stopMediaRecording}
                            >
                              <StopCircleIcon className="size-4" />
                              Стоп
                            </Button>
                          </div>
                        </div>
                        {isRecordingVideoNote ? (
                          <video
                            ref={recordingPreviewRef}
                            autoPlay
                            muted
                            playsInline
                            className="mx-auto size-40 rounded-full bg-black object-cover"
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {composerAttachments.length > 0 ? (
                      <div className="space-y-2 rounded-2xl border border-border/70 bg-background/78 px-3 py-2 text-sm">
                        {composerAttachments.map((attachment, index) => (
                          <div key={`${attachment.file.name}-${index}`} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate">{attachment.file.name}</span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() =>
                                setComposerAttachments((prev) => {
                                  const nextAttachments = prev.filter(
                                    (_, itemIndex) => itemIndex !== index
                                  )
                                  if (nextAttachments.length === 0) {
                                    resetComposerInputs()
                                  }
                                  return nextAttachments
                                })
                              }
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <input
                      ref={galleryInputRef}
                      type="file"
                      multiple
                      accept={GALLERY_ACCEPT}
                      className="hidden"
                      onChange={(event) => addAttachments("FILE", event.target.files)}
                    />
                    <input
                      ref={audioInputRef}
                      type="file"
                      multiple
                      accept={AUDIO_ACCEPT}
                      className="hidden"
                      onChange={(event) => addAttachments("FILE", event.target.files)}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={FILES_ACCEPT}
                      className="hidden"
                      onChange={(event) => addAttachments("FILE", event.target.files)}
                    />
                    <div className="flex items-end gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={!activeDialogId || Boolean(selectedBot) || isSending}
                        aria-label="Открыть галерею"
                      >
                        <FileImageIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => audioInputRef.current?.click()}
                        disabled={!activeDialogId || Boolean(selectedBot) || isSending}
                        aria-label="Выбрать аудио"
                      >
                        <MusicIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!activeDialogId || Boolean(selectedBot) || isSending}
                        aria-label="Выбрать файл"
                      >
                        <PaperclipIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => void startMediaRecording("VOICE")}
                        disabled={
                          !activeDialogId ||
                          Boolean(selectedBot) ||
                          isSending ||
                          isRecordingVoice ||
                          isRecordingVideoNote
                        }
                        aria-label="Записать голосовое"
                      >
                        <MicIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => void startMediaRecording("VIDEO_NOTE")}
                        disabled={
                          !activeDialogId ||
                          Boolean(selectedBot) ||
                          isSending ||
                          isRecordingVoice ||
                          isRecordingVideoNote
                        }
                        aria-label="Записать видеокружок"
                      >
                        <CircleIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setShowPollForm((prev) => !prev)}
                        disabled={!activeDialogId || Boolean(selectedBot) || isSending}
                        aria-label="Создать опрос"
                      >
                        <BarChart3Icon className="size-4" />
                      </Button>
                      <Input
                        value={messageText}
                        onChange={(event) => setMessageText(event.target.value)}
                        className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                        placeholder={selectedBot ? "Введите сообщение боту" : "Введите сообщение"}
                        disabled={
                          (!activeDialogId && !selectedBot) ||
                          isSending ||
                          isRecordingVoice ||
                          isRecordingVideoNote
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault()
                            sendMessage()
                          }
                        }}
                      />
                      <Button
                        className="min-w-0 rounded-full px-4 sm:min-w-28"
                        onClick={sendMessage}
                        disabled={
                          (!activeDialogId && !selectedBot) ||
                          isSending ||
                          isRecordingVoice ||
                          isRecordingVideoNote ||
                          (!messageText.trim() && composerAttachments.length === 0)
                        }
                      >
                        {isSending ? "Отправка..." : "Отправить"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <ChatCallOverlay
        currentUser={{
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          avatarTone: user.avatarTone,
          avatarUrl: user.avatarUrl,
        }}
        contacts={contacts.map((contact) => ({
          userId: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          avatarTone: contact.avatarTone,
          avatarUrl: contact.avatarUrl,
        }))}
        selectedDialogId={activeDialogId}
        autoAnswerIncoming={initialAnswerIncoming}
        autoAnswerCallId={initialAnswerCallId}
        startRequest={callStartRequest}
        dialogs={dialogs.map((dialog) => ({
          id: dialog.id,
          title: dialog.title,
          users: dialog.users.map((dialogUser) => ({
            userId: dialogUser.id,
            firstName: dialogUser.firstName,
            lastName: dialogUser.lastName,
            email: dialogUser.email,
            avatarTone: dialogUser.avatarTone,
            avatarUrl: dialogUser.avatarUrl,
          })),
        }))}
      />

      <BottomNav
        active={isDialogView ? undefined : "chats"}
        chatsBadgeCount={unreadDialogsCount}
        showServerTab={hasAdministrativeAccess(user.role)}
        onChatsClick={() => {
          setIsDialogView(false)
          setShowCreateForm(false)
          setEditingMessageId(null)
          setEditingText("")
        }}
      />

      {forwardingMessage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Переслать сообщение</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{forwardingMessage.content}</p>

            <div className="mt-4 max-h-64 space-y-1 overflow-y-auto">
              {dialogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет доступных чатов.</p>
              ) : (
                dialogs.map((dialog) => (
                  <button
                    key={dialog.id}
                    type="button"
                    onClick={() => setForwardTargetDialogId(dialog.id)}
                    className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${
                      forwardTargetDialogId === dialog.id
                        ? "border-primary bg-primary/10"
                        : "border-border/60 hover:bg-accent"
                    }`}
                  >
                    {getDialogDisplayTitle(dialog, user.id)}
                  </button>
                ))
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForwardingMessage(null)
                  setForwardTargetDialogId(null)
                }}
                disabled={isForwarding}
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={forwardMessage}
                disabled={isForwarding || !forwardTargetDialogId}
              >
                {isForwarding ? "Пересылаем..." : "Переслать"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

