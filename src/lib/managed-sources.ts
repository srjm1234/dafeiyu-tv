import fs from 'node:fs';
import path from 'node:path';
import type { ManagedSource, SourceConfig } from './types';
import { getEnvSources } from './env-sources';

/**
 * 服务端托管的「点播源清单」。
 *
 * 数据落地在容器内的 /app/data/sources.json（部署时挂载 selftv-data 卷，重建不丢）。
 * 首次运行时以 DEFAULT_SOURCES（env）播种；之后管理员在后台的增删改、启用/禁用
 * 全部写回该文件，并由 /api/status 下发「已启用」的子集，做到全站点播搜索/换源生效。
 *
 * 该文件是站点可用的点播源「池」——是否对单个用户可见，仍由用户在源管理里勾选决定；
 * 而管理员在这里禁用/删除某源，则所有用户都拿不到它（即「屏蔽玉兔」这类诉求的落点）。
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');
const FILE_TTL_MS = 2 * 60 * 1000; // 兜底缓存，避免高频读盘

// 极简缓存：文件 mtime 变化或超时即失效（单实例部署足够）
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
  return getEnvSources().map((s) => ({ ...s, enabled: true }));
}

function readFile(): ManagedSource[] | null {
  try {
    const stat = fs.statSync(SOURCES_FILE);
    if (cache && cache.mtime === stat.mtimeMs && Date.now() - cache.at < FILE_TTL_MS) {
      return cache.sources;
    }
    const text = fs.readFileSync(SOURCES_FILE, 'utf8');
    const parsed = JSON.parse(text);
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
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null; // 未播种
    console.warn('[managed-sources] 读取失败，将重新播种：', (err as Error).message);
    return null;
  }
}

function writeFile(sources: ManagedSource[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SOURCES_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sources, null, 2), 'utf8');
  fs.renameSync(tmp, SOURCES_FILE); // 原子替换
  cache = { sources, mtime: fs.statSync(SOURCES_FILE).mtimeMs, at: Date.now() };
}

/** 读取全部托管源；文件不存在时按 env 播种并落盘 */
export function getManagedSources(): ManagedSource[] {
  const existing = readFile();
  if (existing) return existing;
  const seeded = seedFromEnv();
  writeFile(seeded);
  return seeded;
}

/** 已启用的源（去掉 enabled 字段，供 /api/status 下发） */
export function getEnabledSources(): SourceConfig[] {
  return getManagedSources()
    .filter((s) => s.enabled)
    .map((s) => ({ key: s.key, name: s.name, url: s.url, detail: s.detail, isAdult: s.isAdult }));
}

export function addSource(input: unknown): ManagedSource {
  const base = validateInput(input);
  const sources = getManagedSources();
  const key = `mgr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const created: ManagedSource = { ...base, key, enabled: true };
  sources.push(created);
  writeFile(sources);
  return created;
}

export function updateSource(key: string, input: unknown): ManagedSource {
  const sources = getManagedSources();
  const idx = sources.findIndex((s) => s.key === key);
  if (idx === -1) throw new Error('源不存在');
  const cur = sources[idx];
  const patch = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  // 部分更新：未提供的字段沿用原值。
  // 前端「启用/禁用开关」只发送 { enabled }，若强制全量校验会因缺 name/url 报错。
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

export function removeSource(key: string): void {
  const sources = getManagedSources();
  const next = sources.filter((s) => s.key !== key);
  if (next.length === sources.length) throw new Error('源不存在');
  writeFile(next);
}

/** 按 env 重新播种（注意：玉兔已不在 env，重置不会使其回归） */
export function resetToDefaults(): ManagedSource[] {
  const seeded = seedFromEnv();
  writeFile(seeded);
  return seeded;
}
