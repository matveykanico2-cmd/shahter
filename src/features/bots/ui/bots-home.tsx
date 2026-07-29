"use client"

import {
  BotIcon,
  CopyIcon,
  FileImageIcon,
  LayoutTemplateIcon,
  MessageCircleIcon,
  SendIcon,
  ShieldIcon,
  SparklesIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"
import { useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  LANGUAGE_DOCS,
  LANGUAGE_NAME,
} from "@/features/bots/lib/language-docs"
import {
  type BotChatMessage,
  type BotConfig,
  buildBotReply,
  compileBotScript,
  createBotConfigFromScript,
  createInitialBotMessages,
} from "@/features/bots/lib/runtime"
import { BotCodeEditor } from "@/features/bots/ui/bot-code-editor"
import { BottomNav } from "@/features/navigation/ui/bottom-nav"
import { hasAdministrativeAccess } from "@/shared/lib/auth/roles"
import { BotAvatar } from "@/shared/ui/bot-avatar"

type BotUser = {
  id: number
  email: string
  firstName: string
  lastName: string | null
  role: string
  avatarTone?: string | null
}

type PublishedBot = {
  id: number
  name: string
  username?: string
  niche: string | null
  audience: "client" | "user"
  avatarUrl?: string | null
  isBlocked?: boolean
  publishedAt: string
  config: BotConfig
  ownerId?: number
  ownerName?: string
  isMine?: boolean
}

type BuilderWorkspace = "studio" | "showcase"

export type BotsHomeProps = {
  user: BotUser
  publishedBots?: PublishedBot[]
  initialSelectedBotId?: number | null
}

const audienceLabels: Record<PublishedBot["audience"], string> = {
  client: "Клиенты",
  user: "Пользователи",
}

const starterScript = `from shalter import ShalterBot

bot = ShalterBot(
    name="Новый бот",
    niche="Поддержка и продажи",
    goal="Быстро понимать запрос и вести пользователя к следующему шагу.",
    tone="Спокойный, точный, дружелюбный.",
)

bot.greeting("""
Привет! Я бот внутри Shalter. Напиши, что тебе нужно, и я помогу.
""")

bot.guard("""
Не придумывай цены, сроки и юридические обещания без подтверждения.
""")

bot.hears(["привет", "здравствуйте", "hello"], """
Привет! Я на связи. Могу подсказать по продукту, заявке или следующему действию.
""")

bot.rule_contains(["цена", "стоимость", "тариф"], """
Стоимость зависит от задачи. Напиши, что именно нужно, и я сориентирую по формату.
""")

bot.rule_contains(["заявка", "менеджер", "контакт"], """
Оставь контакт и коротко опиши задачу. Если нужно, я передам диалог человеку.
""")

bot.matches(r"(ошибка|не работает|bug)", """
Похоже на проблему или баг. Опиши, что именно сломалось, и добавь шаги воспроизведения.
""", flags="i")

bot.handoff("""
Если вопрос нестандартный, связан с оплатой или конфликтной ситуацией, передай диалог человеку.
""")

bot.default("""
Опиши задачу чуть подробнее, и я подберу для тебя следующий шаг.
""")`

function createUserMessage(content: string): BotChatMessage {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content,
  }
}

function createBotMessage(content: string): BotChatMessage {
  return {
    id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "bot",
    content,
  }
}

function getRuleCount(config: BotConfig) {
  if (config.script) {
    return compileBotScript(config.script).rules.length
  }

  return config.flow.length
}

function buildBotUsernameSeed(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  return normalized.slice(0, 32)
}

const showcaseIdeas = [
  {
    title: "Лендинг услуги",
    text: "Яркая первая секция, выгоды в три экрана и сценарий захвата заявки без тяжёлого текста.",
  },
  {
    title: "Микро-магазин",
    text: "Карточки, быстрый CTA, доверительные маркеры и чистый путь от просмотра до оплаты.",
  },
  {
    title: "Портфолио-страница",
    text: "Крупные кейсы, ритмичная типографика и аккуратное раскрытие результатов проекта.",
  },
]

const showcaseSteps = [
  "Выберите настроение страницы: спокойный бренд, продажа, журнал или витрина продукта.",
  "Соберите структуру: hero, оффер, блоки доверия, тарифы, FAQ и финальный CTA.",
  "Привяжите сценарий бота, чтобы страница не просто рассказывала, а вела пользователя дальше.",
]

function BuilderShowcase({
  previewName,
  previewGoal,
}: {
  previewName: string
  previewGoal: string
}) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92))] text-slate-50">
        <CardContent className="grid gap-6 px-5 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-7 lg:py-7">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-200/90">
              <SparklesIcon className="size-3.5" />
              New Tab
            </div>
            <div className="space-y-3">
              <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Красивая витрина для конструктора сайтов внутри studio
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Этот режим показывает, как оформить будущий сайт визуально: крупный оффер, понятная
                композиция, блоки доверия и мягкая связка с ботом.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ShowcaseStat label="Тон" value="смелый и чистый" />
              <ShowcaseStat label="Фокус" value="конверсия + стиль" />
              <ShowcaseStat label="Сценарий" value="сайт -> бот -> диалог" />
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-white/8 p-4 shadow-[0_24px_60px_-40px_rgba(16,185,129,0.7)] backdrop-blur">
            <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{previewName}</p>
                  <p className="mt-1 text-xs text-slate-400">Концепт страницы для запуска</p>
                </div>
                <WandSparklesIcon className="size-5 text-emerald-300" />
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-white/6 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Hero idea</p>
                  <p className="mt-2 text-sm text-slate-100">
                    Крупный заголовок, подзаголовок на 2 строки и одна доминирующая кнопка.
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-400/10 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Goal</p>
                  <p className="mt-2 text-sm text-emerald-50">{previewGoal}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-16 rounded-2xl bg-white/6" />
                  <div className="h-16 rounded-2xl bg-white/6" />
                  <div className="h-16 rounded-2xl bg-white/6" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutTemplateIcon className="size-4" />
              Идеи для новой вкладки
            </CardTitle>
            <CardDescription>
              Быстрые направления, которые хорошо выглядят как внутри конструктора, так и на готовой странице.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {showcaseIdeas.map((idea) => (
              <div
                key={idea.title}
                className="rounded-[1.3rem] border border-border/70 bg-linear-to-br from-background via-background to-muted/30 p-4"
              >
                <p className="font-medium">{idea.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{idea.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Как это выглядит красиво</CardTitle>
            <CardDescription>
              Принцип оформления вкладки, чтобы она ощущалась отдельным продуктовым режимом.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {showcaseSteps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-[1.2rem] border border-border/70 bg-muted/20 p-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{step}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ShowcaseStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  )
}

export function BotsHome({
  user,
  publishedBots = [],
  initialSelectedBotId = null,
}: BotsHomeProps) {
  const [username, setUsername] = useState("")
  const [audience, setAudience] = useState<PublishedBot["audience"]>("client")
  const [script, setScript] = useState(LANGUAGE_DOCS[LANGUAGE_DOCS.length - 1]?.code ?? starterScript)
  const [botName, setBotName] = useState("Новый бот")
  const [items, setItems] = useState<PublishedBot[]>(publishedBots)
  const [selectedBotId, setSelectedBotId] = useState<number | null>(
    initialSelectedBotId && publishedBots.some((bot) => bot.id === initialSelectedBotId)
      ? initialSelectedBotId
      : publishedBots[0]?.id ?? null
  )
  const [selectedDocSectionId, setSelectedDocSectionId] = useState<string>(
    LANGUAGE_DOCS[0]?.id ?? "spec"
  )
  const [workspace, setWorkspace] = useState<BuilderWorkspace>("studio")
  const [botDraft, setBotDraft] = useState("")
  const [publishAvatarFile, setPublishAvatarFile] = useState<File | null>(null)
  const [botMessagesById, setBotMessagesById] = useState<Record<number, BotChatMessage[]>>({})
  const [isPublishing, startPublishing] = useTransition()
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null)
  const [isUpdatingId, setIsUpdatingId] = useState<number | null>(null)
  const botAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarTargetBotId, setAvatarTargetBotId] = useState<number | null>(null)

  const normalizedUsername = username.trim().toLowerCase()
  const generatedUsername = buildBotUsernameSeed(botName)
  const effectiveUsername =
    normalizedUsername.length >= 4 ? normalizedUsername : generatedUsername
  const scriptProgram = useMemo(() => compileBotScript(script), [script])
  const derivedPreviewConfig = useMemo(
    () => createBotConfigFromScript(script, effectiveUsername),
    [effectiveUsername, script]
  )
  const previewConfig = useMemo(
    () => ({
      ...derivedPreviewConfig,
      name: botName.trim() || derivedPreviewConfig.name || "Новый бот",
    }),
    [botName, derivedPreviewConfig]
  )
  const selectedBot = items.find((item) => item.id === selectedBotId) ?? items[0] ?? null
  const selectedDocSection =
    LANGUAGE_DOCS.find((section) => section.id === selectedDocSectionId) ?? LANGUAGE_DOCS[0]

  function getBotById(botId: number) {
    return items.find((item) => item.id === botId) ?? null
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(previewConfig, null, 2))
      toast.success("Конфиг бота скопирован")
    } catch {
      toast.error("Не удалось скопировать конфиг")
    }
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script)
      toast.success("Код бота скопирован")
    } catch {
      toast.error("Не удалось скопировать код")
    }
  }

  function publishBot() {
    startPublishing(async () => {
      const payload = {
        audience,
        config: previewConfig,
      }
      const requestBody =
        publishAvatarFile === null
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          : (() => {
              const formData = new FormData()
              formData.set("payload", JSON.stringify(payload))
              formData.set("avatarFile", publishAvatarFile)
              return { body: formData }
            })()

      const response = await fetch("/api/bots", {
        method: "POST",
        ...requestBody,
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.message ?? "Не удалось опубликовать бота")
        return
      }

      const nextBot = data.bot as PublishedBot
      setItems((prev) => [nextBot, ...prev])
      setSelectedBotId(nextBot.id)
      setBotMessagesById((prev) => ({
        ...prev,
        [nextBot.id]: createInitialBotMessages(nextBot.config),
      }))
      toast.success("Бот опубликован")
    })
  }

  function removePublication(botId: number) {
    setIsDeletingId(botId)
    void fetch(`/api/bots/${botId}`, { method: "DELETE" })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          toast.error(data?.message ?? "Не удалось удалить бота")
          return
        }

        setItems((prev) => {
          const nextItems = prev.filter((item) => item.id !== botId)
          setSelectedBotId((current) => (current === botId ? nextItems[0]?.id ?? null : current))
          return nextItems
        })
        setBotMessagesById((prev) => {
          const next = { ...prev }
          delete next[botId]
          return next
        })
        toast.success("Бот удалён")
      })
      .catch(() => {
        toast.error("Не удалось удалить бота")
      })
      .finally(() => {
        setIsDeletingId(null)
      })
  }

  function updatePublication(
    botId: number,
    options: {
      isBlocked?: boolean
      avatarFile?: File | null
      removeAvatar?: boolean
      successMessage: string
    }
  ) {
    const currentBot = getBotById(botId)
    if (!currentBot) {
      return
    }

    setIsUpdatingId(botId)

    const formData = new FormData()
    formData.set("isBlocked", String(options.isBlocked ?? currentBot.isBlocked ?? false))
    formData.set("removeAvatar", String(options.removeAvatar ?? false))
    if (options.avatarFile) {
      formData.set("avatarFile", options.avatarFile)
    }

    void fetch(`/api/bots/${botId}`, {
      method: "PATCH",
      body: formData,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          toast.error(data?.message ?? "Не удалось обновить бота")
          return
        }

        const updatedBot = data.bot as PublishedBot
        setItems((prev) => prev.map((item) => (item.id === botId ? { ...item, ...updatedBot } : item)))
        toast.success(options.successMessage)
      })
      .catch(() => {
        toast.error("Не удалось обновить бота")
      })
      .finally(() => {
        setIsUpdatingId(null)
      })
  }

  function triggerAvatarUpload(botId: number) {
    setAvatarTargetBotId(botId)
    botAvatarInputRef.current?.click()
  }

  function openBot(botId: number) {
    setSelectedBotId(botId)
    location.assign(`/chats?botId=${botId}`)
  }

  function sendMessageToBot() {
    if (!selectedBot) {
      return
    }

    const content = botDraft.trim()
    if (!content) {
      return
    }

    const userMessage = createUserMessage(content)
    const botReply = createBotMessage(buildBotReply(selectedBot.config, content))

    setBotMessagesById((prev) => ({
      ...prev,
      [selectedBot.id]: [
        ...(prev[selectedBot.id] ?? createInitialBotMessages(selectedBot.config)),
        userMessage,
        botReply,
      ],
    }))
    setBotDraft("")
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>{LANGUAGE_NAME} Studio</CardTitle>
            <CardDescription>
              {user.firstName}, справа от редактора теперь находится полная документация нового
              универсального языка. Telegram рассматривается как суперсила стандартной библиотеки,
              а не как отдельный внешний фреймворк.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4 xl:grid-cols-[0.92fr_1.18fr_1fr]">
            <div className="xl:col-span-3 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={workspace === "studio" ? "default" : "outline"}
                  onClick={() => setWorkspace("studio")}
                >
                  <BotIcon className="size-4" />
                  Конструктор
                </Button>
                <Button
                  type="button"
                  variant={workspace === "showcase" ? "default" : "outline"}
                  onClick={() => setWorkspace("showcase")}
                >
                  <SparklesIcon className="size-4" />
                  Новая вкладка
                </Button>
              </div>

              {workspace === "showcase" ? (
                <BuilderShowcase previewName={previewConfig.name} previewGoal={previewConfig.goal} />
              ) : null}
            </div>

            <div className={workspace === "showcase" ? "hidden" : "space-y-4"}>
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Публикация</CardTitle>
                  <CardDescription>
                    Username и аудитория задаются отдельно, остальное бот берёт из текущего
                    рабочего скрипта.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="bot-name">
                      Имя бота
                    </label>
                    <Input
                      id="bot-name"
                      value={botName}
                      onChange={(event) => setBotName(event.target.value)}
                      placeholder="Sales Copilot"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="bot-username">
                      Username
                    </label>
                    <Input
                      id="bot-username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="my_bot"
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      @username, 4-32 символа: a-z, 0-9 и _
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Аудитория публикации</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={audience === "client" ? "default" : "outline"}
                        onClick={() => setAudience("client")}
                      >
                        Клиенты
                      </Button>
                      <Button
                        type="button"
                        variant={audience === "user" ? "default" : "outline"}
                        onClick={() => setAudience("user")}
                      >
                        Пользователи
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-sm font-medium">Аватар бота</p>
                    <div className="flex items-center gap-3">
                      <BotAvatar
                        alt={previewConfig.name}
                        className="size-14 shrink-0"
                        iconClassName="size-6"
                      />
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="sr-only"
                          onChange={(event) => setPublishAvatarFile(event.target.files?.[0] ?? null)}
                        />
                        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
                          <FileImageIcon className="size-4" />
                          {publishAvatarFile ? "Сменить аватар" : "Загрузить аватар"}
                        </span>
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {publishAvatarFile ? publishAvatarFile.name : "PNG, JPG, WEBP или GIF"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm">
                    <p className="font-medium">Концепция языка</p>
                    <p className="mt-2 text-muted-foreground">
                      {LANGUAGE_NAME} теперь выглядит как компактный C#-подобный DSL: знакомый по
                      `new ShalterBot(...)`, именованным аргументам через `:` и методам в PascalCase.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={copyScript}>
                      <CopyIcon className="size-4" />
                      Скопировать код
                    </Button>
                    <Button type="button" variant="outline" onClick={copyConfig}>
                      <CopyIcon className="size-4" />
                      Скопировать конфиг
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Превью программы</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">{previewConfig.name}</p>
                    {normalizedUsername ? (
                      <p className="text-muted-foreground">@{normalizedUsername}</p>
                    ) : null}
                    <p className="text-muted-foreground">
                      {previewConfig.niche || "Без указанной ниши"}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Правил</p>
                    <p className="text-muted-foreground">{scriptProgram.rules.length}</p>
                  </div>
                  <div>
                    <p className="font-medium">Цель</p>
                    <p className="text-muted-foreground">{previewConfig.goal}</p>
                  </div>
                  <Button
                    type="button"
                    onClick={publishBot}
                    disabled={
                      isPublishing ||
                      effectiveUsername.length < 4 ||
                      scriptProgram.errors.length > 0 ||
                      previewConfig.name.trim().length < 2
                    }
                  >
                    {isPublishing ? "Публикуем..." : "Опубликовать"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className={workspace === "showcase" ? "hidden" : "space-y-4"}>
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Встроенный редактор</CardTitle>
                  <CardDescription>
                    Слева рабочий код конструктора, справа документация по целевому дизайну языка
                    и меню ключевых функций.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <BotCodeEditor value={script} onChange={setScript} />
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm">
                    <p className="font-medium">Шпаргалка концепта</p>
                    <div className="mt-2 space-y-1 text-muted-foreground">
                      <p>
                        <code>using Shalter;</code>, <code>var bot = new ShalterBot(...);</code>
                      </p>
                      <p>
                        <code>bot.Greeting(...);</code>, <code>bot.Guard(...);</code>
                      </p>
                      <p>
                        <code>bot.OnText(new[] &lbrace; &quot;price&quot; &rbrace;, ...);</code>
                      </p>
                      <p>
                        <code>bot.OnRegex(@&quot;(bug|error)&quot;, ..., flags: &quot;i&quot;);</code>
                      </p>
                    </div>
                  </div>
                  {scriptProgram.errors.length > 0 ? (
                    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                      {scriptProgram.errors.map((error, index) => (
                        <p key={`${error}-${index}`}>{error}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                      Текущий скрипт разобран успешно. Архитектурная документация языка доступна
                      справа от редактора.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className={workspace === "showcase" ? "hidden" : "space-y-4"}>
              <Card className="border-border/70 xl:sticky xl:top-4">
                <CardHeader>
                  <CardTitle className="text-base">{LANGUAGE_NAME}: документация</CardTitle>
                  <CardDescription>
                    Меню функций и разделов языка закреплено справа от редактора.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGE_DOCS.map((section) => (
                      <Button
                        key={section.id}
                        type="button"
                        size="sm"
                        variant={selectedDocSectionId === section.id ? "default" : "outline"}
                        onClick={() => setSelectedDocSectionId(section.id)}
                      >
                        {section.title}
                      </Button>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-sm font-medium">{selectedDocSection.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {selectedDocSection.summary}
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {selectedDocSection.bullets.map((bullet) => (
                        <p key={bullet}>• {bullet}</p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-background/85 p-4">
                    <p className="text-sm font-medium">Меню функций</p>
                    <div className="mt-3 space-y-3">
                      {(selectedDocSection.entries ?? []).map((entry) => (
                        <div
                          key={entry.label}
                          className="rounded-xl border border-border/60 bg-muted/20 p-3"
                        >
                          <p className="font-mono text-xs font-medium">{entry.label}</p>
                          {entry.signature ? (
                            <p className="mt-1 font-mono text-xs text-primary">
                              {entry.signature}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm text-muted-foreground">
                            {entry.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedDocSection.code ? (
                    <div className="rounded-2xl border border-border/70 bg-[#0b1220] p-4">
                      <p className="mb-3 text-sm font-medium text-slate-100">Пример</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6 text-slate-200">
                        {selectedDocSection.code}
                      </pre>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className={workspace === "showcase" ? "hidden" : "xl:col-span-3 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]"}>
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Опубликованные боты</CardTitle>
                  <CardDescription>
                    Конструктор и список ботов сохранены, но документация языка теперь вынесена в
                    отдельную колонку справа.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Публикаций пока нет.</p>
                  ) : (
                    items.map((bot) => (
                      <div
                        key={bot.id}
                        onClick={() => setSelectedBotId(bot.id)}
                        className={`cursor-pointer rounded-2xl border p-3 transition ${
                          selectedBotId === bot.id ? "border-primary bg-primary/5" : "border-border/70"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <BotAvatar
                            avatarUrl={bot.avatarUrl}
                            alt={bot.name}
                            className="size-12 shrink-0"
                            iconClassName="size-5"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">{bot.name}</p>
                              {bot.isMine ? (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  my bot
                                </span>
                              ) : null}
                              {bot.isBlocked ? (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                  blocked
                                </span>
                              ) : null}
                            </div>
                            {bot.username ? (
                              <p className="truncate text-xs text-muted-foreground">
                                @{bot.username}
                              </p>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              {audienceLabels[bot.audience]}
                              {bot.niche ? ` · ${bot.niche}` : ""}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isDeletingId === bot.id}
                            onClick={() => removePublication(bot.id)}
                          >
                            {isDeletingId === bot.id ? "Удаляем..." : "Удалить"}
                          </Button>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={Boolean(bot.isBlocked)}
                            onClick={() => openBot(bot.id)}
                          >
                            <MessageCircleIcon className="size-4" />
                            Открыть
                          </Button>
                          <Button type="button" size="sm" variant="secondary">
                            <BotIcon className="size-4" />
                            {getRuleCount(bot.config)} правил
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Быстрый тест бота</CardTitle>
                  <CardDescription>
                    {selectedBot
                      ? `Проверьте ответы бота ${selectedBot.name} прямо в конструкторе.`
                      : "Опубликуйте бота или выберите его из списка."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedBot ? (
                    <>
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-3 text-sm">
                        <p className="font-medium">{`Тестовый чат с ботом ${selectedBot.name}`}</p>
                      </div>

                      {selectedBot.isMine ? (
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <BotAvatar
                                avatarUrl={selectedBot.avatarUrl}
                                alt={selectedBot.name}
                                className="size-12 shrink-0"
                                iconClassName="size-5"
                              />
                              <div>
                                <p className="text-sm font-medium">{selectedBot.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {selectedBot.isBlocked ? "Бот заблокирован" : "Бот активен"}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isUpdatingId === selectedBot.id}
                                onClick={() => triggerAvatarUpload(selectedBot.id)}
                              >
                                <FileImageIcon className="size-4" />
                                {selectedBot.avatarUrl ? "Сменить аватар" : "Добавить аватар"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isUpdatingId === selectedBot.id}
                                onClick={() =>
                                  updatePublication(selectedBot.id, {
                                    isBlocked: !selectedBot.isBlocked,
                                    successMessage: selectedBot.isBlocked ? "Бот разблокирован" : "Бот заблокирован",
                                  })
                                }
                              >
                                <ShieldIcon className="size-4" />
                                {selectedBot.isBlocked ? "Разблокировать" : "Заблокировать"}
                              </Button>
                              {selectedBot.avatarUrl ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isUpdatingId === selectedBot.id}
                                  onClick={() =>
                                    updatePublication(selectedBot.id, {
                                      removeAvatar: true,
                                      successMessage: "Аватар бота удалён",
                                    })
                                  }
                                >
                                  <Trash2Icon className="size-4" />
                                  РЈР±СЂР°С‚СЊ Р°РІР°С‚Р°СЂ
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <input
                            ref={botAvatarInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null
                              const botId = avatarTargetBotId
                              event.currentTarget.value = ""
                              if (!file || !botId) {
                                return
                              }

                              updatePublication(botId, {
                                avatarFile: file,
                                successMessage: "Аватар бота обновлён",
                              })
                            }}
                          />
                        </div>
                      ) : null}

                      <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-muted/20 p-3">
                        {(botMessagesById[selectedBot.id] ??
                          createInitialBotMessages(selectedBot.config)).map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${
                              message.role === "user" ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                                message.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "border border-border/70 bg-background"
                              }`}
                            >
                              {message.content}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-2xl border border-border/70 p-3">
                        <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>Роль: {audienceLabels[selectedBot.audience]}</span>
                          <span>Правил: {getRuleCount(selectedBot.config)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={botDraft}
                            onChange={(event) => setBotDraft(event.target.value)}
                            placeholder="Введите сообщение для бота"
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                sendMessageToBot()
                              }
                            }}
                          />
                          <Button
                            type="button"
                            onClick={sendMessageToBot}
                            disabled={!botDraft.trim()}
                          >
                            <SendIcon className="size-4" />
                            Отправить
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      После публикации бот появится здесь и его можно будет быстро проверить в
                      тестовом диалоге.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </section>

      <BottomNav active="bots" showServerTab={hasAdministrativeAccess(user.role)} />
    </main>
  )
}
