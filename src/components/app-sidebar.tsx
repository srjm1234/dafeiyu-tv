'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icon';
import { HistoryPanel } from './history-panel';
import { SourceManagerDrawer } from './source-manager';
import { useBrandLogo } from './theme';

/**
 * 首页视图（左侧导航驱动的主内容区切换）。
 * home=信息流首页；分类视图接豆瓣/Bangumi 数据；rank=热榜；favorites=我的片单。
 */
export type HomeView = 'home' | 'movie' | 'tv' | 'variety' | 'anime' | 'documentary' | 'rank' | 'favorites';

interface NavItem {
  view: HomeView;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'home', label: '首页', icon: 'home' },
  { view: 'movie', label: '电影', icon: 'film' },
  { view: 'tv', label: '电视剧', icon: 'tv' },
  { view: 'variety', label: '综艺', icon: 'star' },
  { view: 'anime', label: '动漫', icon: 'fire' },
  { view: 'documentary', label: '纪录片', icon: 'globe' },
  { view: 'rank', label: '排行榜', icon: 'chart' },
  { view: 'favorites', label: '我的片单', icon: 'bookmark' },
];

function NavList({
  view,
  onNavigate,
  onOpenHistory,
  onOpenSettings,
}: {
  view: HomeView;
  onNavigate: (v: HomeView) => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = view === item.view;
        return (
          <button
            key={item.view}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              active
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:text-content hover:bg-hover'
            )}
            aria-current={active ? 'page' : undefined}
            onClick={() => onNavigate(item.view)}
          >
            <Icon name={item.icon} className="w-5 h-5 shrink-0" />
            {item.label}
          </button>
        );
      })}

      <div className="pt-4 mt-2 border-t border-line space-y-1">
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-content hover:bg-hover transition-colors"
          onClick={onOpenHistory}
        >
          <Icon name="clock" className="w-5 h-5 shrink-0" />
          观看历史
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-content hover:bg-hover transition-colors"
          onClick={onOpenSettings}
        >
          <Icon name="gear" className="w-5 h-5 shrink-0" />
          设置
        </button>
      </div>

      <div className="pt-4 mt-2 border-t border-line space-y-1">
        <Link
          href="/about"
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
            pathname === '/about' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-content hover:bg-hover'
          )}
        >
          <Icon name="alert" className="w-5 h-5 shrink-0" />
          关于
        </Link>
      </div>
    </nav>
  );
}

function BrandBlock() {
  const brandLogo = useBrandLogo();
  return (
    <Link href="/" className="flex items-center gap-2.5 px-4 h-16 shrink-0" aria-label="蓝色大肥鱼首页">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brandLogo} alt="蓝色大肥鱼" className="w-8 h-8 rounded-[9px]" />
      <span className="text-lg font-bold text-content tracking-tight brand-name">蓝色大肥鱼</span>
    </Link>
  );
}

/**
 * 左侧导航：lg 及以上常驻（w-60），小屏收为抽屉（由顶栏菜单按钮唤起）。
 * 观看历史 / 设置抽屉由本组件自持（与顶栏快捷入口各自独立，关闭态零渲染）。
 */
export function AppSidebar({
  view,
  onNavigate,
  mobileOpen,
  onMobileClose,
}: {
  view: HomeView;
  onNavigate: (v: HomeView) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const nav = (
    <NavList
      view={view}
      onNavigate={(v) => {
        onNavigate(v);
        onMobileClose();
      }}
      onOpenHistory={() => {
        setHistoryOpen(true);
        onMobileClose();
      }}
      onOpenSettings={() => {
        setSettingsOpen(true);
        onMobileClose();
      }}
    />
  );

  return (
    <>
      {/* 桌面常驻侧栏 */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-surface border-r border-line z-30">
        <BrandBlock />
        {nav}
        <div className="px-4 py-3 border-t border-line text-[11px] text-faint">优雅的私人影视库</div>
      </aside>

      {/* 移动端抽屉 */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onMobileClose} aria-hidden />
          <div className="relative h-full w-64 max-w-[80%] flex flex-col bg-surface border-r border-line shadow-2xl animate-drawer-in">
            <BrandBlock />
            {nav}
          </div>
        </div>
      )}

      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
