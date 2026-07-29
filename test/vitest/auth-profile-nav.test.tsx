import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { routerMock, searchParamsMock, toastMock } from "../vitest.setup"

vi.mock("@/features/theme/ui/theme-toggle", () => ({ ThemeToggle: () => <div>ThemeToggle</div> }))
vi.mock("@/features/auth/ui/logout-button", () => ({ LogoutButton: () => <div>LogoutButton</div> }))
vi.mock("@/features/navigation/ui/bottom-nav", () => ({
  BottomNav: ({ active }: { active?: string }) => <div>BottomNav:{active ?? "none"}</div>,
}))

import { AuthCard } from "@/features/auth/ui/auth-card"
import { ProfileHome } from "@/features/profile/ui/profile-home"

function getSubmitButtons() {
  return screen
    .getAllByRole("button")
    .filter((button) => button.getAttribute("type") === "submit")
}

describe("auth/profile/navigation components", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn())
    searchParamsMock.delete("ref")
  })

  test("logout button loads and triggers logout flow", async () => {
    const mod = await vi.importActual<typeof import("@/features/auth/ui/logout-button")>(
      "@/features/auth/ui/logout-button"
    )
    ;(fetch as any).mockResolvedValueOnce({ ok: true })

    render(<mod.LogoutButton />)
    const button = await screen.findByRole("button")
    fireEvent.click(button)

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    expect(routerMock.replace).toHaveBeenCalledWith("/auth")
    expect(routerMock.refresh).toHaveBeenCalled()
  })

  test("auth card validates, submits login and register flows", async () => {
    const user = userEvent.setup()
    ;(fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Ошибка регистрации", fieldErrors: { email: ["duplicate"] } }),
      })

    render(<AuthCard />)
    await user.type(screen.getByLabelText("Email"), "user@example.com")
    await user.type(screen.getByLabelText(/Пароль/), "password123")
    await user.click(screen.getByRole("button", { name: /Войти/ }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    expect(routerMock.replace).toHaveBeenCalledWith("/")

    await user.click(screen.getByRole("tab", { name: /Регистрация/ }))
    await user.type(screen.getByLabelText(/Имя/), "Ivan")
    await user.type(screen.getByLabelText(/Фамилия \(необязательно\)/), "Petrov")
    await user.type(screen.getByLabelText("Email"), "user@example.com")
    await user.type(screen.getByLabelText("Username"), "ivan_test")
    await user.type(screen.getByLabelText(/Телефон/), "12345678")
    await user.type(screen.getByLabelText(/^Пароль$/), "password123")
    await user.type(screen.getByLabelText(/Подтверждение пароля/), "password123")
    await user.click(screen.getByRole("button", { name: /Зарегистрироваться/ }))

    await screen.findByText("Ошибка регистрации")
    expect(screen.getByText("duplicate")).toBeInTheDocument()
  })

  test("auth card opens recovery confirmation and recovers account", async () => {
    const user = userEvent.setup()
    searchParamsMock.set("ref", "42")
    ;(fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 1 } }) })

    render(<AuthCard />)
    await user.click(screen.getByRole("button", { name: /Забыли пароль\?/ }))
    expect(screen.getByText(/Восстановить доступ\?/)).toBeInTheDocument()
    expect(screen.getByText(/контакты, чёрный список и все чаты будут очищены/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Указанный номер телефона/), "12345678")
    await user.click(screen.getByRole("button", { name: /Продолжить/ }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/recover/request-code",
        expect.objectContaining({ method: "POST" })
      )
    )
    await user.type(screen.getByLabelText(/Код подтверждения/), "123456")
    await user.click(screen.getByRole("button", { name: /Восстановить/ }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/recover",
        expect.objectContaining({ method: "POST" })
      )
    )
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    expect(routerMock.replace).toHaveBeenCalledWith("/")
    expect(routerMock.refresh).toHaveBeenCalled()
  })

  test("bottom nav handles external badge and event source badge", async () => {
    const { BottomNav: ActualBottomNav } = await vi.importActual<
      typeof import("@/features/navigation/ui/bottom-nav")
    >("@/features/navigation/ui/bottom-nav")
    const close = vi.fn()

    class MockEventSource {
      addEventListener = vi.fn((event: string, handler: (payload: MessageEvent) => void) => {
        if (event === "unread") {
          handler({ data: JSON.stringify({ dialogsWithUnread: 3 }) } as MessageEvent)
        }
      })
      close = close
      constructor(url: string) {
        void url
      }
    }

    vi.stubGlobal("EventSource", MockEventSource as any)

    const { rerender } = render(<ActualBottomNav />)
    expect(await screen.findByText("3")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Чаты/ }))
    expect(routerMock.push).toHaveBeenCalledWith("/chats")

    const onChatsClick = vi.fn()
    rerender(<ActualBottomNav active="contacts" chatsBadgeCount={101} onChatsClick={onChatsClick} />)
    expect(screen.getByText("99+")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Чаты/ }))
    expect(onChatsClick).toHaveBeenCalled()
  })

  test("profile home validates save and delete flows", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    ;(fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: "Не удалось сохранить профиль",
          fieldErrors: { email: ["bad"] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            email: "new@example.com",
            firstName: "New",
            lastName: "Name",
            username: "ivan_test",
            phone: "99999999",
            avatarTone: null,
            avatarUrl: null,
            profileVisibility: "everyone",
            showEmailInProfile: true,
            showPhoneInProfile: true,
            showGiftsInProfile: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: "Текущий пароль введён неверно",
          fieldErrors: { currentPassword: ["bad-password"] },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

    render(
      <ProfileHome
        user={{
          id: 1,
          email: "user@example.com",
          firstName: "Ivan",
          lastName: null,
          username: "ivan_test",
          phone: "12345678",
          role: "user",
          profileVisibility: "everyone",
          showEmailInProfile: true,
          showPhoneInProfile: true,
          showGiftsInProfile: true,
        }}
      />
    )

    await user.clear(screen.getByLabelText(/Имя/))
    await user.type(screen.getByLabelText(/Имя/), "A")
    await user.click(getSubmitButtons()[0])
    expect(await screen.findByText(/Имя должно быть не короче 2 символов/)).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/Имя/))
    await user.type(screen.getByLabelText(/Имя/), "Ivan")
    await user.clear(screen.getByLabelText("Email"))
    await user.type(screen.getByLabelText("Email"), "new@example.com")
    await user.click(getSubmitButtons()[0])
    expect(await screen.findByText("bad")).toBeInTheDocument()

    await waitFor(() => expect(getSubmitButtons()[0]).toBeEnabled())
    await user.click(getSubmitButtons()[0])
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())

    await user.type(screen.getByLabelText(/Текущий пароль/), "password123")
    await user.type(screen.getByLabelText(/Новый пароль/), "newpassword123")
    await user.type(screen.getByLabelText(/Подтверждение нового пароля/), "newpassword123")
    await user.click(getSubmitButtons()[1])
    expect(await screen.findByText("bad-password")).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/Текущий пароль/))
    await user.type(screen.getByLabelText(/Текущий пароль/), "password123")
    await user.clear(screen.getByLabelText(/Новый пароль/))
    await user.type(screen.getByLabelText(/Новый пароль/), "newpassword123")
    await user.clear(screen.getByLabelText(/Подтверждение нового пароля/))
    await user.type(screen.getByLabelText(/Подтверждение нового пароля/), "newpassword123")
    await user.click(getSubmitButtons()[1])
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())

    await user.click(screen.getByRole("button", { name: /Удалить аккаунт/ }))
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    expect(routerMock.replace).toHaveBeenCalledWith("/auth")
  }, 15000)

  test("partner program copies personal referral link", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(
      <ProfileHome
        user={{
          id: 42,
          email: "user@example.com",
          firstName: "Ivan",
          lastName: null,
          username: "ivan_test",
          phone: "12345678",
          role: "user",
          profileVisibility: "everyone",
          showEmailInProfile: true,
          showPhoneInProfile: true,
          showGiftsInProfile: true,
        }}
      />
    )

    expect(screen.getByText("https://shalter.ru/auth?ref=42")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Скопировать ссылку" }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://shalter.ru/auth?ref=42"))
    expect(toastMock.success).toHaveBeenCalled()
  })
})
