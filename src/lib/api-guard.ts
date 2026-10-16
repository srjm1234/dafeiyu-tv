import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader, sessionJti } from './auth';
import { isRevoked, touchSession } from './session-log';

/**
 * API Route 共享守卫：
 * - 未配置密码 → 503
 * - 未登录 → 401
 * - 会话已被管理员强制下线（后台远程踢设备）→ 401（附带 status=revoked 便于前端提示）
 */
export function guardRequest(req: Request): NextResponse | null {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { error: '服务器未设置 PASSWORD 环境变量' },
      { status: 503 }
    );
  }
  const cookieHeader = req.headers.get('cookie');
  if (!sessionFromCookieHeader(cookieHeader)) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const jti = sessionJti(cookieHeader);
  if (isRevoked(jti)) {
    return NextResponse.json({ error: '该设备已被管理员强制下线', status: 'revoked' }, { status: 401 });
  }
  touchSession(jti); // 更新最后活跃时间（内部已按会话节流）
  return null;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
