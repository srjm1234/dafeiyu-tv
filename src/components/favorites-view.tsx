'use client';

import { useAppStore } from '@/lib/store';
import { PosterCard } from './poster-card';
import { EmptyState } from './states';
import { Icon } from './icon';

/** 我的片单：收藏的豆瓣影片网格；空态引导去首页收藏 */
export function FavoritesView({ onPlay }: { onPlay: (title: string) => void }) {
  const favorites = useAppStore((s) => s.favorites);
  const clearFavorites = useAppStore((s) => s.clearFavorites);

  return (
    <section aria-label="我的片单">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Icon name="bookmark" className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-content">我的片单</h1>
          <span className="text-sm text-faint">共 {favorites.length} 部</span>
        </div>
        {favorites.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={clearFavorites}>
            <Icon name="trash" className="w-3.5 h-3.5 mr-1" />
            清空
          </button>
        )}
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="片单还是空的"
          description="在首页或分类页点击海报左上角的书签图标，即可把影片加入这里"
        />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {favorites.map((item) => (
            <PosterCard key={item.id} item={item} onPlay={onPlay} subtitle={item.isTv ? '电视剧' : '电影'} />
          ))}
        </div>
      )}
    </section>
  );
}
