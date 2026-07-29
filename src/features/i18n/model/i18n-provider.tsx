"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"

type ResolvedLanguage = "ru" | "en"
type LanguagePreference = "system" | ResolvedLanguage

type I18nContextValue = {
  language: ResolvedLanguage
  languagePreference: LanguagePreference
  setLanguage: (language: LanguagePreference) => void
  tr: (text: string) => string
}

const STORAGE_KEY = "language"

const RAW_EN_TRANSLATIONS: Record<string, string> = {
  "Системный язык": "System language",
  "Сервер": "Server",
  "Русский": "Russian",
  "Английский": "English",
  "Переключить язык": "Switch language",
  "Переключить тему": "Switch theme",
  "Светлая": "Light",
  "Тёмная": "Dark",
  "Системная": "System",
  "Не удалось завершить сессию": "Failed to end the session",
  "Вы вышли из аккаунта": "You have logged out",
  "Выходим": "Logging out",
  "Выйти": "Log out",
  "Настройки": "Settings",
  "Контакты": "Contacts",
  "Чаты": "Chats",
  "Каналы": "Channels",
  "Владелец мессенджера": "Messenger owner",
  "Бизнес аккаунт": "Business account",
  "Аккаунт заблокирован": "Account blocked",
  "Администратор": "Administrator",
  "Премиум": "Premium",
  "Разработчик": "Developer",
  "Технический разработчик": "Technical developer",
  "Админ": "Admin",
  "Пользователь": "User",
  "Загрузка контактов...": "Loading contacts...",
  "Загрузка чатов...": "Loading chats...",
  "Авторизация": "Authorization",
  "Войдите в существующий аккаунт или создайте новый.": "Sign in to an existing account or create a new one.",
  "Вход": "Login",
  "Регистрация": "Register",
  "Пароль": "Password",
  "Забыли пароль?": "Forgot password?",
  "Входим...": "Signing in...",
  "Войти": "Sign in",
  "Имя": "First name",
  "Фамилия (необязательно)": "Last name (optional)",
  "Можно оставить пустым": "You can leave it empty",
  "Телефон": "Phone",
  "Подтверждение": "Verification",
  "Подтверждение пароля": "Confirm password",
  "Регистрируем...": "Registering...",
  "Зарегистрироваться": "Create account",
  "Сбросить аккаунт?": "Reset account?",
  "Сначала отправьте код подтверждения на почту, затем введите его здесь.": "First send a confirmation code to your email, then enter it here.",
  "Email для восстановления": "Recovery email",
  "Отправляем...": "Sending...",
  "Отправить код": "Send code",
  "Код из письма": "Code from email",
  "После подтверждения контакты, чёрный список и все чаты будут очищены.": "After confirmation, contacts, blacklist, and all chats will be cleared.",
  "Нет": "No",
  "Сбрасываем...": "Resetting...",
  "Да": "Yes",
  "Ошибка входа": "Login failed",
  "Вход выполнен": "Logged in",
  "Не удалось отправить код": "Failed to send the code",
  "Код отправлен на указанную почту": "The code was sent to the specified email",
  "Код отправлен": "Code sent",
  "Ошибка восстановления аккаунта": "Account recovery failed",
  "Аккаунт восстановлен": "Account recovered",
  "Ошибка регистрации": "Registration failed",
  "Регистрация завершена": "Registration completed",
  "Push уведомления не настроены на сервере": "Push notifications are not configured on the server",
  "Разрешите уведомления в браузере": "Allow notifications in your browser",
  "Не удалось включить уведомления": "Failed to enable notifications",
  "Уведомления включены": "Notifications enabled",
  "Уведомления отключены": "Notifications disabled",
  "Не удалось отключить уведомления": "Failed to disable notifications",
  "Отключить push-уведомления": "Disable push notifications",
  "Включить push-уведомления": "Enable push notifications",
  "Push включены": "Push enabled",
  "Включить push": "Enable push",
  "Профиль сохранён": "Profile saved",
  "Не удалось сохранить профиль": "Failed to save profile",
  "Не удалось изменить пароль": "Failed to change password",
  "Пароль изменён": "Password changed",
  "Удалить аккаунт без возможности восстановления? Вы будете автоматически разлогинены.": "Delete the account without recovery? You will be logged out automatically.",
  "Не удалось удалить аккаунт": "Failed to delete the account",
  "Аккаунт удалён": "Account deleted",
  "Настройки профиля": "Profile settings",
  "Изменения сохраняются в базе данных без смены пароля.": "Changes are saved to the database without changing your password.",
  "Сохраняем...": "Saving...",
  "Сохранить профиль": "Save profile",
  "Изменение пароля": "Change password",
  "Укажите текущий пароль и дважды введите новый.": "Enter your current password and type the new one twice.",
  "Текущий пароль": "Current password",
  "Новый пароль": "New password",
  "Подтверждение нового пароля": "Confirm new password",
  "Изменяем пароль...": "Changing password...",
  "Изменить пароль": "Change password",
  "Удаление аккаунта": "Delete account",
  "Аккаунт, ваши сообщения и доступ к приложению будут удалены без возможности восстановления.": "Your account, messages, and app access will be deleted permanently.",
  "Удаляем аккаунт...": "Deleting account...",
  "Удалить аккаунт": "Delete account",
  "Ищем пользователей...": "Searching users...",
  "По вашему запросу ничего не найдено.": "Nothing was found for your query.",
  "Контакт добавлен": "Contact added",
  "Не удалось добавить контакт": "Failed to add contact",
  "Контакт удалён": "Contact deleted",
  "Не удалось удалить контакт": "Failed to delete contact",
  "Пользователь добавлен в чёрный список": "User added to blacklist",
  "Не удалось добавить пользователя в чёрный список": "Failed to add user to blacklist",
  "Пользователь удалён из чёрного списка": "User removed from blacklist",
  "Не удалось удалить пользователя из чёрного списка": "Failed to remove user from blacklist",
  "Открыть чёрный список": "Open blacklist",
  "Введите имя или телефон": "Enter a name or phone number",
  "Добавлен": "Added",
  "Добавить": "Add",
  "Убрать из ЧС": "Remove from blacklist",
  "В ЧС": "Blacklist",
  "Мои контакты": "My contacts",
  "Контактов пока нет.": "No contacts yet.",
  "Роли пользователей": "User roles",
  "Администратор может назначать базовый, премиум и developer-статус пользователям.": "The administrator can assign basic, premium, and developer statuses to users.",
  "Управление ролями": "Role management",
  "Сделать обычным": "Set regular",
  "Выдать Premium": "Grant Premium",
  "Выдать статус разработчика": "Grant developer status",
  "Обновляем...": "Updating...",
  "Назначаем роль...": "Updating role...",
  "Роль обновлена": "Role updated",
  "Нельзя изменить собственную роль": "You cannot change your own role",
  "Заблокировать аккаунт": "Block account",
  "Разблокировать аккаунт": "Unblock account",
  "Статус блокировки обновлён": "Block status updated",
  "Не удалось обновить блокировку": "Failed to update the block status",
  "Выберите цвет аватарки": "Choose avatar color",
  "Цвет аватарки": "Avatar color",
  "Удалить публикацию": "Delete post",
  "Публикация удалена": "Post deleted",
  "Не удалось удалить публикацию": "Failed to delete the post",
  "Мои каналы и поиск": "My channels and search",
  "Управляйте каналами в том же окне, как и чатами.": "Manage channels in the same window, like chats.",
  "Канал": "Channel",
  "Откройте канал из списка или создайте новый.": "Open a channel from the list or create a new one.",
  "Участники канала": "Channel participants",
  "Сообщение в канал": "Channel message",
  "Писать могут только владелец и админы": "Only the owner and admins can write",
  "Название канала": "Channel title",
  "Описание канала": "Channel description",
  "Люди, с которыми вы можете начать диалог": "People you can start a dialog with",
  "Действия с контактом": "Contact actions",
  "Удалить контакт": "Delete contact",
  "Добавить в ЧС": "Add to blacklist",
  "Чёрный список": "Blacklist",
  "Ищите пользователей, добавляйте их в ЧС и управляйте текущим списком.": "Search users, add them to the blacklist, and manage the current list.",
  "Скрыть поиск": "Hide search",
  "Добавить в чёрный список": "Add to blacklist",
  "К контактам": "To contacts",
  "Пользователи в чёрном списке": "Blacklisted users",
  "Чёрный список пуст.": "Blacklist is empty.",
  "Убрать": "Remove",
  "Онлайн": "Online",
  "Только вы": "Only you",
  "Статус неизвестен": "Status unknown",
  "Вас удалили из чата": "You were removed from the chat",
  "Чат удалён владельцем": "The chat was deleted by the owner",
  "Выберите чат": "Select a chat",
  "Чаты отсутствуют. Создайте новый чат с пользователем из контактов.": "No chats yet. Create a new chat with a user from your contacts.",
  "Сообщений пока нет": "No messages yet",
  "Чаты отсутствуют.": "No chats yet.",
  "Общайтесь с пользователями из ваших контактов.": "Chat with users from your contacts.",
  "Не удалось загрузить сообщения канала": "Failed to load channel messages",
  "Создать чат": "Create chat",
  "Чтобы создать чат, сначала добавьте контакты.": "To create a chat, add contacts first.",
  "Участники": "Participants",
  "Скрыть участников": "Hide participants",
  "Список": "List",
  "Управление участниками": "Manage participants",
  "Только админ чата может добавлять и удалять участников.": "Only the chat admin can add and remove participants.",
  "Скрыть форму": "Hide form",
  "Добавить участников": "Add participants",
  "Доступны только пользователи из ваших контактов.": "Only users from your contacts are available.",
  "Нет доступных контактов для добавления.": "No available contacts to add.",
  "Отмена": "Cancel",
  "Участники добавлены": "Participants added",
  "Участник удалён": "Participant removed",
  "Удалить": "Delete",
  "Канал создан": "Channel created",
  "Не удалось создать канал": "Failed to create the channel",
  "Не удалось выполнить поиск": "Failed to perform the search",
  "Не удалось вступить в канал": "Failed to join the channel",
  "Не удалось отправить сообщение": "Failed to send the message",
  "Не удалось добавить участников": "Failed to add participants",
  "Не удалось обновить роль": "Failed to update the role",
  "Админ назначен": "Admin assigned",
  "Права админа сняты": "Admin rights removed",
  "Создать канал": "Create channel",
  "Создаём...": "Creating...",
  "Поиск каналов": "Channel search",
  "Введите название канала": "Enter channel name",
  "Ищем...": "Searching...",
  "Найти": "Search",
  "Без описания": "No description",
  "Участников:": "Members:",
  "Открыть": "Open",
  "Вступить": "Join",
  "Каналы не найдены.": "No channels found.",
  "Мои каналы": "My channels",
  "Вы пока не состоите ни в одном канале.": "You are not in any channels yet.",
  "Создавайте каналы, находите их в поиске и управляйте участниками.": "Create channels, find them in search, and manage participants.",
  "Откройте канал слева или найдите новый в поиске.": "Open a channel on the left or find a new one in search.",
  "Загружаем сообщения...": "Loading messages...",
  "Отправить": "Send",
  "Добавить выбранных": "Add selected",
  "Владелец": "Owner",
  "Участник": "Member",
  "Сделать админом": "Make admin",
  "Снять админа": "Remove admin",
}

const EN_TRANSLATIONS = RAW_EN_TRANSLATIONS

const defaultContextValue: I18nContextValue = {
  language: "ru",
  languagePreference: "system",
  setLanguage: () => undefined,
  tr: (text) => text,
}

const I18nContext = createContext<I18nContextValue>(defaultContextValue)

function getSystemLanguage(): ResolvedLanguage {
  if (typeof window === "undefined") {
    return "ru"
  }

  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en"
}

// localStorage is only readable client-side, so resolving the stored preference during render
// would make the client's first render diverge from the server-rendered HTML and fail
// hydration. useSyncExternalStore is the React-sanctioned way to read an external, mutable
// source safely across server and client: it renders the server snapshot ("system") on the
// server and on the client's first pass, then swaps to the real client value right after.
const preferenceListeners = new Set<() => void>()

function readStoredPreference(): LanguagePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === "ru" || stored === "en" || stored === "system" ? stored : "system"
}

function readStoredPreferenceServerSnapshot(): LanguagePreference {
  return "system"
}

function subscribeToPreference(listener: () => void) {
  window.addEventListener("storage", listener)
  preferenceListeners.add(listener)
  return () => {
    window.removeEventListener("storage", listener)
    preferenceListeners.delete(listener)
  }
}

function writeStoredPreference(next: LanguagePreference) {
  localStorage.setItem(STORAGE_KEY, next)
  preferenceListeners.forEach((listener) => listener())
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const languagePreference = useSyncExternalStore(
    subscribeToPreference,
    readStoredPreference,
    readStoredPreferenceServerSnapshot
  )
  const systemLanguage = useSyncExternalStore(
    () => () => undefined,
    getSystemLanguage,
    () => "ru" as const
  )
  const language = languagePreference === "system" ? systemLanguage : languagePreference

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = (nextLanguage: LanguagePreference) => {
    writeStoredPreference(nextLanguage)
  }

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      languagePreference,
      setLanguage,
      tr: (text: string) => {
        if (language === "ru") {
          return text
        }

        return EN_TRANSLATIONS[text] ?? text
      },
    }),
    [language, languagePreference]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
