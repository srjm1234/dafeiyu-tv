'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { HeroCarousel } from './hero-carousel';
import { GuessLikeSection, MovieRecommendSection, RankAside, TrendingSection } from './home-sections';
import { EmptyState } from './states';
import type { HomeView } from './app-sidebar';

/**
 * 首页信息流（无搜索词时的主内容）：
 * Hero 轮播 → 正在热播 / 电影推荐（主列） + 热播榜 / 猜你喜欢（右侧栏，xl 以下堆叠到下方）。
 * Hero 与「猜你喜欢」共用同一份「电影·热门」查询（30 条）：一次请求供两处消费。
 */
export function HomeFeed({
  onPlay,
  onNavigate,
}: {
  onPlay: (title: string) => void;
  onNavigate: (view: HomeView) => void;
}) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);

  // Hero + 猜你喜欢共用的片池
  const poolQuery = useQuery({
    queryKey: ['douban', 'movie', '热门', 0, 30],
    queryFn: ({ signal }) => api.douban('movie', '热门', 0, 30, signal),
    staleTime: 5 * 60 * 1000,
  });
  // pool 与 heroItems 必须保持引用稳定：HeroCarousel 内部有依赖 items 的重置 effect，
  // 每次渲染传新数组会形成「effect → setState → 新数组 → effect」的死循环
  const pool = useMemo(() => poolQuery.data?.items ?? [], [poolQuery.data]);
  const heroItems = useMemo(() => pool.filter((i) => i.cover).slice(0, 5), [pool]);

  if (!doubanEnabled) {
    return (
      <EmptyState
        icon="film"
        title="豆瓣推荐已在设置中关闭"
        description="开启后首页将展示热门影片、热播榜与新番放送；也可直接在左上角搜索框查找影片"
      />
    );
  }

  return (
    <div className="space-y-7">
      {poolQuery.isLoading ? (
        <div className="rounded-2xl border border-line bg-card h-[300px] sm:h-[380px] lg:h-[440px] animate-pulse" />
      ) : (
        heroItems.length > 0 && <HeroCarousel items={heroItems} onPlay={onPlay} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-7">
        <div className="space-y-8 min-w-0">
          <TrendingSection onPlay={onPlay} onMore={() => onNavigate('rank')} />
          <MovieRecommendSection onPlay={onPlay} onMore={() => onNavigate('movie')} />
        </div>
        {/* 右侧栏：xl 及以上吸顶；小屏堆叠在主内容之后 */}
        <aside className="space-y-6 xl:sticky xl:top-[4.75rem] self-start">
          <RankAside onPlay={onPlay} />
          <GuessLikeSection pool={pool} onPlay={onPlay} />
        </aside>
      </div>
    </div>
  );
}
