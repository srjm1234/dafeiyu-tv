import type { DoubanItem } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';

/**
 * 新番放送表（每日放送）数据获取。
 *
 * 数据源为 bgmlist.com（番组放送计划）：中文标题 + RFC5545 播出规律，
 * 封面与评分经三级匹配向 AniList GraphQL 换取：
 * AniList ID 精确匹配 → MAL ID（idMal_in）反查 → 标题搜索兜底。
 *
 * 说明：官方 api.bgm.tv 在部分网络环境（含国内）会被 DNS 阻断，
 * 原实现直连官方 API 会持续超时导致「新番放送」选项加载失败，故弃用。
 * 数据复用 DoubanItem 结构，前端推荐区可无差别渲染。
 */

const BGMLIST_API = 'https://bgmlist.com/api/v1/bangumi/onair';
const ANILIST_API = 'https://graphql.anilist.co';
const CACHE_TTL = 30 * 60 * 1000;
// 注意：User-Agent 必须 ASCII（undici 要求请求头值为 Latin1），
// 含中文会导致服务端 fetch 直接抛「Cannot convert argument to a ByteString」异常 → 接口 502
const UA = 'Selftv-Anime (+https://github.com/LibreSpark/LibreTV)';

/** 占位封面：同域静态图，避免外部图源缺失时卡片破图（SmartImage 任意代理模式下均可用） */
export const PLACEHOLDER_COVER = '/anime-placeholder.png';

/** 星期 id：1=周一 … 7=周日；calendar 偶发返回 8 等非法值，直接丢弃 */
export function normalizeWeekday(id: number): number | undefined {
  return id >= 1 && id <= 7 ? id : undefined;
}

interface BangumiSubject {
  id?: number;
  name?: string;
  name_cn?: string;
  images?: { large?: string; common?: string; medium?: string; small?: string; grid?: string };
  rating?: { score?: number };
}

interface BangumiCalendarDay {
  weekday?: { id?: number; en?: string; cn?: string };
  items?: BangumiSubject[];
}

/** 单条 subject → DoubanItem；缺标题或封面的条目视为脏数据丢弃 */
export function subjectToItem(subject: BangumiSubject): DoubanItem | undefined {
  const title = subject.name_cn || subject.name;
  const cover = subject.images?.large || subject.images?.common || subject.images?.medium;
  if (!subject.id || !title || !cover) return undefined;
  const score = subject.rating?.score ?? 0;
  return {
    id: String(subject.id),
    title,
    cover,
    rating: score > 0 ? score.toFixed(1) : undefined,
    isTv: true,
  };
}

export function groupCalendarByWeekday(raw: BangumiCalendarDay[]): Record<number, DoubanItem[]> {
  const days: Record<number, DoubanItem[]> = {};
  for (const day of raw) {
    const weekday = normalizeWeekday(day.weekday?.id ?? -1);
    if (!weekday) continue;
    const items = (day.items ?? [])
      .map(subjectToItem)
      .filter((item): item is DoubanItem => item !== undefined);
    days[weekday] = items;
  }
  return days;
}

// ---------------------------------------------------------------------------
// bgmlist 数据源实现
// ---------------------------------------------------------------------------

interface BgmlistSite {
  site: string;
  id: string;
}

interface BgmlistItem {
  id: number;
  title: string;
  titleTranslate?: Record<'zh-Hans' | 'zh-Hant' | 'en' | 'ja', string[]>;
  type?: string;
  lang?: string;
  begin?: string;
  /** RFC5545 播出规律，形如 R/1969-10-05T09:30:00.000Z/P7D */
  broadcast?: string;
  end?: string;
  sites?: BgmlistSite[];
}

/**
 * 从 broadcast 推导 JST 播出星期（1=周一 … 7=周日）。
 * 新番以日本时间为准，UTC 时间 +9h 后按周日历归日。
 */
export function weekdayFromBroadcast(broadcast?: string): number | undefined {
  const m = /^R\/(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(broadcast ?? '');
  if (!m) return undefined;
  const utc = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00.000Z`);
  if (Number.isNaN(utc)) return undefined;
  const jst = new Date(utc + 9 * 3600 * 1000);
  const day = jst.getUTCDay(); // 0=周日
  return day === 0 ? 7 : day;
}

/** 中文标题优先，回退原始标题 */
export function pickTitle(item: BgmlistItem): string {
  return (
    item.titleTranslate?.['zh-Hans']?.[0] ||
    item.titleTranslate?.['zh-Hant']?.[0] ||
    item.title ||
    ''
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface AnilistMedia {
  id: number;
  idMal?: number;
  coverImage?: { large?: string; extraLarge?: string };
  averageScore?: number;
}

/** AniList 评分为 0-100 分制，DoubanItem.rating 约定 0-10，展示前换算 */
function toRating(score?: number): string | undefined {
  return score && score > 0 ? (score / 10).toFixed(1) : undefined;
}

/** 取 bgmlist sites 中指定站点的数字 ID */
function siteId(item: BgmlistItem, site: string): number | undefined {
  const n = Number(item.sites?.find((s) => s.site === site)?.id);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 简单重试：bgmlist 上游偶发抖动（fetch failed），重试一次可显著降低整块加载失败率 */
async function fetchWithRetry(url: string, opts: Parameters<typeof fetchUpstream>[1], retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchUpstream(url, opts);
      if (res.ok || (res.status >= 400 && res.status < 500)) return res; // 4xx 非重试
      lastErr = new Error(`上游响应异常 (${res.status})`);
    } catch (err) {
      lastErr = err;
      if (i < retries) await sleep(600 * (i + 1)); // 递增退避
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('上游请求失败');
}

const ANILIST_FIELDS = 'id idMal coverImage { large extraLarge } averageScore';

/** AniList Page 批量查询：ids 走 id_in，malIds 走 idMal_in（MAL ID 反查） */
async function queryAnilistByIds(ids: number[], field: 'id_in' | 'idMal_in'): Promise<AnilistMedia[]> {
  if (ids.length === 0) return [];
  const query = `query ($ids: [Int]) { Page(perPage: 50) { media(${field}: $ids, sort: ID) { ${ANILIST_FIELDS} } } }`;
  try {
    const res = await fetchUpstream(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query, variables: { ids } }),
      timeoutMs: 8000,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { Page?: { media?: AnilistMedia[] } } };
    return json.data?.Page?.media ?? [];
  } catch {
    return [];
  }
}

/** 标题搜索兜底：按相关度取首个 ANIME 结果（罗马字/日文原生标题均可搜） */
async function searchAnilistByTitle(search: string): Promise<AnilistMedia | undefined> {
  const query = `query ($search: String) { Page(perPage: 5) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${ANILIST_FIELDS} } } }`;
  try {
    const res = await fetchUpstream(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query, variables: { search } }),
      timeoutMs: 5000,
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: { Page?: { media?: AnilistMedia[] } } };
    return json.data?.Page?.media?.[0];
  } catch {
    return undefined;
  }
}

/**
 * 三级封面匹配（bgmlist 仅约一半条目带 aniList ID，需多级兜底）：
 * 1. AniList ID 批量精确匹配（sites.aniList）
 * 2. MyAnimeList ID 经 AniList idMal_in 反查（sites.mal）
 * 3. 标题搜索兜底：原生/罗马字标题 → 英文标题，按相关度取首个结果
 * 返回以 bgmlist item.id 为键的媒体信息表。
 *
 * 性能：第三级标题搜索最慢，采用「受限并发 + 整体截止时间」：
 * 同时最多 6 个搜索、组间仅 200ms 间隔，且整体在 deadline 前停止，
 * 未命中条目回退占位封面——保证首屏不无限变慢（结果缓存 30min）。
 */
async function resolveAnilistMedia(items: BgmlistItem[]): Promise<Map<number, AnilistMedia>> {
  const byItem = new Map<number, AnilistMedia>();

  // 第一级：AniList ID（各批次独立，并行拉取）
  const aniIdToItem = new Map<number, BgmlistItem>();
  for (const it of items) {
    const aid = siteId(it, 'aniList');
    if (aid) aniIdToItem.set(aid, it);
  }
  await Promise.all(
    chunk([...aniIdToItem.keys()], 40).map(async (group) => {
      for (const m of await queryAnilistByIds(group, 'id_in')) {
        const it = aniIdToItem.get(m.id);
        if (it) byItem.set(it.id, m);
      }
    }),
  );

  // 第二级：MAL ID 反查，补第一级未命中的条目（同样并行）
  const malIdToItem = new Map<number, BgmlistItem>();
  for (const it of items) {
    if (byItem.has(it.id)) continue;
    const mid = siteId(it, 'mal');
    if (mid && !malIdToItem.has(mid)) malIdToItem.set(mid, it);
  }
  await Promise.all(
    chunk([...malIdToItem.keys()], 40).map(async (group) => {
      for (const m of await queryAnilistByIds(group, 'idMal_in')) {
        const it = m.idMal != null ? malIdToItem.get(m.idMal) : undefined;
        if (it) byItem.set(it.id, m);
      }
    }),
  );

  // 第三级：标题搜索兜底。受限并发 + 小间隔，到 deadline 即停（未命中用占位封面）
  const rest = items.filter((it) => !byItem.has(it.id));
  const deadline = Date.now() + 8000; // 整体最多再花 8s，避免首屏卡死
  const POOL = 8;
  for (let i = 0; i < rest.length; i += POOL) {
    if (Date.now() > deadline) break;
    const group = rest.slice(i, i + POOL);
    await Promise.all(
      group.map(async (it) => {
        const candidates = [it.title, it.titleTranslate?.en?.[0]].filter(
          (t, idx, arr): t is string => !!t && arr.indexOf(t) === idx,
        );
        for (const c of candidates) {
          const m = await searchAnilistByTitle(c);
          if (m) {
            byItem.set(it.id, m);
            return;
          }
        }
      }),
    );
    if (i + POOL < rest.length) await sleep(200);
  }

  return byItem;
}

/** 无 broadcast 时按首播日期（JST）推导星期，仅作兜底 */
function weekdayFromDate(dateStr?: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr ?? '');
  if (!m) return undefined;
  const utc = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(utc)) return undefined;
  const day = new Date(utc + 9 * 3600 * 1000).getUTCDay();
  return day === 0 ? 7 : day;
}

export async function fetchBangumiCalendar(): Promise<Record<number, DoubanItem[]>> {
  const cached = getCache<Record<number, DoubanItem[]>>(BGMLIST_API);
  if (cached) return cached;

  const res = await fetchWithRetry(BGMLIST_API, {
    timeoutMs: 10000,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`新番放送表接口响应异常 (${res.status})`);

  const data = (await res.json()) as { items?: BgmlistItem[] };
  const rawItems = data.items ?? [];
  if (rawItems.length === 0) throw new Error('新番放送表数据为空');

  // 先过滤出有效条目（TV/WEB 番剧 + 可推导星期 + 有标题），再按需匹配封面
  const included = rawItems.filter((item) => {
    if (item.type && item.type !== 'tv' && item.type !== 'web') return false;
    if (!weekdayFromBroadcast(item.broadcast) && !weekdayFromDate(item.begin)) return false;
    return !!pickTitle(item);
  });

  const mediaMap = await resolveAnilistMedia(included);

  const days: Record<number, DoubanItem[]> = {};
  for (const item of included) {
    const weekday = weekdayFromBroadcast(item.broadcast) ?? weekdayFromDate(item.begin);
    if (!weekday) continue;

    const bangumiId = siteId(item, 'bangumi') ?? item.id;
    const media = mediaMap.get(item.id);
    const cover = media?.coverImage?.extraLarge || media?.coverImage?.large || PLACEHOLDER_COVER;

    const entry: DoubanItem = {
      id: `anime-${bangumiId}`,
      title: pickTitle(item),
      cover,
      rating: toRating(media?.averageScore),
      isTv: true,
    };
    (days[weekday] ??= []).push(entry);
  }

  if (Object.keys(days).length === 0) throw new Error('新番放送表数据为空');
  setCache(BGMLIST_API, days, CACHE_TTL);
  return days;
}
