import { NextResponse } from "next/server"

import { registerUser } from "@/features/auth/api/auth-service"
import { registerSchema } from "@/features/auth/model/schemas"
import {
  createAuthToken,
  createSessionId,
  setAuthCookies,
} from "@/shared/lib/auth/session"
import { touchUserActivity } from "@/shared/lib/user-activity"

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const parsed = registerSchema.safeParse(json)

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      return NextResponse.json(
        {
          message: "Ошибка валидации",
          fieldErrors,
        },
        { status: 400 }
      )
    }

    const result = await registerUser({
      email: parsed.data.email,
      password: parsed.data.password,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      username: parsed.data.username,
      phone: parsed.data.phone,
      referrerId: parsed.data.referrerId,
    })

    if (!result.ok) {
      return NextResponse.json(
        { message: result.message, fieldErrors: result.fieldErrors ?? {} },
        { status: result.status }
      )
    }

    const sessionId = createSessionId()
    const token = await createAuthToken({
      userId: result.user.id,
      email: result.user.email,
      sid: sessionId,
    })

    const response = NextResponse.json(
      {
        user: result.user,
      },
      { status: 201 }
    )
    await touchUserActivity(result.user.id, true)
    setAuthCookies(response, { token, sessionId })
    return response
  } catch (error) {
    console.error("POST /api/auth/register failed", error)
    return NextResponse.json({ message: "Внутренняя ошибка сервера" }, { status: 500 })
  }
}

