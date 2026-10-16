import type { DoubanItem } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import { fetchDoubanCollection } from './douban-rexxar';
import { runDoubanRequest } from './douban-guard';
import { fetchHotList, type HotListId } from './douban-weekly';

/**
 * 豆瓣推荐数据获取（服务端，带缓存与多级降级）。
 *
 * 历史问题：旧版只有 movie.douban.com/j/search_subjects 直连一条路，
 * 数据中心出口 IP 会被间歇性限流——轻则残缺（少量条目），重则反爬页面
 * （非 JSON 直接抛错），用户侧表现为分类页「加载极慢、有概率显示失败」。
 *
 * 现行四级链路（按序短路，任一级拿到有效数据即返回）：
 *   1. 豆瓣移动端合集（m.douban.com rexxar，官方 App 数据通道，无限流）
 *   2. search_subjects 直连（无合集映射的标签走此补充，残缺不采用）
 *   3. 同类型兜底合集（保底有内容，短缓存尽快重试主源）
 *   4. 60s API 豆瓣周榜（终极兜底）
 */

const DOUBAN_API = 'https://movie.douban.com/j/search_subjects';
/** 外层缓存 30min：与内层 rexxar 合集缓存同周期。榜单类数据变化慢，
 *  过短的外层 TTL 会让内层缓存空转（外层过期即重走整条降级链）。 */
const CACHE_TTL = 30 * 60 * 1000;
/** 兜底/残缺数据的短缓存：尽快过期重试主源，避免长时间卡在降级内容 */
const DEGRADED_TTL = 2 * 60 * 1000;
/** search_subjects 少于此数视为限流残缺（合集 total 均 >= 10，正常标签一次 50 条） */
const MIN_COMPLETE_ITEMS = 20;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface DoubanRawSubject {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url?: string;
}

/** 标签 → 豆瓣官方合集 id（实测可用，total 为合集总量） */
const COLLECTION_MAP: Record<string, string> = {
  // 电影
  'movie:热门': 'movie_hot_gaia', // 316 电影热播大数据榜
  'movie:最新': 'movie_latest', // 497 最新电影
  'movie:经典': 'movie_top250', // 250 Top250
  'movie:豆瓣高分': 'movie_top250',
  'movie:动作': 'movie_action',
  'movie:喜剧': 'movie_comedy',
  'movie:爱情': 'movie_love',
  'movie:科幻': 'movie_scifi',
  // 电视剧
  'tv:热门': 'tv_hot', // 247 热播剧集
  'tv:美剧': 'tv_american',
  'tv:韩剧': 'tv_korean',
  'tv:日剧': 'tv_japanese',
  'tv:日本动画': 'tv_animation',
  // 综艺 / 纪录片（category-view 以 type=tv + 固定标签进入）
  'tv:综艺': 'show_hot',
  'tv:纪录片': 'tv_documentary',
};

/** 各类型的兜底合集：主源缺失/失败时保底有内容可看 */
const FALLBACK_COLLECTION: Record<string, string> = {
  movie: 'movie_hot_gaia',
  tv: 'tv_hot',
};

/** 终极兜底：60s API 的豆瓣周榜（站内排行榜同款链路，已验证稳定） */
const HOTLIST_FALLBACK: Record<string, HotListId> = {
  movie: 'douban_movie_weekly',
  tv: 'douban_tv_chinese',
};

function fallbackProxies(): string[] {
  const proxies: string[] = [];
  if (process.env.FALLBACK_CORS_PROXY) proxies.push(process.env.FALLBACK_CORS_PROXY);
  return proxies;
}

/** search_subjects 直连 + 公共代理降级；失败返回空数组（由调用方决定后续降级） */
async function fetchSearchSubjects(
  type: 'movie' | 'tv',
  tag: string,
  pageStart: number,
  pageSize: number
): Promise<DoubanItem[]> {
  const target = `${DOUBAN_API}?type=${type}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageSize}&page_start=${pageStart}`;
  const toItems = (raw: DoubanRawSubject[] | undefined): DoubanItem[] =>
    (raw ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      cover: s.cover,
      rating: s.rate && s.rate !== '0' ? s.rate : undefined,
      isTv: type === 'tv',
    }));

  // 1) 服务端直连（快速失败：限流时豆瓣要么秒回反爬页要么拖超时，不宜久等）
  try {
    const items = await runDoubanRequest(async () => {
      const res = await fetchUpstream(target, {
        timeoutMs: 5000,
        headers: { 'User-Agent': UA, Referer: 'https://movie.douban.com/', Accept: 'application/json' },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { subjects?: DoubanRawSubject[] };
      return toItems(data.subjects);
    });
    if (items.length > 0) return items;
  } catch {
    // 走降级
  }

  // 2) 降级：经 FALLBACK_CORS_PROXY（部署者自配的代理；公共代理实测多不可用）
  for (const proxy of fallbackProxies()) {
    try {
      const res = await fetchUpstream(proxy + encodeURIComponent(target), {
        timeoutMs: 6000,
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as { subjects?: DoubanRawSubject[] };
        const items = toItems(data.subjects);
        if (items.length > 0) return items;
      }
    } catch {
      // 继续尝试下一个
    }
  }

  return [];
}

export async function fetchDoubanRecommend(
  type: 'movie' | 'tv',
  tag: string,
  pageStart: number,
  pageSize: number
): Promise<DoubanItem[]> {
  const cacheKey = `douban:${type}:${tag}:${pageStart}:${pageSize}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached) return cached;

  const count = Math.min(50, Math.max(1, pageSize));

  // 1) 合集主源（豆瓣官方 App 通道，无限流）
  const collectionId = COLLECTION_MAP[`${type}:${tag}`];
  if (collectionId) {
    try {
      const items = await fetchDoubanCollection(collectionId, pageStart, count);
      if (items.length > 0) {
        setCache(cacheKey, items, CACHE_TTL);
        return items;
      }
    } catch {
      // 落降级
    }
  }

  // 2) search_subjects 补充（华语/欧美/动画/英剧/港剧等无合集标签）
  const searchItems = await fetchSearchSubjects(type, tag, pageStart, count);
  if (searchItems.length >= MIN_COMPLETE_ITEMS) {
    setCache(cacheKey, searchItems, CACHE_TTL);
    return searchItems;
  }

  // 3) 兜底合集（与主源不同才值得再试）
  const fallbackId = FALLBACK_COLLECTION[type];
  if (fallbackId && fallbackId !== collectionId) {
    try {
      const items = await fetchDoubanCollection(fallbackId, 0, count);
      if (items.length > 0) {
        setCache(cacheKey, items, DEGRADED_TTL);
        return items;
      }
    } catch {
      // 落终极兜底
    }
  }

  // 4) search_subjects 的残缺结果优于空白（兜底合集也失败时）
  if (searchItems.length > 0) {
    setCache(cacheKey, searchItems, DEGRADED_TTL);
    return searchItems;
  }

  // 5) 终极兜底：60s API 豆瓣周榜
  const hotId = HOTLIST_FALLBACK[type];
  if (hotId) {
    try {
      const weekly = await fetchHotList(hotId);
      if (weekly.length > 0) {
        setCache(cacheKey, weekly, DEGRADED_TTL);
        return weekly;
      }
    } catch {
      // 全部失败
    }
  }

  throw new Error('豆瓣推荐获取失败');
}
