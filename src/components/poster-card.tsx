'use client';

import { useEffect, useState } from 'react';
import type { DoubanItem } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { SmartImage } from './smart-image';
import { Icon } from './icon';

/**
 * 海报卡片（首页各模块共用）：
 * - 金黄评分徽章（有评分时显示）；
 * - 左上角书签按钮：悬停常显、已收藏时保持高亮，点击切换「我的片单」；
 * - 悬停放大 + 中央播放按钮遮罩，点击整卡按标题发起搜索。
 */
export function PosterCard({
  item,
  onPlay,
  subtitle,
  className,
}: {
  item: DoubanItem;
  onPlay: (title: string) => void;
  /** 标题下方的次要信息（如「电视剧 · 2024」）；缺省时用评分占位 */
  subtitle?: string;
  className?: string;
}) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favorited = useAppStore((s) => s.favorites.some((f) => f.id === item.id));
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [item.cover, item.id]);

  const activate = () => onPlay(item.title);

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-xl bg-card border border-line overflow-hidden',
        'transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-black/30 hover:border-accent/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        className
      )}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        // 阻止空格触发页面滚动（与既有卡片一致）
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div className="relative aspect-[2/3] bg-chip">
        {item.cover && !imgFailed ? (
          <SmartImage
            url={item.cover}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.title}
            className="w-full h-full object-cover"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="film" className="w-8 h-8 text-faint" />
          </div>
        )}

        {/* 评分徽章：金黄数字 + 半透明黑底 */}
        {item.rating && (
          <span className="absolute top-1.5 right-1.5 tag bg-black/70 text-rating font-semibold backdrop-blur-sm">
            ★ {item.rating}
          </span>
        )}

        {/* 收藏书签：悬停常显；已收藏时保持高亮 */}
        <button
          className={cn(
            'absolute top-1.5 left-1.5 p-1.5 rounded-lg transition-all backdrop-blur-sm',
            'bg-black/60 hover:bg-black/80',
            favorited ? 'opacity-100 text-accent' : 'opacity-0 group-hover:opacity-100 text-white/80 hover:text-white',
            // 触屏无 hover：已收藏的始终可见
            favorited && 'opacity-100'
          )}
          title={favorited ? '取消收藏' : '加入我的片单'}
          aria-label={favorited ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(item);
          }}
        >
          <Icon name="bookmark" className={cn('w-3.5 h-3.5', favorited && 'fill-current')} />
        </button>

        {/* 悬停播放遮罩：纯装饰，不接收指针事件（否则会盖住左上角收藏按钮的点击） */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none">
          <span className="w-10 h-10 rounded-full bg-accent/90 flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      </div>

      <div className="px-2 py-1.5">
        <div className="text-xs font-medium text-content truncate" title={item.title}>
          {item.title}
        </div>
        {subtitle && <div className="text-[11px] text-faint truncate">{subtitle}</div>}
      </div>
    </div>
  );
}
