'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeMenu, useBrandLogo } from './theme';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { Icon } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { UserMenu } from './user-menu';
import { cn } from '@/lib/utils';

/**
 * 顶部导航：中央胶囊搜索框 + 右侧快捷入口（观看历史 / 通知 / 头像 / 主题菜单）。
 * 首页由左侧导航承载品牌与主要入口，此处 compact 模式下 lg 及以上不再重复显示 Logo；
 * 直播/关于页无左侧导航，保留「首页/关于」文字链接。
 */
export function Header({
  showSearch = false,
  compact = false,
  onMenu,
  onNavigateView,
}: {
  showSearch?: boolean;
  /** 首页：大屏隐藏 Logo（左侧导航已有），小屏仍显示 */
  compact?: boolean;
  /** 提供时显示移动端菜单按钮（唤起左侧导航抽屉） */
  onMenu?: () => void;
  /** 首页专用：用户菜单等入口切换左侧导航视图（如「我的片单」） */
  onNavigateView?: (view: 'favorites') => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  // 小屏搜索：点击搜索图标后全宽展开（内联搜索框仅 sm 及以上显示）
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 品牌 Logo：像素主题换用像素插画，其余主题用默认播放器图标
  const brandLogo = useBrandLogo();
  // 与首页搜索框共用同一套「最近搜索」下拉逻辑
  const searchHistory = useSearchHistory(query);

  // 移动端搜索展开时自动聚焦；Escape 关闭
  useEffect(() => {
    if (!mobileSearchOpen) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileSearchOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileSearchOpen]);

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    setMobileSearchOpen(false);
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    // 顶栏搜索一并写入最近搜索（此前只有首页会记录）
    searchHistory.record(q);
  };
  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-[1440px] mx-auto px-4 h-14 flex items-center gap-1 sm:gap-3">
          {/* 左：移动端菜单按钮 + 品牌（compact 模式大屏让位给左侧导航） */}
          {onMenu && (
            <button
              className="lg:hidden p-2 -ml-1 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
              title="菜单"
              aria-label="打开菜单"
              onClick={onMenu}
            >
              <Icon name="menu" className="w-5 h-5" />
            </button>
          )}
          <Link
            href="/"
            aria-label="蓝色大肥鱼首页"
            className={cn('flex items-center shrink-0', compact && 'lg:hidden')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogo} alt="蓝色大肥鱼" className="w-7 h-7 rounded-[8px]" />
            <span className="ml-2 text-base font-bold text-content hidden sm:block brand-name">蓝色大肥鱼</span>
          </Link>

          {/* 直播/关于页无左侧导航：保留文字入口 */}
          {!compact && (
            <nav className="hidden sm:flex items-center gap-1">
              <HeaderLink href="/" active={pathname === '/'}>
                首页
              </HeaderLink>
              <HeaderLink href="/about" active={pathname === '/about'}>
                关于
              </HeaderLink>
            </nav>
          )}

          {/* 中：胶囊搜索框。sm 及以上内联（可收缩）；小屏默认隐藏，
              点击右侧搜索图标后以全宽浮层展开，避免把右侧入口挤出屏幕。
              注意：浮层模式不能带 relative（会覆盖 fixed，导致浮层留在 flex 流里撑破布局）；
              高度用 100dvh 计算而非 bottom-0（header 的 backdrop-filter 会成为 fixed 包含块） */}
          {showSearch && (
            <div
              ref={searchHistory.containerRef}
              onClick={(e) => {
                // 浮层模式下，点击面板以外的遮罩区域关闭
                if (mobileSearchOpen && e.target === e.currentTarget) setMobileSearchOpen(false);
              }}
              className={cn(
                mobileSearchOpen
                  ? 'fixed inset-x-0 top-14 z-50 h-[calc(100dvh-3.5rem)] bg-page/80 px-4 pt-2 backdrop-blur-sm sm:hidden'
                  : 'relative mx-auto hidden min-w-0 flex-1 max-w-xl sm:block'
              )}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSearch(query);
                }}
              >
                <div
                  className={cn(
                    'flex items-center h-9 rounded-full bg-chip border transition-shadow',
                    searchHistory.visible
                      ? 'border-accent rounded-b-none rounded-t-xl'
                      : 'border-line focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40'
                  )}
                >
                  <Icon name="search" className="w-4 h-4 ml-3 text-faint shrink-0 pointer-events-none" />
                  <input
                    ref={inputRef}
                    className="flex-1 min-w-0 bg-transparent px-2 text-sm text-content placeholder:text-faint focus:outline-none"
                    aria-label="搜索影片"
                    placeholder="搜索电影、电视剧、综艺、动漫..."
                    value={query}
                    maxLength={100}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      searchHistory.resetActive();
                    }}
                    onFocus={searchHistory.onFocus}
                    onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                    role="combobox"
                    aria-expanded={searchHistory.visible}
                    aria-controls="header-search-history"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      searchHistory.visible && searchHistory.activeIndex >= 0
                        ? `header-search-history-${searchHistory.activeIndex}`
                        : undefined
                    }
                  />
                  {query && (
                    <button
                      type="button"
                      className="shrink-0 p-1 rounded-full text-faint hover:text-content transition-colors"
                      onClick={() => {
                        setQuery('');
                        searchHistory.resetActive();
                      }}
                      aria-label="清空"
                    >
                      <Icon name="close" className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="shrink-0 mr-1 px-3 h-7 rounded-full bg-accent text-on-accent text-xs font-medium hover:bg-accent-hover transition-colors"
                  >
                    搜索
                  </button>
                </div>
              </form>

              {searchHistory.visible && (
                <SearchHistoryDropdown
                  id="header-search-history"
                  matches={searchHistory.matches}
                  activeIndex={searchHistory.activeIndex}
                  onPick={pickHistory}
                  onRemove={searchHistory.remove}
                  onClearAll={searchHistory.clearAll}
                />
              )}

              {mobileSearchOpen && (
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(false)}
                  className="mt-2 w-full rounded-md py-2 text-sm text-muted transition-colors hover:text-content"
                >
                  取消
                </button>
              )}
            </div>
          )}

          <div className="flex-1 sm:hidden" />

          {/* 右：快捷入口 */}
          <nav className="flex items-center gap-0.5 sm:gap-1 ml-auto">
            <IconButton label="观看历史" onClick={() => setHistoryOpen(true)}>
              <Icon name="clock" />
            </IconButton>
            {showSearch && !mobileSearchOpen && (
              <button
                className="sm:hidden p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
                title="搜索"
                aria-label="搜索"
                onClick={() => setMobileSearchOpen(true)}
              >
                <Icon name="search" />
              </button>
            )}
            <UserMenu
              onNavigate={onNavigateView ? () => onNavigateView('favorites') : () => router.push('/')}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            {/* 主题切换入口较低频，小屏让位（设置内仍可切换） */}
            <span className="hidden sm:block">
              <ThemeMenu />
            </span>
          </nav>
        </div>
      </header>

      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

function HeaderLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'px-2.5 py-1.5 rounded-md text-sm transition-colors',
        active ? 'text-content bg-hover' : 'text-muted hover:text-content'
      )}
    >
      {children}
    </Link>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
