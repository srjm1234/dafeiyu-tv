import { NextResponse } from 'next/server';
import { SESSION_COOKIE, checkRateLimit, sessionFromCookieHeader, signSession, checkPassword, clearRateLimit, isPasswordConfigured } from '@/lib/auth';
import { recordLogin } from '@/lib/session-log';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { success: false, error: '服务器未设置 PASSWORD 环境变量，请联系管理员配置' },
      { status: 503 }
    );
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: '尝试次数过多，请 10 分钟后再试' },
      { status: 429 }
    );
  }

  let password = '';
  try {
    const body = (await req.json()) as { password?: string };
    password = String(body.password ?? '');
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
  }

  clearRateLimit(ip);
  // 记录本次登录的设备指纹，供后台「登录设备」台账与远程强制下线使用
  const ua = req.headers.get('user-agent') || '';
  const session = signSession();
  const token = session.token;
  const expiresAt = session.expiresAt;
  try {
    recordLogin(session.jti, ip, ua);
  } catch (err) {
    console.warn('[auth] 记录登录会话失败：', (err as Error).message);
  }
  const res = NextResponse.json({ success: true });
  // Cookie Secure 策略：COOKIE_SECURE 环境变量显式覆盖；否则按 x-forwarded-proto 推导。
  // 不能依赖 req.url——Next.js Route Handler 中它是内部转发地址，并非用户侧的原始协议。
  const secure = process.env.COOKIE_SECURE === 'true'
    ? true
    : process.env.COOKIE_SECURE === 'false'
      ? false
      : (req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http') === 'https';
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
    path: '/',
  });
  return res;
}

/** GET：查询当前会话状态 */
export async function GET(req: Request) {
  const verified = sessionFromCookieHeader(req.headers.get('cookie'));
  return NextResponse.json({ success: true, verified });
}

/** DELETE：登出 */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}
