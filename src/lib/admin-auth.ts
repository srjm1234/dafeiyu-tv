import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * 后台管理员鉴权：与站点访客密码（auth.ts）完全独立。
 * 复用同一套 HMAC 签名 + httpOnly cookie 机制，但使用独立的 ADMIN_PASSWORD 与 ltv_admin cookie，
 * 互不干扰——站点访问密码与后台管理密码可以不同。
 */

export const ADMIN_COOKIE = 'ltv_admin';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || '';
}

export function isAdminConfigured(): boolean {
  return getAdminPassword().length > 0;
}

function getSecret(): string {
  if (process.env.PROXY_SECRET) return process.env.PROXY_SECRET;
  return crypto.createHash('sha256').update(getAdminPassword() + ':libretv::admin-salt').digest('hex');
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function signAdminSession(): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  return { token: `${payload}.${hmac(payload)}`, expiresAt };
}

export function verifyAdminSession(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const expiresAt = parseInt(payload, 10);
  if (!Number.isFinite(expiresAt)) return false;
  return Date.now() < expiresAt;
}

export function adminSessionFromCookieHeader(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  for (const c of cookieHeader.split(';')) {
    const eq = c.indexOf('=');
    if (eq === -1) continue;
    if (c.slice(0, eq).trim() === ADMIN_COOKIE) {
      return verifyAdminSession(decodeURIComponent(c.slice(eq + 1).trim()));
    }
  }
  return false;
}

/** 恒定时间比较管理员密码 */
export function checkAdminPassword(input: string): boolean {
  const password = getAdminPassword();
  if (!password) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(password).digest();
  return crypto.timingSafeEqual(a, b);
}

// —— 登录速率限制（内存实现，单实例部署足够） ——
const attemptMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function checkAdminRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attemptMap.get(ip);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export function clearAdminRateLimit(ip: string): void {
  attemptMap.delete(ip);
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/** 路由守卫：无有效管理员会话则返回 401（供 admin API 复用） */
export function requireAdmin(req: Request): NextResponse | null {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: '后台未配置管理员密码' }, { status: 503 });
  }
  const cookie = req.headers.get('cookie');
  if (!adminSessionFromCookieHeader(cookie)) {
    return NextResponse.json({ error: '未登录或会话已失效' }, { status: 401 });
  }
  return null;
}
