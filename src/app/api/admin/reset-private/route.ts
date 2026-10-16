import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { resetPrivateSources } from '@/lib/managed-private-sources';

export const runtime = 'nodejs';

/** 按 env PRIVATE_SOURCES 重新播种私密源清单（会覆盖后台的增删改与启用设置） */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const sources = resetPrivateSources();
  return NextResponse.json({ sources, count: sources.length });
}
