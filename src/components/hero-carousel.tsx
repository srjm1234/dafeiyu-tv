'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DoubanItem } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { SmartImage } from './smart-image';
import { Icon } from './icon';

/** 自动播放间隔（ms）；悬停时暂停，离开恢复 */
const AUTOPLAY_MS = 5000;

/**
 * Hero 轮播图：16:9 大幅海报 + 左侧渐变遮罩文案区。
 * - 立即播放：按标题发起搜索（与卡片行为一致）；
 * - 收藏：切换「我的片单」；
 * - 左右箭头 + 底部 dots，自动播放（悬停暂停），切口圆角与大卡一致。
 */
export function HeroCarousel({ items, onPlay }: { items: DoubanItem[]; onPlay: (title: string) => void }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favorites = useAppStore((s) => s.favorites);
  // 派生 id 集合：直接 map 会让选择器每次返回新数组，导致任何 store 变化都重渲染
  const favoritedIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = items.length;
  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  // 数据变化（如切分类）时回到第一张，并重置加载失败态。
  // 依赖取 id 拼接而非数组本身：调用方即使传入新数组，只要内容没变就不重置
  const itemsKey = items.map((i) => i.id).join(',');
  useEffect(() => {
    setIndex(0);
    setImgFailed(false);
  }, [itemsKey]);

  useEffect(() => {
    if (paused || count <= 1) return;
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, count]);

  if (count === 0) return null;
  const item = items[Math.min(index, count - 1)];
  const favorited = favoritedIds.has(item.id);
  const meta = [
    item.isTv ? '电视剧' : '电影',
    item.rating ? `评分 ${item.rating}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      aria-label="热门推荐"
      className="relative overflow-hidden rounded-2xl border border-line bg-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
        {/* 背景海报：加载失败时退化为渐变底。
            豆瓣封面为 2:3 竖图，16:9 画幅下 object-cover 只会露出中部窄条，
            用 object-right 把竖图推到右侧，与左侧文案区各占一边 */}
        <div className="absolute inset-0">
          {item.cover && !imgFailed ? (
            <SmartImage
              key={item.id}
              url={item.cover}
              mode={imageProxyMode}
              customProxy={customImageProxy}
              alt={item.title}
              loading="eager"
              className="w-full h-full object-cover object-right scale-105"
              onExhausted={() => setImgFailed(true)}
            />
          ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/40 to-purple-600/40" />
        )}
        {/* 渐变遮罩：左侧压暗承托文案，底部与页面底色衔接 */}
        <div className="absolute inset-0 bg-gradient-to-r from-page via-page/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-page via-transparent to-transparent" />
      </div>

      {/* 文案区 */}
      <div className="relative flex flex-col justify-end min-h-[300px] sm:min-h-[380px] lg:min-h-[440px] p-6 sm:p-10 max-w-xl">
        <h1 className="text-2xl sm:text-4xl font-bold text-content mb-3 line-clamp-2" title={item.title}>
          {item.title}
        </h1>
        <p className="text-sm text-muted mb-5">{meta || '热门影片'}</p>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary px-5 py-2.5 text-sm font-medium"
            onClick={() => onPlay(item.title)}
          >
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
            立即播放
          </button>
          <button
            className={cn(
              'btn-ghost px-4 py-2.5 text-sm',
              favorited && '!text-accent !border-accent/40'
            )}
            onClick={() => toggleFavorite(item)}
          >
            <Icon name="bookmark" className={cn('w-4 h-4 mr-1', favorited && 'fill-current')} />
            {favorited ? '已收藏' : '收藏'}
          </button>
        </div>
      </div>

      {/* 左右箭头：半透明常显，悬停加深（触屏无 hover 也能操作） */}
      {count > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white hidden sm:flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity backdrop-blur-sm"
            aria-label="上一张"
            onClick={() => go(index - 1)}
          >
            <Icon name="chevronLeft" className="w-5 h-5" />
          </button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white hidden sm:flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity backdrop-blur-sm"
            aria-label="下一张"
            onClick={() => go(index + 1)}
          >
            <Icon name="chevronRight" className="w-5 h-5" />
          </button>
        </>
      )}

      {/* dots：激活项拉长为圆角短横条 */}
      {count > 1 && (
        <div className="absolute bottom-4 right-5 flex items-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.id}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === index ? 'w-6 bg-accent' : 'w-1.5 bg-white/40 hover:bg-white/60'
              )}
              aria-label={`第 ${i + 1} 张`}
              aria-current={i === index}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
