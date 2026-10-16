'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DoubanItem } from '@/lib/types';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { PosterCard } from './poster-card';
import { Icon, type IconName } from './icon';
import { SmartImage } from './smart-image';
import { useAppStore } from '@/lib/store';

/** 模块标题：左侧 accent 竖线 + 图标 + 文案 + 右侧可选操作 */
export function SectionHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon: IconName;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-content">
        <span className="w-1 h-5 rounded-full bg-accent" aria-hidden />
        <Icon name={icon} className="w-5 h-5 text-accent" />
        {title}
      </h2>
      {action}
    </div>
  );
}

function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] rounded-xl bg-chip animate-pulse" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function subtitleOf(item: DoubanItem): string {
  return item.isTv ? '电视剧' : '电影';
}

/** 正在热播：百度热播剧 + 状态标签（剧集=蓝「连载中」/电影=橙「热映中」） */
export function TrendingSection({ onPlay, onMore }: { onPlay: (title: string) => void; onMore?: () => void }) {
  const query = useQuery({
    queryKey: ['hot-list', 'baidu_teleplay'],
    queryFn: ({ signal }) => api.hotList('baidu_teleplay', signal),
    staleTime: 5 * 60 * 1000,
  });
  const items = (query.data?.items ?? []).slice(0, 6);

  return (
    <section aria-label="正在热播">
      <SectionHeader
        title="正在热播"
        icon="fire"
        action={
          onMore && (
            <button className="text-xs text-muted hover:text-accent transition-colors flex items-center gap-0.5" onClick={onMore}>
              查看更多 <Icon name="chevronRight" className="w-3.5 h-3.5" />
            </button>
          )
        }
      />
      {query.isError ? (
        <p className="text-sm text-faint py-6">热播内容加载失败，请稍后重试</p>
      ) : query.isLoading ? (
        <GridSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {items.map((item) => (
            <PosterCard key={item.id} item={item} onPlay={onPlay} subtitle={subtitleOf(item)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 电影推荐：豆瓣高分电影网格，金黄评分 */
export function MovieRecommendSection({ onPlay, onMore }: { onPlay: (title: string) => void; onMore?: () => void }) {
  const query = useQuery({
    queryKey: ['douban', 'movie', '豆瓣高分'],
    queryFn: ({ signal }) => api.douban('movie', '豆瓣高分', 0, 12, signal),
    staleTime: 5 * 60 * 1000,
  });
  const items = query.data?.items ?? [];

  return (
    <section aria-label="电影推荐">
      <SectionHeader
        title="电影推荐"
        icon="film"
        action={
          onMore && (
            <button className="text-xs text-muted hover:text-accent transition-colors flex items-center gap-0.5" onClick={onMore}>
              查看更多 <Icon name="chevronRight" className="w-3.5 h-3.5" />
            </button>
          )
        }
      />
      {query.isError ? (
        <p className="text-sm text-faint py-6">推荐内容加载失败，请稍后重试</p>
      ) : query.isLoading ? (
        <GridSkeleton count={12} />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          {items.map((item) => (
            <PosterCard key={item.id} item={item} onPlay={onPlay} subtitle={subtitleOf(item)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 排名徽章配色：第一橙、第二红、第三绿，其余中性（按设计稿） */
function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-orange-500 text-white';
  if (rank === 2) return 'bg-red-500 text-white';
  if (rank === 3) return 'bg-green-500 text-white';
  return 'bg-chip text-muted';
}

/** 右侧栏：热播榜（豆瓣电影周榜 Top 10） */
export function RankAside({ onPlay }: { onPlay: (title: string) => void }) {
  const query = useQuery({
    queryKey: ['hot-list', 'douban_movie_weekly'],
    queryFn: ({ signal }) => api.hotList('douban_movie_weekly', signal),
    staleTime: 5 * 60 * 1000,
  });
  const items = (query.data?.items ?? []).slice(0, 10);

  return (
    <section aria-label="热播榜" className="bg-card border border-line rounded-2xl p-4">
      <SectionHeader title="热播榜" icon="chart" />
      {query.isError ? (
        <p className="text-sm text-faint py-4">榜单加载失败</p>
      ) : query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-chip animate-pulse" />
              <div className="flex-1 h-3 rounded bg-chip animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <ol className="space-y-1">
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                className="group flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-hover"
                onClick={() => onPlay(item.title)}
              >
                <span
                  className={cn(
                    'w-6 h-6 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold',
                    rankBadgeClass(i + 1)
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content truncate group-hover:text-accent transition-colors" title={item.title}>
                    {item.title}
                  </span>
                  {item.rating && <span className="text-[11px] text-rating">★ {item.rating}</span>}
                </span>
                {item.cover && (
                  <span className="relative w-9 h-12 shrink-0 rounded-lg overflow-hidden bg-chip">
                    <RankThumb item={item} />
                  </span>
                )}              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RankThumb({ item }: { item: DoubanItem }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [failed, setFailed] = useState(false);
  if (failed || !item.cover) {
    return (
      <span className="absolute inset-0 flex items-center justify-center">
        <Icon name="film" className="w-4 h-4 text-faint" />
      </span>
    );
  }
  return (
    <SmartImage
      url={item.cover}
      mode={imageProxyMode}
      customProxy={customImageProxy}
      alt={item.title}
      className="w-full h-full object-cover"
      onExhausted={() => setFailed(true)}
    />
  );
}

/** 右侧栏：猜你喜欢（从传入片单池随机取 6 部，池变化时重新洗牌） */
export function GuessLikeSection({ pool, onPlay }: { pool: DoubanItem[]; onPlay: (title: string) => void }) {
  const picks = useMemo(() => {
    const withCover = pool.filter((i) => i.cover);
    if (withCover.length <= 6) return withCover;
    // Fisher-Yates 洗牌后取前 6
    const arr = [...withCover];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 6);
  }, [pool]);

  if (picks.length === 0) return null;

  return (
    <section aria-label="猜你喜欢" className="bg-card border border-line rounded-2xl p-4">
      <SectionHeader title="猜你喜欢" icon="heart" />
      <div className="grid grid-cols-3 gap-2.5">
        {picks.map((item) => (
          <PosterCard key={item.id} item={item} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}
