'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';
import { MOVIE_TAGS, TV_TAGS, HOT_LISTS } from './douban-section';
import { PosterCard } from './poster-card';
import { Icon } from './icon';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export type CategoryViewId = 'movie' | 'tv' | 'variety' | 'anime' | 'documentary' | 'rank';

const VIEW_META: Record<CategoryViewId, { title: string; icon: 'film' | 'tv' | 'star' | 'fire' | 'globe' | 'chart' }> = {
  movie: { title: '电影', icon: 'film' },
  tv: { title: '电视剧', icon: 'tv' },
  variety: { title: '综艺', icon: 'star' },
  anime: { title: '动漫', icon: 'fire' },
  documentary: { title: '纪录片', icon: 'globe' },
  rank: { title: '排行榜', icon: 'chart' },
};

function subtitleOf(item: DoubanItem): string {
  return item.isTv ? '电视剧' : '电影';
}

/** 分类视图统一下标：卡片归属哪个分类就标哪个（ anime=动漫、variety=综艺…），不再统一标「电视剧」 */
function viewSubtitle(view: CategoryViewId): string {
  return VIEW_META[view].title;
}

/**
 * 分类视图：电影/电视剧/综艺/纪录片走豆瓣分类，动漫走 Bangumi 每日放送，排行榜走 60s 热榜。
 * 与首页信息流并列的第二种主内容形态（由左侧导航切换）。
 */
export function CategoryView({ view, onPlay }: { view: CategoryViewId; onPlay: (title: string) => void }) {
  const meta = VIEW_META[view];

  return (
    <section aria-label={meta.title}>
      <div className="flex items-center gap-2 mb-5">
        <Icon name={meta.icon} className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-bold text-content">{meta.title}</h1>
      </div>
      {view === 'anime' ? (
        <AnimeBoard onPlay={onPlay} />
      ) : view === 'rank' ? (
        <RankBoard onPlay={onPlay} />
      ) : (
        <DoubanBoard view={view} onPlay={onPlay} />
      )}
    </section>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-5">
      {options.map((o) => (
        <button
          key={o.id}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs transition-colors',
            o.id === value ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content hover:bg-hover'
          )}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Grid({
  items,
  onPlay,
  subtitle,
}: {
  items: DoubanItem[];
  onPlay: (title: string) => void;
  /** 固定下标（分类视图传入分类名）；不传则按条目类型显示 电影/电视剧 */
  subtitle?: string;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2.5">
      {items.map((item) => (
        <PosterCard key={item.id} item={item} onPlay={onPlay} subtitle={subtitle ?? subtitleOf(item)} />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2.5">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] rounded-xl bg-chip animate-pulse" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** 豆瓣分类榜（电影/电视剧/综艺/纪录片共用，标签集不同） */
function DoubanBoard({
  view,
  onPlay,
}: {
  view: 'movie' | 'tv' | 'variety' | 'documentary';
  onPlay: (title: string) => void;
}) {
  // 综艺/纪录片是 tv 类型下的固定标签；电影/电视剧给完整标签集（类型由视图决定，无切换）
  const fixedTag = view === 'variety' ? '综艺' : view === 'documentary' ? '纪录片' : undefined;
  const type = view === 'movie' ? 'movie' : 'tv';
  const [tag, setTag] = useState(fixedTag ?? '热门');

  const query = useQuery({
    queryKey: ['douban', type, tag],
    queryFn: ({ signal }) => api.douban(type, tag, 0, 50, signal),
    staleTime: 15 * 60 * 1000,
    // 切换标签时保留上一批内容，避免骨架屏闪烁（新数据静默替换）
    placeholderData: keepPreviousData,
  });

  const options = fixedTag
    ? [{ id: fixedTag, label: fixedTag }]
    : (type === 'movie' ? MOVIE_TAGS : TV_TAGS).map((t) => ({ id: t, label: t }));

  return (
    <>
      <ChipRow options={options} value={tag} onChange={setTag} />
      {query.isError ? (
        <p className="text-sm text-faint py-10 text-center">内容加载失败，请稍后重试</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <Grid items={query.data?.items ?? []} onPlay={onPlay} subtitle={viewSubtitle(view)} />
      )}
    </>
  );
}

/** 动漫：Bangumi 每日放送（星期筛选） */
function AnimeBoard({ onPlay }: { onPlay: (title: string) => void }) {
  const [weekday, setWeekday] = useState<number | 'all'>('all');
  const query = useQuery({
    queryKey: ['bangumi-calendar'],
    queryFn: ({ signal }) => api.bangumiCalendar(signal),
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const items =
    query.data && weekday === 'all'
      ? query.data.days.flatMap((d) => d.items)
      : (query.data?.days.find((d) => d.weekday === weekday)?.items ?? []);

  return (
    <>
      <ChipRow
        options={[{ id: 'all', label: '全部' }, ...WEEKDAYS.map((w, i) => ({ id: String(i + 1), label: w }))]}
        value={String(weekday)}
        onChange={(id) => setWeekday(id === 'all' ? 'all' : Number(id))}
      />
      {query.isError ? (
        <p className="text-sm text-faint py-10 text-center">新番放送表加载失败，请稍后重试</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <Grid items={items} onPlay={onPlay} subtitle="动漫" />
      )}
    </>
  );
}

/** 排行榜：60s 热榜（豆瓣周榜 + 百度热播剧） */
function RankBoard({ onPlay }: { onPlay: (title: string) => void }) {
  const [listId, setListId] = useState(HOT_LISTS[0].id);
  const query = useQuery({
    queryKey: ['hot-list', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <ChipRow options={HOT_LISTS.map((l) => ({ id: l.id, label: l.label }))} value={listId} onChange={setListId} />
      {query.isError ? (
        <p className="text-sm text-faint py-10 text-center">榜单加载失败，请稍后重试</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <Grid items={query.data?.items ?? []} onPlay={onPlay} />
      )}
    </>
  );
}
