import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 登录会话台账：记录「谁在什么时间、什么 IP、什么设备」登录过，
 * 并支持管理员远程强制下线某个会话（jti 吊销）。
 *
 * 持久化到 /app/data/sessions.json（挂载 selftv-data 卷，容器重建不丢）。
 * 单实例内存部署够用；多实例需换 Redis。
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'sessions.json');
const MAX_RECORDS = 300; // 超限清理最旧的记录，避免文件无限增长

export interface LoginRecord {
  jti: string;
  ip: string;
  ua: string;
  /** 从 UA 提取的可读设备信息（浏览器 + 系统） */
  device: string;
  createdAt: number;
  lastSeenAt: number;
  revokedAt?: number;
}

interface Store {
  records: LoginRecord[];
  /** 被强制吊销的 jti 集合 */
  revoked: string[];
}

function emptyStore(): Store {
  return { records: [], revoked: [] };
}

/**
 * 直接读文件，不做进程内缓存。
 * 原因：吊销状态由后台路由写入、由各业务接口的守卫读取。若各路由 bundle
 * 各自持有一份内存副本，跨 bundle 会读到旧状态，导致「点了强制下线
 * 但对方还能继续用」。文件很小，直读开销可忽略。
 */
function read(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')) as Partial<Store>;
    return {
      records: Array.isArray(raw.records) ? raw.records : [],
    revoked: Array.isArray(raw.revoked) ? raw.revoked : [],
    };
  } catch {
    return emptyStore();
  }
}

function write(store: Store): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, FILE_PATH);
  } catch (err) {
    console.warn('[session-log] 写入失败：', (err as Error).message);
  }
}

/** 把 UA 简化成人话（Chrome/Edge/Safari + Windows/macOS/Android/iOS/iPhone） */
export function parseDevice(ua: string): string {
  const s = (ua || '').toLowerCase();
  let browser = '未知浏览器';
  if (s.includes('edg/')) browser = 'Edge';
  else if (s.includes('chrome/') && !s.includes('chromium')) browser = 'Chrome';
  else if (s.includes('firefox/')) browser = 'Firefox';
  else if (s.includes('safari/') && !s.includes('chrome')) browser = 'Safari';
  else if (s.includes('postman') || s.includes('curl')) browser = '接口调用';

  let os = '未知系统';
  if (s.includes('iphone') || s.includes('ipad')) os = 'iOS';
  else if (s.includes('android')) os = 'Android';
  else if (s.includes('mac os') || s.includes('macintosh')) os = 'macOS';
  else if (s.includes('windows')) os = 'Windows';
  else if (s.includes('linux')) os = 'Linux';

  const mobile = /Android|iPhone/.test(ua || '') ? '移动端' : '';
  return `${browser}·${os}${mobile ? '·移动端' : ''}`;
}

/** 记录一次成功登录 */
export function recordLogin(jti: string, ip: string, ua: string): LoginRecord {
  const store = read();
  const now = Date.now();
  const rec: LoginRecord = {
    jti,
    ip: ip || 'unknown',
    ua: (ua || '').slice(0, 300),
    device: parseDevice(ua),
    createdAt: now,
    lastSeenAt: now,
  };
  store.records.push(rec);
  if (store.records.length > MAX_RECORDS) {
    store.records = store.records.slice(-MAX_RECORDS);
  }
  write(store);
  return rec;
}

/** 会话是否被管理员强制吊销 */
export function isRevoked(jti: string | undefined): boolean {
  if (!jti) return false;
  return read().revoked.includes(jti);
}

/** 吊销（强制下线）单个会话；返回是否真的吊销了 */
export function revokeSession(jti: string): boolean {
  const store = read();
  if (store.revoked.includes(jti)) return false;
  store.revoked.push(jti);
  const rec = store.records.find((r) => r.jti === jti);
  if (rec) rec.revokedAt = Date.now();
  write(store);
  return true;
}

/** 吊销除指定 jti（通常是管理员自己）之外的所有会话，返回被吊销数量 */
export function revokeAll(exceptJti?: string): number {
  const store = read();
  const now = Date.now();
  let n = 0;
  for (const rec of store.records) {
    if (rec.jti === exceptJti || rec.revokedAt) continue;
    if (!store.revoked.includes(rec.jti)) store.revoked.push(rec.jti);
    rec.revokedAt = now;
    n += 1;
  }
  write(store);
  return n;
}

/** 后台展示用的台账：最近活跃在前，标记是否已被吊销 */
export function listSessions(currentJti?: string): Array<LoginRecord & { current: boolean }> {
  const store = read();
  return store.records
    .slice()
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .map((r) => ({
      ...r,
      current: !!currentJti && r.jti === currentJti,
      revokedAt: r.revokedAt ?? (store.revoked.includes(r.jti) ? -1 : undefined),
    }));
}

/** 更新最后活跃时间（节流：同会话 5 分钟内只写一次） */
export function touchSession(jti: string | undefined): void {
  if (!jti) return;
  const store = read();
  const rec = store.records.find((r) => r.jti === jti);
  if (!rec) return;
  const now = Date.now();
  if (now - rec.lastSeenAt < 5 * 60 * 1000) return;
  rec.lastSeenAt = now;
  write(store);
}

export function newJti(): string {
  return crypto.randomUUID();
}
