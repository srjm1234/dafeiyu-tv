'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { AppSidebar, type HomeView } from '@/components/app-sidebar';
import { HomeFeed } from '@/components/home-feed';
import { CategoryView, type CategoryViewId } from '@/components/category-view';
import { FavoritesView } from '@/components/favorites-view';
import { DetailModal } from '@/components/detail-modal';
import { AggregatedCard, aggregateResults } from '@/components/video-card';
import { useAppStore, resolveSource, isInDisabledSubscription, isSourceDisabled, getActivePrivateSources } from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SearchResultItem, SourceSearchOutcome } from '@/lib/types';
import { formatDisableTtl, validateSourceUrl } from '@/lib/utils';
import { useToast } from '@/components/toast';
import { EmptyState } from '@/components/states';
import { SiteFooter } from '@/components/site-footer';

/**
 * 首页：左侧导航（视图切换）+ 顶部搜索（URL ?s= 驱动，可后退/分享）+ 主内容信息流 + 右侧栏。
 * 搜索状态由 React Query 管理，失败源在结果区顶部以非阻塞方式展示。
 */
/** 搜索结果分批渲染的批大小：一次挂载上千张卡片会明显掉帧 */
const RESULT_PAGE_SIZE = 60;

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const urlQuery = searchParams.get('s') || '';
  // 精确订阅所需字段（对齐 live 页的做法）：搜索流式期间逐源写健康度、
  // 打开设置抽屉/历史面板等无关 store 变化，都不应触发首页整树重渲染
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const privateSources = useAppStore((s) => s.privateSources);
  const privateEnabledKeys = useAppStore((s) => s.privateEnabledKeys);
  const privateUnlocked = useAppStore((s) => s.privateUnlocked);
  const privateGlobalEnabled = useAppStore((s) => s.privateGlobalEnabled);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const [view, setView] = useState<HomeView>('home');
  const [navOpen, setNavOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);
  /** 流式搜索中已结算的源（data 就绪前用于增量渲染） */
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);

  // 切换左侧导航视图时清掉搜索词：结果区与视图二选一，避免「在电影分类里显示搜索结果」的错位
  const navigate = (v: HomeView) => {
    if (urlQuery) router.push('/', { scroll: false });
    setView(v);
  };

  // URL 驱动搜索：?s= 变化时视为一次新搜索，回到首页视图
  useEffect(() => {
    if (urlQuery) setView('home');
  }, [urlQuery]);

  // 分类预取：首页加载稳定后，后台静默拉取四个分类的默认标签数据，
  // 用户点击「电影/电视剧/综艺/纪录片」时 react-query 缓存直接命中（服务端启动也有预热兜底）
  const queryClient = useQueryClient();
  useEffect(() => {
    const timer = setTimeout(() => {
      const warm: Array<['movie' | 'tv', string]> = [
        ['movie', '热门'],
        ['tv', '热门'],
        ['tv', '综艺'],
        ['tv', '纪录片'],
      ];
      for (const [type, tag] of warm) {
        void queryClient.prefetchQuery({
          queryKey: ['douban', type, tag],
          queryFn: ({ signal }) => api.douban(type, tag, 0, 50, signal),
          staleTime: 15 * 60 * 1000,
        });
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [queryClient]);

  // 源名回显：失败/停用提示里显示友好名称而非裸 key
  const sourceName = (key: string) =>
    customAPIs.find((a) => a.key === key)?.name ??
    envSources.find((a) => a.key === key)?.name ??
    privateSources.find((a) => a.key === key)?.name ??
    key;

  const selectedSources = useMemo(() => {
    // selectedKeys 可能含历史残留的重复 key：按 key 去重，避免同源重复搜索
    const seen = new Set<string>();
    const base = selectedKeys
      .map((key) => resolveSource({ customAPIs, envSources }, key))
      .filter((s): s is NonNullable<typeof s> => {
        if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      })
      // 自动停用期内的源不参与搜索（到期自动恢复）
      .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
      // 所属订阅被整体停用的源同样跳过（无损：各源勾选状态保留，重新启用即恢复）
      .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key));
    // 私密源：已解锁且对全站生效时，按启用开关并入（不走 selectedKeys；未解锁或关闭全站生效时自然为空）
    const privateActive = getActivePrivateSources({
      privateSources,
      privateUnlocked,
      privateEnabledKeys,
      privateGlobalEnabled,
    });
    for (const s of privateActive) {
      if (validateSourceUrl(s.url) && !seen.has(s.key)) {
        seen.add(s.key);
        base.push(s);
      }
    }
    return base;
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions, privateSources, privateEnabledKeys, privateUnlocked, privateGlobalEnabled]);
  const disabledSources = useMemo(
    () => selectedKeys.filter((key) => isSourceDisabled({ sourceHealth }, key)),
    [selectedKeys, sourceHealth]
  );
  // 来自已关闭订阅的源：勾选状态还在，但本次搜索用不到，必须明确告知
  const offSubscriptionSources = useMemo(
    () =>
      selectedKeys.filter(
        (key) => !isSourceDisabled({ sourceHealth }, key) && isInDisabledSubscription({ subscriptions }, key)
      ),
    [selectedKeys, sourceHealth, subscriptions]
  );

  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, selectedKeys, yellowFilter],
    // 与 runSearch 的截断规则保持一致：顶栏搜索 / 手动构造长链接不会绕过上限
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        // 逐源结算即更新：结果边搜边渲染，同时滚动健康度
        onSource: (outcome) => {
          setStreamedOutcomes((prev) => [...prev, outcome]);
          for (const ev of useAppStore.getState().recordSourceHealth([outcome])) {
            toast(
              ev.permanent
                ? `「${sourceName(ev.key)}」多次失败，已停止参与搜索，可在设置中恢复`
                : `「${sourceName(ev.key)}」连续超时/失败，已停用 ${formatDisableTtl(ev.ttlMs ?? 0)}`,
              'warning'
            );
          }
        },
      });
    },
    enabled: Boolean(urlQuery) && selectedSources.length > 0,
    // 5 分钟内从播放页返回时直接使用缓存，不重新搜索（服务端另有 60s 结果缓存兜底）
    staleTime: 300_000,
  });

  const runSearch = (q: string) => {
    const query = q.trim().slice(0, 100);
    if (!query) return;
    if (selectedSources.length === 0) {
      toast('请先在设置中添加并勾选点播源', 'warning');
      return;
    }
    setView('home');
    router.push(`/?s=${encodeURIComponent(query)}`, { scroll: false });
  };

  const isSearching = Boolean(urlQuery) && searchQuery.isFetching && !searchQuery.data;
  // 聚合数据未就绪时，用已结算源的结果增量渲染（健康源不再等坏源超时）
  const streamedList = useMemo(
    () => streamedOutcomes.flatMap((o) => o.list),
    [streamedOutcomes]
  );
  const list = useMemo(
    () => searchQuery.data?.list ?? (isSearching ? streamedList : []),
    [searchQuery.data, isSearching, streamedList]
  );
  const failures =
    searchQuery.data?.failures ??
    streamedOutcomes
      .filter((o) => !o.ok)
      .map((o) => ({ sourceKey: o.sourceKey, error: o.error || '请求失败', timedOut: o.timedOut }));
  // 跨源同名聚合：同名影片合并为一张卡片，展开后可选择具体来源
  const allGroups = useMemo(() => aggregateResults(list), [list]);

  // 筛选维度：年份 / 分类（均从当前结果中提取，随结果变化）
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  // 排序：默认按时间（年份倒序，无年份的排最后）
  const [sortBy, setSortBy] = useState<'time' | 'default'>('time');

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of allGroups) if (g.year) set.add(g.year);
    return [...set].sort((a, b) => Number(b) - Number(a)); // 新→旧
  }, [allGroups]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of allGroups) if (g.typeName) set.add(g.typeName);
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [allGroups]);

  // 搜索词变化时重置筛选，避免上一次的条件误伤新结果
  useEffect(() => {
    setFilterYear('all');
    setFilterType('all');
  }, [urlQuery]);

  /** 筛选前的总数（用于「筛选出 X / Y 部」提示） */
  const groupsAll = allGroups;
  const groups = useMemo(() => {
    let next = allGroups;
    if (filterYear !== 'all') next = next.filter((g) => g.year === filterYear);
    if (filterType !== 'all') next = next.filter((g) => g.typeName === filterType);
    if (sortBy === 'time') {
      // 按时间排序：年份倒序；同年按名称，无年份的排在最后
      next = next.slice().sort((a, b) => {
        const ay = Number(a.year) || 0;
        const by = Number(b.year) || 0;
        if (ay !== by) return by - ay;
        return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
      });
    }
    return next;
  }, [allGroups, filterYear, filterType, sortBy]);

  // 分批渲染：新一次搜索（groups 变化）时重置回首批
  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE_SIZE);
  const visibleGroups = useMemo(() => groups.slice(0, visibleCount), [groups, visibleCount]);
  useEffect(() => setVisibleCount(RESULT_PAGE_SIZE), [groups]);

  const onPlay = (title: string) => runSearch(title);

  return (
    <div className="min-h-screen flex flex-col lg:pl-60">
      <AppSidebar
        view={view}
        onNavigate={navigate}
        mobileOpen={navOpen}
        onMobileClose={() => setNavOpen(false)}
      />

      <Header
        showSearch
        compact
        onMenu={() => setNavOpen(true)}
        onNavigateView={(v) => navigate(v)}
      />

      <main className="relative flex-1 w-full max-w-[1440px] mx-auto px-4 py-5">
        {/* 首屏氛围光（暗色下极淡的顶部辉光） */}
        {!urlQuery && view === 'home' && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10"
            style={{
              background:
                'radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0.03) 45%, transparent 75%)',
            }}
          />
        )}

        {urlQuery ? (
          /* 搜索结果 */
          <section aria-label="搜索结果" className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-sm text-muted">
                “<span className="text-content">{urlQuery}</span>” 的搜索结果
                {isSearching ? (
                  <span className="text-faint">
                    （已就绪 {streamedOutcomes.length}/{selectedSources.length} 个源…）
                  </span>
                ) : (
                  searchQuery.data && (
                    <span className="text-faint">
                      （{groups.length} 部影片 · {list.length} 条结果{failures.length > 0 && `，${failures.length} 个源失败`}）
                    </span>
                  )
                )}
              </h1>
            </div>

            {/* 结果筛选：年份 / 分类，并按时间排序（默认） */}
            {groupsAll.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-faint">年份</span>
                  <select
                    className="input py-1 px-2 text-xs"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    aria-label="按年份筛选"
                  >
                    <option value="all">全部</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-faint">分类</span>
                  <select
                    className="input py-1 px-2 text-xs"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    aria-label="按分类筛选"
                  >
                    <option value="all">全部</option>
                    {typeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-faint">排序</span>
                  <select
                    className="input py-1 px-2 text-xs"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'time' | 'default')}
                    aria-label="结果排序"
                  >
                    <option value="time">时间（最新优先）</option>
                    <option value="default">默认（相关度）</option>
                  </select>
                </div>

                {(filterYear !== 'all' || filterType !== 'all') && (
                  <button
                    className="btn-ghost btn-xs"
                    onClick={() => {
                      setFilterYear('all');
                      setFilterType('all');
                    }}
                  >
                    清除筛选
                  </button>
                )}
                <span className="text-faint ml-auto">
                  筛选出 {groups.length} / {groupsAll.length} 部
                </span>
              </div>
            )}

            {failures.length > 0 && (
              <div className="mb-3 text-xs bg-chip rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-faint">{isSearching ? '以下源暂时无响应：' : '部分点播源请求失败：'}</span>
                {failures.map((f) => (
                  <span key={f.sourceKey} className={f.timedOut ? 'text-warning' : 'text-faint'}>
                    {f.timedOut ? '⏱' : '✗'} {sourceName(f.sourceKey)}
                    {f.timedOut ? ' 超时' : ''}
                  </span>
                ))}
              </div>
            )}

            {disabledSources.length > 0 && (
              <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
                {disabledSources.length} 个源因连续超时/失败已暂停参与搜索（临时停用的到期自动恢复，
                长期停用的需在设置中手动恢复）：{disabledSources.map((key) => sourceName(key)).join('、')}
              </div>
            )}

            {offSubscriptionSources.length > 0 && (
              <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
                {offSubscriptionSources.length} 个源所属的订阅已停用，未参与本次搜索（在设置 → 数据源订阅中可重新启用）：
                {offSubscriptionSources.map((key) => sourceName(key)).join('、')}
              </div>
            )}

            {selectedSources.length === 0 ? (
              <NoSourceGuide hasSources={customAPIs.length > 0 || envSources.length > 0} />
            ) : list.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                  {visibleGroups.map((group) => (
                    <AggregatedCard
                      key={group.key}
                      group={group}
                      onOpen={(item) => setDetailItem(item)}
                    />
                  ))}
                </div>
                {groups.length > visibleCount && (
                  <div className="flex justify-center mt-4">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setVisibleCount((v) => v + RESULT_PAGE_SIZE)}
                    >
                      加载更多（还有 {groups.length - visibleCount} 部）
                    </button>
                  </div>
                )}
              </>
            ) : isSearching ? (
              <ResultsSkeleton />
            ) : (
              <EmptyState
                icon="search"
                title="没有找到匹配的结果"
                description="请尝试其他关键词或更换点播源"
                className="!py-16"
              />
            )}
          </section>
        ) : view === 'home' ? (
          <HomeFeed onPlay={onPlay} onNavigate={navigate} />
        ) : view === 'favorites' ? (
          <FavoritesView onPlay={onPlay} />
        ) : (
          <CategoryView view={view as CategoryViewId} onPlay={onPlay} />
        )}
      </main>

      <SiteFooter />

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        // 结构对齐真实结果卡（左侧缩略图 + 右侧文字块），避免占位与真实卡片形状不符
        <div key={i} className="card flex h-28 overflow-hidden">
          <div className="w-[105px] sm:w-[120px] shrink-0 bg-chip animate-pulse" />
          <div className="flex-1 p-2.5 space-y-2">
            <div className="h-4 w-3/4 rounded bg-chip animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-chip animate-pulse" />
            <div className="h-3 w-full rounded bg-chip animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 无点播源 / 未勾选点播源时的引导（替代旧版首屏静默空白） */
function NoSourceGuide({ hasSources = false }: { hasSources?: boolean }) {
  return (
    <div className="border border-dashed border-line rounded-xl p-10 text-center max-w-lg mx-auto">
      <h3 className="text-content font-medium mb-2">{hasSources ? '尚未勾选点播源' : '先添加一个点播源'}</h3>
      <p className="text-sm text-muted leading-relaxed">
        {hasSources ? (
          <>点击左上角「设置」，勾选要参与搜索的点播源后重新搜索。</>
        ) : (
          <>
            蓝色大肥鱼影院不内置任何采集站。点击左上角「设置 → 添加 API」，填入一个
            Apple CMS 采集站地址（如 <code className="text-accent text-xs">https://example.com/api.php/provide/vod</code>），
            勾选后即可开始搜索。
          </>
        )}
      </p>
    </div>
  );
}
