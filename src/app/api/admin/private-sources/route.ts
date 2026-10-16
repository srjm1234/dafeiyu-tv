import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { addPrivateSource, getManagedPrivateSources } from '@/lib/managed-private-sources';

export const runtime = 'nodejs';

/** 后台私密源：列出（仅管理员） / 新增 */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ sources: getManagedPrivateSources() });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
  }
  try {
    return NextResponse.json({ source: addPrivateSource(body) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
