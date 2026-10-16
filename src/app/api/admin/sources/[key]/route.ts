import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { removeSource, updateSource } from '@/lib/managed-sources';

export const runtime = 'nodejs';

/** 全量更新某点播源（名称/地址/备注/成人标记/启用开关） */
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
    const updated = updateSource(key, body);
    return NextResponse.json({ source: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** 删除某点播源 */
export async function DELETE(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { key } = await ctx.params;
  try {
    removeSource(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
