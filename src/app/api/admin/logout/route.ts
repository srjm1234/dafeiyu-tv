import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/admin-auth';

export const runtime = 'nodejs';

/** 后台退出登录：清除 ltv_admin cookie */
function handle() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function POST() {
  return handle();
}

export async function DELETE() {
  return handle();
}
