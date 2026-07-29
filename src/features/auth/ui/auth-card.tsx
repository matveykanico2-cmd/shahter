"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  loginSchema,
  recoveryCodeSchema,
  recoveryPhoneSchema,
  registerSchema,
} from "@/features/auth/model/schemas"
import { PhoneInput } from "@/features/auth/ui/phone-input"
import { useI18n } from "@/features/i18n/model/i18n-provider"

type LoginForm = {
  email: string
  password: string
}

type RegisterForm = {
  email: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  username: string
  phone: string
  referrerId?: number
}

type RecoveryForm = {
  phone: string
  code: string
}

type FieldErrors = Record<string, string[] | undefined>

async function sendAuthRequest(path: string, payload: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)
  return { response, data }
}

function getFieldError(errors: FieldErrors, key: string) {
  return errors[key]?.[0]
}

export function AuthCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tr } = useI18n()
  const [isPending, startTransition] = useTransition()
  const [serverMessage, setServerMessage] = useState("")
  const [loginErrors, setLoginErrors] = useState<FieldErrors>({})
  const [registerErrors, setRegisterErrors] = useState<FieldErrors>({})
  const [recoveryErrors, setRecoveryErrors] = useState<FieldErrors>({})
  const [isRecoveryConfirmOpen, setIsRecoveryConfirmOpen] = useState(false)
  const [recoveryMessage, setRecoveryMessage] = useState("")
  const [isRecoveryCodeSent, setIsRecoveryCodeSent] = useState(false)

  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: "",
    password: "",
  })

  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    username: "",
    phone: "",
  })

  const [recoveryForm, setRecoveryForm] = useState<RecoveryForm>({
    phone: "",
    code: "",
  })

  const isLoginDisabled = useMemo(
    () => isPending || !loginForm.email || !loginForm.password,
    [isPending, loginForm.email, loginForm.password]
  )

  const isRegisterDisabled = useMemo(
    () =>
      isPending ||
      !registerForm.email ||
      !registerForm.password ||
      !registerForm.confirmPassword ||
      !registerForm.firstName ||
      !registerForm.username ||
      !registerForm.phone,
    [isPending, registerForm]
  )

  const referrerId = useMemo(() => {
    const refValue = searchParams.get("ref")
    const parsed = refValue ? Number(refValue) : NaN
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }, [searchParams])

  function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerMessage("")
    setLoginErrors({})
    setIsRecoveryConfirmOpen(false)
    setRecoveryErrors({})
    setRecoveryMessage("")

    const parsed = loginSchema.safeParse(loginForm)
    if (!parsed.success) {
      setLoginErrors(parsed.error.flatten().fieldErrors)
      return
    }

    startTransition(async () => {
      const { response, data } = await sendAuthRequest("/api/auth/login", parsed.data)
      if (!response.ok) {
        setLoginErrors((data?.fieldErrors ?? {}) as FieldErrors)
        setServerMessage(tr(data?.message ?? "Ошибка входа"))
        return
      }

      router.replace("/")
      router.refresh()
      toast.success(tr("Вход выполнен"))
    })
  }

  function requestRecoveryCode() {
    setRecoveryErrors({})
    setRecoveryMessage("")

    const parsed = recoveryPhoneSchema.safeParse(recoveryForm)
    if (!parsed.success) {
      setRecoveryErrors(parsed.error.flatten().fieldErrors)
      return
    }

    startTransition(async () => {
      const { response, data } = await sendAuthRequest("/api/auth/recover/request-code", parsed.data)
      if (!response.ok) {
        setRecoveryErrors((data?.fieldErrors ?? {}) as FieldErrors)
        setRecoveryMessage(tr(data?.message ?? "Ошибка восстановления аккаунта"))
        return
      }

      setIsRecoveryCodeSent(true)
      setRecoveryMessage(
        tr("Мы отправили 6-значный код на email, привязанный к этому номеру.")
      )
      toast.success(tr("Аккаунт восстановлен"))
    })
  }

  function recoverAccount() {
    setRecoveryErrors({})
    setRecoveryMessage("")

    const parsed = recoveryCodeSchema.safeParse(recoveryForm)
    if (!parsed.success) {
      setRecoveryErrors(parsed.error.flatten().fieldErrors)
      return
    }

    startTransition(async () => {
      const { response, data } = await sendAuthRequest("/api/auth/recover", parsed.data)
      if (!response.ok) {
        setRecoveryErrors((data?.fieldErrors ?? {}) as FieldErrors)
        setRecoveryMessage(tr(data?.message ?? "Ошибка восстановления аккаунта"))
        return
      }

      setIsRecoveryConfirmOpen(false)
      setIsRecoveryCodeSent(false)
      setRecoveryForm({ phone: "", code: "" })
      toast.success(tr("Аккаунт восстановлен"))
      router.replace("/")
      router.refresh()
    })
  }

  function submitRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerMessage("")
    setRegisterErrors({})

    const parsed = registerSchema.safeParse({
      ...registerForm,
      referrerId,
    })
    if (!parsed.success) {
      setRegisterErrors(parsed.error.flatten().fieldErrors)
      return
    }

    startTransition(async () => {
      const { response, data } = await sendAuthRequest("/api/auth/register", parsed.data)
      if (!response.ok) {
        setRegisterErrors((data?.fieldErrors ?? {}) as FieldErrors)
        setServerMessage(tr(data?.message ?? "Ошибка регистрации"))
        return
      }

      toast.success(tr("Регистрация завершена"))
      router.replace("/")
      router.refresh()
    })
  }

  return (
    <>
      <Card className="w-full max-w-xl border-border/80 shadow-xl shadow-black/5">
        <CardHeader>
          <CardTitle className="text-2xl">{tr("Авторизация")}</CardTitle>
          <CardDescription>
            {tr("Войдите в существующий аккаунт или создайте новый.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{tr("Вход")}</TabsTrigger>
              <TabsTrigger value="register">{tr("Регистрация")}</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4">
              <form className="space-y-4" onSubmit={submitLogin}>
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={loginForm.email}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  {getFieldError(loginErrors, "email") ? (
                    <p className="text-sm text-destructive">{getFieldError(loginErrors, "email")}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">{tr("Пароль")}</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                    autoComplete="current-password"
                  />
                  {getFieldError(loginErrors, "password") ? (
                    <p className="text-sm text-destructive">
                      {getFieldError(loginErrors, "password")}
                    </p>
                  ) : null}

                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0 text-sm"
                    onClick={() => {
                      setServerMessage("")
                      setLoginErrors({})
                      setRecoveryErrors({})
                      setRecoveryMessage("")
                      setRecoveryForm({ phone: "", code: "" })
                      setIsRecoveryCodeSent(false)
                      setIsRecoveryConfirmOpen(true)
                    }}
                    disabled={isPending}
                  >
                    {tr("Забыли пароль?")}
                  </Button>
                </div>

                <Button type="submit" className="w-full" disabled={isLoginDisabled}>
                  {isPending ? tr("Входим...") : tr("Войти")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="space-y-4">
              <form className="space-y-4" onSubmit={submitRegister}>
                {referrerId ? (
                  <div className="rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-foreground">
                    Регистрация по партнерской ссылке. При успешной активации пригласивший
                    пользователь получит звезды.
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="register-first-name">{tr("Имя")}</Label>
                    <Input
                      id="register-first-name"
                      value={registerForm.firstName}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, firstName: event.target.value }))
                      }
                      autoComplete="given-name"
                    />
                    {getFieldError(registerErrors, "firstName") ? (
                      <p className="text-sm text-destructive">
                        {getFieldError(registerErrors, "firstName")}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-last-name">{tr("Фамилия (необязательно)")}</Label>
                    <Input
                      id="register-last-name"
                      value={registerForm.lastName}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, lastName: event.target.value }))
                      }
                      autoComplete="family-name"
                      placeholder={tr("Можно оставить пустым")}
                    />
                    {getFieldError(registerErrors, "lastName") ? (
                      <p className="text-sm text-destructive">
                        {getFieldError(registerErrors, "lastName")}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    value={registerForm.email}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    autoComplete="email"
                  />
                  {getFieldError(registerErrors, "email") ? (
                    <p className="text-sm text-destructive">
                      {getFieldError(registerErrors, "email")}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-username">Username</Label>
                  <Input
                    id="register-username"
                    value={registerForm.username}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, username: event.target.value }))
                    }
                    autoComplete="username"
                    placeholder="my_username"
                  />
                  {getFieldError(registerErrors, "username") ? (
                    <p className="text-sm text-destructive">
                      {getFieldError(registerErrors, "username")}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-phone">{tr("Телефон")}</Label>
                  <PhoneInput
                    id="register-phone"
                    value={registerForm.phone}
                    onChange={(phone) => setRegisterForm((prev) => ({ ...prev, phone }))}
                    placeholder="+7..."
                  />
                  {getFieldError(registerErrors, "phone") ? (
                    <p className="text-sm text-destructive">
                      {getFieldError(registerErrors, "phone")}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="register-password">{tr("Пароль")}</Label>
                    <Input
                      id="register-password"
                      type="password"
                      value={registerForm.password}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      autoComplete="new-password"
                    />
                    {getFieldError(registerErrors, "password") ? (
                      <p className="text-sm text-destructive">
                        {getFieldError(registerErrors, "password")}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password">
                      {tr("Подтверждение пароля")}
                    </Label>
                    <Input
                      id="register-confirm-password"
                      type="password"
                      value={registerForm.confirmPassword}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                      autoComplete="new-password"
                    />
                    {getFieldError(registerErrors, "confirmPassword") ? (
                      <p className="text-sm text-destructive">
                        {getFieldError(registerErrors, "confirmPassword")}
                      </p>
                    ) : null}
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isRegisterDisabled}>
                  {isPending ? tr("Регистрируем...") : tr("Зарегистрироваться")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {serverMessage ? <p className="mt-4 text-sm text-destructive">{serverMessage}</p> : null}
        </CardContent>
      </Card>

      {isRecoveryConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-xl font-semibold">Восстановить доступ?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Укажите номер телефона, который привязан к аккаунту. После восстановления
              контакты, черный список и все чаты будут очищены.
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="recovery-phone">Указанный номер телефона</Label>
                <PhoneInput
                  id="recovery-phone"
                  value={recoveryForm.phone}
                  onChange={(phone) => setRecoveryForm((prev) => ({ ...prev, phone }))}
                />
                {getFieldError(recoveryErrors, "phone") ? (
                  <p className="text-sm text-destructive">
                    {getFieldError(recoveryErrors, "phone")}
                  </p>
                ) : null}
              </div>

              {isRecoveryCodeSent ? (
                <div className="space-y-2">
                  <Label htmlFor="recovery-code">Код подтверждения</Label>
                  <Input
                    id="recovery-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={recoveryForm.code}
                    onChange={(event) =>
                      setRecoveryForm((prev) => ({ ...prev, code: event.target.value }))
                    }
                  />
                  {getFieldError(recoveryErrors, "code") ? (
                    <p className="text-sm text-destructive">{getFieldError(recoveryErrors, "code")}</p>
                  ) : null}
                </div>
              ) : null}

              <p className="text-sm text-muted-foreground">
                {tr("После подтверждения контакты, чёрный список и все чаты будут очищены.")}
              </p>

              {recoveryMessage ? (
                <p className="text-sm text-muted-foreground">{recoveryMessage}</p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsRecoveryConfirmOpen(false)
                  setRecoveryErrors({})
                  setRecoveryMessage("")
                  setIsRecoveryCodeSent(false)
                }}
                disabled={isPending}
              >
                {tr("Нет")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={isRecoveryCodeSent ? recoverAccount : requestRecoveryCode}
                disabled={isPending}
              >
                {isPending
                  ? isRecoveryCodeSent
                    ? tr("\u0421\u0431\u0440\u0430\u0441\u044b\u0432\u0430\u0435\u043c...")
                    : tr("\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c \u043a\u043e\u0434...")
                  : isRecoveryCodeSent
                    ? "\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c"
                    : tr("\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
