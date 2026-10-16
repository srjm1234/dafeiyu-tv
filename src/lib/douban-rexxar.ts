import type { DoubanItem } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import { runDoubanRequest } from './douban-guard';

/**
 * 豆瓣移动端合集（subject_collection）数据获取。
 *
 * 背景：旧版走 movie.douban.com/j/search_subjects 直连，数据中心出口 IP
 * 会被豆瓣间歇性限流——轻则返回残缺数据（少量条目），重则返回反爬页面
 * （非 JSON，解析即抛错），表现为「分类页加载慢、有概率失败」。
 *
 * m.douban.com 的 rexxar 合集接口是豆瓣自家 App 的数据通道：响应规范、
 * 无限流、单次 120~800ms，且合集由豆瓣官方维护（热映/最新/Top250/类型榜），
 * 内容质量高于随机标签。故分类浏览改以合集为主源，search_subjects 降级为补充。
 */

const REXXAR_API = 'https://m.douban.com/rexxar/api/v2/subject_collection';
const CACHE_TTL = 30 * 60 * 1000;
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

interface RexxarCover {
  url?: string;
  width?: number;
  height?: number;
}

interface RexxarRating {
  value?: number;
}

interface RexxarRawItem {
  id?: string | number;
  title?: string;
  type?: string;
  cover?: RexxarCover;
  rating?: RexxarRating;
}

interface RexxarResponse {
  start?: number;
  count?: number;
  total?: number;
  subject_collection_items?: RexxarRawItem[];
}

/** 合集条目 → DoubanItem；缺 id/标题/封面的脏数据丢弃 */
export function rexxarItemToItem(raw: RexxarRawItem): DoubanItem | undefined {
  const cover = raw.cover?.url;
  if (!raw.id || !raw.title || !cover) return undefined;
  return {
    id: String(raw.id),
    title: raw.title,
    cover,
    rating: raw.rating?.value && raw.rating.value > 0 ? raw.rating.value.toFixed(1) : undefined,
    isTv: raw.type === 'tv',
  };
}

/**
 * 拉取一个豆瓣合集的条目（支持 start 分页；合集 total 有限，越界返回空数组）。
 * 仅缓存「有内容」的响应——空结果往往是越界或异常，不占缓存。
 */
export async function fetchDoubanCollection(
  collectionId: string,
  start = 0,
  count = 50
): Promise<DoubanItem[]> {
  const safeCount = Math.min(50, Math.max(1, count));
  const cacheKey = `rexxar:${collectionId}:${start}:${safeCount}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached) return cached;

  // collectionId 走白名单式消毒：仅允许字母数字下划线，防路径注入
  if (!/^[a-z0-9_]+$/i.test(collectionId)) throw new Error('非法合集标识');

  // 豆瓣请求统一过守卫（串行 + 节流 + 退避），规避并发触发风控
  return runDoubanRequest(async () => {
    const res = await fetchUpstream(
      `${REXXAR_API}/${collectionId}/items?start=${start}&count=${safeCount}`,
      {
        timeoutMs: 6000,
        headers: {
          'User-Agent': IPHONE_UA,
          Referer: 'https://m.douban.com/movie/',
          Accept: 'application/json',
        },
      }
    );
    if (!res.ok) throw new Error(`豆瓣合集请求失败 (${res.status})`);

    const data = (await res.json()) as RexxarResponse;
    const items = (data.subject_collection_items ?? [])
      .map(rexxarItemToItem)
      .filter((item): item is DoubanItem => item !== undefined);

    if (items.length > 0) setCache(cacheKey, items, CACHE_TTL);
    return items;
  });
}
