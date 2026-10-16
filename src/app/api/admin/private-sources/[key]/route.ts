import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { removePrivateSource, updatePrivateSource } from '@/lib/managed-private-sources';

export const runtime = 'nodejs';

/** 全量/部分更新某私密源（启用开关、改名、改地址、成人标记） */
export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { key } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
  }
  try {
    return NextResponse.json({ source: updatePrivateSource(key, body) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { key } = await ctx.params;
  try {
    removePrivateSource(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
