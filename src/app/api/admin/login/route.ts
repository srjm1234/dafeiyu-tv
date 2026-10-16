import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  checkAdminPassword,
  checkAdminRateLimit,
  clearAdminRateLimit,
  clientIp,
  isAdminConfigured,
  signAdminSession,
} from '@/lib/admin-auth';

export const runtime = 'nodejs';

/** 后台管理员登录：校验 ADMIN_PASSWORD，成功下发 httpOnly 签名的 ltv_admin cookie */
export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: '后台未配置管理员密码' }, { status: 503 });
  }
  const ip = clientIp(req);
  if (!checkAdminRateLimit(ip)) {
    return NextResponse.json({ error: '尝试次数过多，请稍后再试' }, { status: 429 });
  }
  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    // 空 body 视为密码为空
  }
  if (!checkAdminPassword(password)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }
  clearAdminRateLimit(ip);
  const { token, expiresAt } = signAdminSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
  });
  return res;
}
