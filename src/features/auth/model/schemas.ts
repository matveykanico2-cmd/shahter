import { z } from "zod"

import { usernameSchema } from "@/shared/lib/usernames"

export const loginSchema = z.object({
  email: z.email("Укажите корректный email"),
  password: z
    .string()
    .min(8, "Пароль должен быть не короче 8 символов")
    .max(72, "Пароль слишком длинный"),
})

const phoneSchema = z
  .string()
  .trim()
  .min(8, "Телефон слишком короткий")
  .max(20, "Телефон слишком длинный")

export const recoveryPhoneSchema = z.object({
  phone: phoneSchema,
})

export const recoveryCodeSchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Укажите 6-значный код"),
})

export const registerSchema = z
  .object({
    email: z.email("Укажите корректный email"),
    password: z
      .string()
      .min(8, "Пароль должен быть не короче 8 символов")
      .max(72, "Пароль слишком длинный"),
    confirmPassword: z.string().min(1, "Подтвердите пароль"),
    firstName: z
      .string()
      .trim()
      .min(2, "Имя должно быть не короче 2 символов")
      .max(40, "Имя слишком длинное"),
    lastName: z
      .string()
      .trim()
      .max(40, "Фамилия слишком длинная")
      .optional()
      .or(z.literal("")),
    username: usernameSchema,
    phone: phoneSchema,
    referrerId: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RecoveryPhoneInput = z.infer<typeof recoveryPhoneSchema>
export type RecoveryCodeInput = z.infer<typeof recoveryCodeSchema>
