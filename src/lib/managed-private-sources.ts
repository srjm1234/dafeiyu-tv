import fs from 'node:fs';
import path from 'node:path';
import type { ManagedSource, SourceConfig } from './types';
import { getPrivateSources } from './env-sources';

/**
 * 服务端托管的「私密源清单」。
 *
 * 与 sources.json 的关系：
 * - sources.json     = 全站点播源池（无需密码，所有人可见可选）
 * - private-sources.json = 私密源池（需输入私密源密码解锁后才下发）
 *
 * 后台管理（增删改 + 启用/禁用）写回本文件，实现「私密源也能被管理员管理」。
 * 安全语义保持不变：未解锁时前端拿不到任何私密源地址（见 /api/private-sources）。
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'private-sources.json');
const FILE_TTL_MS = 2 * 60 * 1000;

let cache: { sources: ManagedSource[]; mtime: number; at: number } | null = null;

function validateInput(raw: unknown, opts: { keyOptional?: boolean } = {}): SourceConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('数据格式不正确');
  const { name, url, detail, isAdult, key } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim()) throw new Error('名称不能为空');
  if (typeof url !== 'string' || !/^https?:\/\//.test(url.trim()))
    throw new Error('地址必须以 http:// 或 https:// 开头');
  if (opts.keyOptional && key !== undefined && (typeof key !== 'string' || !key.trim()))
    throw new Error('key 格式不正确');
  return {
    key: opts.keyOptional && typeof key === 'string' ? key.trim() : '',
    name: name.trim(),
    url: url.trim().replace(/\/+$/, ''),
    detail: typeof detail === 'string' && detail.trim() ? detail.trim() : undefined,
    isAdult: isAdult === true,
  };
}

function seedFromEnv(): ManagedSource[] {
  return getPrivateSources().map((s) => ({ ...s, enabled: true }));
}

function readFile(): ManagedSource[] | null {
  try {
    const stat = fs.statSync(FILE_PATH);
    if (cache && cache.mtime === stat.mtimeMs && Date.now() - cache.at < FILE_TTL_MS) {
      return cache.sources;
    }
    const parsed = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('不是数组');
    const sources = parsed.map((item) => {
      const base = validateInput(item, { keyOptional: true });
      return {
        ...base,
        key: typeof item?.key === 'string' && item.key.trim() ? item.key.trim() : base.key,
        enabled: item?.enabled !== false,
      } as ManagedSource;
    });
    cache = { sources, mtime: stat.mtimeMs, at: Date.now() };
    return sources;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    console.warn('[managed-private-sources] 读取失败，将重新播种：', (err as Error).message);
    return null;
  }
}

function writeFile(sources: ManagedSource[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sources, null, 2), 'utf8');
  fs.renameSync(tmp, FILE_PATH);
  cache = { sources, mtime: fs.statSync(FILE_PATH).mtimeMs, at: Date.now() };
}

/** 读取全部托管私密源；文件不存在时按 env 播种并落盘 */
export function getManagedPrivateSources(): ManagedSource[] {
  const existing = readFile();
  if (existing) return existing;
  const seeded = seedFromEnv();
  writeFile(seeded);
  return seeded;
}

/** 已启用的私密源（去掉 enabled 字段，仅在下发给用户时调用） */
export function getEnabledPrivateSources(): SourceConfig[] {
  return getManagedPrivateSources()
    .filter((s) => s.enabled)
    .map((s) => ({ key: s.key, name: s.name, url: s.url, detail: s.detail, isAdult: s.isAdult }));
}

export function addPrivateSource(input: unknown): ManagedSource {
  const base = validateInput(input);
  const sources = getManagedPrivateSources();
  const key = `pvt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const created: ManagedSource = { ...base, key, enabled: true };
  writeFile([...sources, created]);
  return created;
}

/** 部分更新：未提供的字段沿用原值（启用开关只传 { enabled } 也能生效） */
export function updatePrivateSource(key: string, input: unknown): ManagedSource {
  const sources = getManagedPrivateSources();
  const idx = sources.findIndex((s) => s.key === key);
  if (idx === -1) throw new Error('源不存在');
  const cur = sources[idx];
  const patch = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const merged = {
    name: patch.name !== undefined ? patch.name : cur.name,
    url: patch.url !== undefined ? patch.url : cur.url,
    detail: patch.detail !== undefined ? patch.detail : cur.detail,
    isAdult: patch.isAdult !== undefined ? patch.isAdult : cur.isAdult,
  };
  const base = validateInput(merged);
  const enabled = patch.enabled !== undefined ? patch.enabled !== false : cur.enabled;
  sources[idx] = { ...base, key, enabled };
  writeFile(sources);
  return sources[idx];
}

export function removePrivateSource(key: string): void {
  const sources = getManagedPrivateSources();
  const next = sources.filter((s) => s.key !== key);
  if (next.length === sources.length) throw new Error('源不存在');
  writeFile(next);
}

/** 按 env 重新播种（重置私密源清单） */
export function resetPrivateSources(): ManagedSource[] {
  const seeded = seedFromEnv();
  writeFile(seeded);
  return seeded;
}
