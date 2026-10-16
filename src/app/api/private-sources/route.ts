import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getPrivateSourcePassword } from '@/lib/env-sources';
import { getEnabledPrivateSources } from '@/lib/managed-private-sources';

export const runtime = 'nodejs';

/**
 * 私密源解锁 / 查询 / 锁定。
 *
 * - POST：提交密码，校验通过后下发 HttpOnly 签名 cookie（12 小时），并返回源清单；
 *   签名以 PROXY_SECRET 为密钥计算 HMAC，伪造 cookie 无法通过校验。
 * - GET：持有效 cookie 返回源清单，否则 401（前端据此展示密码输入框）。
 * - DELETE：清除 cookie（退出私密模式）。
 *
 * 源清单只在解锁后下发，未解锁时前端拿不到任何私密源地址。
 */

const COOKIE_NAME = 'private_src';
const COOKIE_MAX_AGE = 12 * 60 * 60; // 12h

function expectedToken(): string {
  const secret = process.env.PROXY_SECRET || process.env.PASSWORD || 'libretv-private-src';
  return createHash('sha256').update(`${secret}:private-sources`).digest('hex');
}

function cookieValue(req: Request): string | undefined {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === COOKIE_NAME) return part.slice(idx + 1).trim();
  }
  return undefined;
}

function isUnlocked(req: Request): boolean {
  const token = cookieValue(req);
  if (!token) return false;
  const expected = expectedToken();
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function unlockCookie(): string {
  return `${COOKIE_NAME}=${expectedToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

const CLEAR_COOKIE = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  if (!getPrivateSourcePassword()) return jsonError('私密源未配置', 404);
  if (!isUnlocked(req)) return jsonError('未解锁', 401);
  // 托管清单：后台管理的启用/禁用在此生效（未解锁时仍拿不到任何地址）
  return NextResponse.json({ sources: getEnabledPrivateSources() });
}

export async function POST(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const password = getPrivateSourcePassword();
  if (!password) return jsonError('私密源未配置', 404);

  let submitted: unknown;
  try {
    const body = (await req.json()) as { password?: unknown };
    submitted = body.password;
  } catch {
    return jsonError('请求格式错误', 400);
  }
  if (typeof submitted !== 'string') return jsonError('请求格式错误', 400);

  const a = Buffer.from(submitted);
  const b = Buffer.from(password);
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) return jsonError('密码错误', 403);

  const res = NextResponse.json({ sources: getEnabledPrivateSources() });
  res.headers.set('set-cookie', unlockCookie());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set('set-cookie', CLEAR_COOKIE);
  return res;
}
