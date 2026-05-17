import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { password } = await request.json()
  const expected = process.env.ADMIN_PASSWORD

  if (!expected) {
    return NextResponse.json({ error: '未配置密码' }, { status: 500 })
  }

  if (password === expected) {
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '密码错误' }, { status: 401 })
}
