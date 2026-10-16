import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { addSource, getManagedSources } from '@/lib/managed-sources';

export const runtime = 'nodejs';

/** 列出全部托管点播源（含禁用项与 enabled 标记） */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ sources: getManagedSources() });
}

/** 新增一个点播源（默认启用） */
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
    const created = addSource(body);
    return NextResponse.json({ source: created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
