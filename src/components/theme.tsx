'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icon';
import { cn } from '@/lib/utils';

/**
 * 主题上下文：paper（纸质蓝，默认）/ light / dark / pixel（紫罗兰像素）/ system，
 * 持久化到 localStorage。
 * - paper 为浅色系变体：html 挂 .paper 类，globals.css 中 .paper 规则覆盖默认板，
 *   并叠加网格纸面、白纸卡片、马克笔高亮等手绘装饰（html.paper 作用域隔离）；
 * - pixel 为暗色系变体：html 上同时挂 .dark 与 .pixel 两个类。
 * html 上的类由 layout 中的内联脚本先行设置（避免首屏闪烁），此处负责后续切换。
 */

export type ThemeChoice = 'paper' | 'light' | 'dark' | 'pixel' | 'system';
const STORAGE_KEY = 'libretv-theme';
const DEFAULT_THEME: ThemeChoice = 'paper';

/** 像素主题品牌资产（其余主题用默认播放器图标） */
const PIXEL_LOGO = '/icons/pixel-logo.png';
const PIXEL_FAVICON = '/icons/pixel-favicon.png';
/** 纸质主题品牌资产（蓝发动漫少女插画） */
const PAPER_LOGO = '/icons/paper-logo.png';
const PAPER_FAVICON = '/icons/paper-favicon.png';
const DEFAULT_FAVICON = '/favicon.ico';

interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'paper',
  resolved: 'light',
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(choice: ThemeChoice): 'light' | 'dark' {
  const pixel = choice === 'pixel';
  const paper = choice === 'paper';
  const resolved = choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pixel || choice === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('pixel', pixel);
  root.classList.toggle('paper', paper);
  // 像素/纸质主题同步更换 favicon，其余主题还原默认图标
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = pixel ? PIXEL_FAVICON : paper ? PAPER_FAVICON : DEFAULT_FAVICON;
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(DEFAULT_THEME);
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) || DEFAULT_THEME;
    setThemeState(stored);
    setResolved(apply(stored));

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) || DEFAULT_THEME;
      if (current === 'system') {
        setResolved(apply('system'));
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: ThemeChoice) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
    setResolved(apply(t));
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

/** 品牌 Logo：像素/纸质主题各用专属插画，其余主题用默认图标 */
export function useBrandLogo(): string {
  const { theme } = useTheme();
  if (theme === 'pixel') return PIXEL_LOGO;
  if (theme === 'paper') return PAPER_LOGO;
  return '/icons/icon-192.png';
}

/* ---------------- 主题选择菜单 ---------------- */

const THEME_OPTIONS: {
  value: ThemeChoice;
  label: string;
  /** 选项前的配色示意（渐变小圆点） */
  swatch: string;
}[] = [
  { value: 'paper', label: '纸质蓝', swatch: 'linear-gradient(135deg,#f6fafd,#3d7bd9)' },
  { value: 'light', label: '浅色', swatch: 'linear-gradient(135deg,#f7f8fa,#3b82f6)' },
  { value: 'dark', label: '深色', swatch: 'linear-gradient(135deg,#1e293b,#3b82f6)' },
  { value: 'pixel', label: '紫罗兰像素', swatch: 'linear-gradient(135deg,#8b5cf6,#f472b6)' },
  { value: 'system', label: '跟随系统', swatch: 'linear-gradient(135deg,#94a3b8,#475569)' },
];

/** 主题切换入口：图标按钮 + 浮层菜单（替代原先的三态循环按钮） */
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[1];

  return (
    <div ref={rootRef} className="relative">
      <button
        className={cn(
          'p-2 rounded-md transition-colors',
          open ? 'text-content bg-hover' : 'text-muted hover:text-content hover:bg-hover'
        )}
        title={`主题：${current.label}`}
        aria-label={`主题：${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {theme === 'pixel' ? (
          <span
            className="block w-5 h-5 rounded-full ring-1 ring-white/25"
            style={{ background: 'linear-gradient(135deg,#8b5cf6,#f472b6)' }}
          />
        ) : theme === 'paper' ? (
          <span
            className="block w-5 h-5 rounded-full ring-1 ring-black/10"
            style={{ background: 'linear-gradient(135deg,#f6fafd,#3d7bd9)' }}
          />
        ) : theme === 'system' ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {theme === 'dark' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            )}
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-line bg-surface-raised py-1.5 shadow-xl animate-fade-in"
        >
          {THEME_OPTIONS.map((o) => {
            const active = o.value === theme;
            return (
              <button
                key={o.value}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-hover"
                onClick={() => {
                  setTheme(o.value);
                  setOpen(false);
                }}
              >
                <span className="w-4 h-4 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: o.swatch }} />
                <span className={cn('flex-1 text-left', active ? 'text-accent font-medium' : 'text-muted')}>
                  {o.label}
                </span>
                {active && <Icon name="check" className="w-3.5 h-3.5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
