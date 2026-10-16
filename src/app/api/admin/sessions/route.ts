import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, requireAdmin } from '@/lib/admin-auth';

import { listSessions, revokeAll, revokeSession } from '@/lib/session-log';

export const runtime = 'nodejs';

/**
 * 登录设备台账：列出所有登录过的 IP/设备/时间，并支持远程强制下线。
 * current 标记当前这条管理员会话，避免误伤自己。
 */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const adminToken = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);

  return NextResponse.json({ sessions: listSessions(adminToken) });
}

/** 强制下线：单条踢出（body.jti）或注销全部（body.all） */
export async function DELETE(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: { jti?: string; all?: boolean };
  try {
    body = (await req.json()) as { jti?: string; all?: boolean };
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
  }

  if (body.jti) {
    const ok = revokeSession(body.jti);
    return NextResponse.json({ ok, revoked: ok ? 1 : 0 });
  }
  if (body.all === true) {
    // 全量注销时保留管理员当前会话，避免把自己踢下线后无法操作
    const adminToken = req.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${ADMIN_COOKIE}=`))
      ?.slice(ADMIN_COOKIE.length + 1);
    const count = revokeAll(adminToken);
    return NextResponse.json({ ok: true, revoked: count });
  }
  return NextResponse.json({ error: '需要 jti 或 all' }, { status: 400 });
}
