import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { resetToDefaults } from '@/lib/managed-sources';

export const runtime = 'nodejs';

/** 按 DEFAULT_SOURCES（env）重新播种托管清单，覆盖当前所有改动 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const sources = resetToDefaults();
  return NextResponse.json({ sources, count: sources.length });
}
