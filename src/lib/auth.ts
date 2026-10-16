import crypto from 'node:crypto';

/**
 * 会话鉴权：httpOnly cookie + HMAC 签名。
 *
 * 相比旧版的改进：
 * - 页面源码不再下发 sha256(password)，前端拿不到任何可重放的凭证；
 * - 兼容模式「哈希即凭证」被彻底移除；
 * - 登录接口只接受 POST body，不再把明文密码放 query。
 */

export const SESSION_COOKIE = 'ltv_session';
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 天

export function getPassword(): string {
  return process.env.PASSWORD || '';
}

export function isPasswordConfigured(): boolean {
  return getPassword().length > 0;
}

function getSecret(): string {
  if (process.env.PROXY_SECRET) return process.env.PROXY_SECRET;
  return crypto.createHash('sha256').update(getPassword() + ':libretv::session-salt').digest('hex');
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/**
 * 生成签名会话 token：`<expiresAtMs>.<jti>.<hmac>`。
 *
 * jti（会话唯一 id）用于「登录设备管理」：服务端按 jti 记录 IP/UA，
 * 管理员可在后台强制吊销指定会话（远程踢下线）。
 * 兼容说明：hmac 的输入是整个 `<exp>.<jti>` 载荷，旧的 `<exp>.<hmac>`
 * 格式（无 jti）仍能校验通过并视为有效——这类是升级前的存量会话，
 * 没有 jti，无法单独吊销，只能「注销全部会话」。
 */
export function signSession(jti?: string): { token: string; expiresAt: number; jti: string } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const id = jti || crypto.randomUUID();
  const payload = `${expiresAt}.${id}`;
  return { token: `${payload}.${hmac(payload)}`, expiresAt, jti: id };
}

/** 从会话 token 中提取 jti；旧格式（无 jti）返回 undefined */
export function jtiOfToken(token: string | undefined | null): string | undefined {
  if (!token) return undefined;
  const parts = token.split('.');
  return parts.length >= 3 ? parts[1] : undefined;
}

/** 校验会话 token 的签名与有效期 */
export function verifySession(token: string | undefined | null): boolean {
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

/** 恒定时间比较密码（比较 sha256 摘要避免长度泄漏） */
export function checkPassword(input: string): boolean {
  const password = getPassword();
  if (!password) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(password).digest();
  return crypto.timingSafeEqual(a, b);
}

/** 从请求 Cookie 中解析会话 */
export function sessionFromCookieHeader(cookieHeader: string | null): boolean {
  return verifySession(tokenFromCookieHeader(cookieHeader));
}

/** 从请求 Cookie 中取出会话 token 原文（含签名与 jti） */
export function tokenFromCookieHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const c of cookieHeader.split(';')) {
    const eq = c.indexOf('=');
    if (eq === -1) continue;
    if (c.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(c.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/** 会话 jti：登录设备台账与「远程强制下线」都以此为准；旧格式 cookie 返回 undefined */
export function sessionJti(cookieHeader: string | null): string | undefined {
  return jtiOfToken(tokenFromCookieHeader(cookieHeader));
}

// —— 登录速率限制（内存实现，单实例部署足够；多实例可换 Redis） ——

const attemptMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function checkRateLimit(ip: string): boolean {
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

export function clearRateLimit(ip: string): void {
  attemptMap.delete(ip);
}

// 定期清理过期限流记录，避免长期运行下 Map 膨胀
if (typeof setInterval === 'function') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of attemptMap) {
      if (now > entry.resetAt) attemptMap.delete(ip);
    }
  }, 60 * 1000);
  // 不阻止 Node 进程退出
  if (typeof timer.unref === 'function') timer.unref();
}
