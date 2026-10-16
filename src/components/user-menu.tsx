'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { Icon, type IconName } from './icon';
import { cn } from '@/lib/utils';

/**
 * 用户头像菜单：头像（默认女仆插画 avatar.png）+ 浮层。
 * - 顶部展示本地用户；
 * - 我的片单 / 观看历史 / 设置 与左侧导航、顶栏图标互通；
 * - 退出登录：清除本站密码会话（蓝色大肥鱼影院无账号体系，仅为站点访问密码）。
 */
export function UserMenu({
  onNavigate,
  onOpenHistory,
  onOpenSettings,
}: {
  onNavigate: (view: 'favorites') => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const favoritesCount = useAppStore((s) => s.favorites.length);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items: { icon: IconName; label: string; hint?: string; onClick: () => void }[] = [
    { icon: 'bookmark', label: '我的片单', hint: `${favoritesCount} 部`, onClick: () => onNavigate('favorites') },
    { icon: 'clock', label: '观看历史', onClick: onOpenHistory },
    { icon: 'gear', label: '设置', onClick: onOpenSettings },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-105',
          'bg-gradient-to-br from-accent to-purple-500 text-white',
          open && 'ring-2 ring-accent/50'
        )}
        title="用户菜单"
        aria-label="用户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/avatar.png" alt="" className="w-full h-full rounded-full object-cover" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-line bg-surface-raised shadow-xl py-1.5 animate-fade-in"
        >
          {/* 用户信息头 */}
          <div className="px-3.5 py-2.5 border-b border-line mb-1">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/avatar.png" alt="用户头像" className="w-full h-full object-cover" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-content truncate">本地用户</p>
              </div>
            </div>
          </div>

          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted hover:text-content hover:bg-hover transition-colors"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              <Icon name={it.icon} className="w-4 h-4" />
              <span className="flex-1 text-left">{it.label}</span>
              {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
            </button>
          ))}

          <div className="border-t border-line mt-1 pt-1">
            <button
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted hover:text-content hover:bg-hover transition-colors"
              onClick={async () => {
                setOpen(false);
                try {
                  await api.logout();
                  toast('已退出登录', 'success');
                  router.push('/');
                  router.refresh();
                } catch {
                  toast('退出失败，请稍后重试', 'warning');
                }
              }}
            >
              <Icon name="arrowRight" className="w-4 h-4 rotate-180" />
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
