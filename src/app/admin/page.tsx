'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client-api';
import type { LoginSession, ManagedSource } from '@/lib/types';
import { Switch } from '@/components/settings-shared';
import { useToast } from '@/components/toast';
import { cn } from '@/lib/utils';
import { ConfigIoPanel, SourceSubscriptions } from '@/components/source-manager';

/** 后台功能页签 */
type AdminTabId = 'quick' | 'sources' | 'private' | 'subs' | 'io' | 'sessions';

type HealthState = { ok: boolean; ms: number; count?: number; error?: string } | 'testing' | undefined;

export default function AdminPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<AdminTabId>('quick');

  // 强制纸质蓝风格，与站点同源
  useEffect(() => {
    const r = document.documentElement;
    r.classList.add('paper');
    r.classList.remove('dark', 'pixel');
  }, []);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      await api.adminListSources();
      setAuthed(true);
    } catch {
      // 401 / 503：未登录或后台未配置
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const onLogin = async () => {
    setLoading(true);
    try {
      await api.adminLogin(password);
      setPassword('');
      await loadSources();
      toast('登录成功', 'success');
    } catch {
      toast('密码错误或未配置后台密码', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onLogout = async () => {
    await api.adminLogout();
    setAuthed(false);
    toast('已退出后台', 'success');
  };

  if (authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-muted">加载中…</div>;
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-sm p-7 bg-card">
          <h1 className="brand-name text-xl font-bold mb-1">蓝色大肥鱼 · 后台管理</h1>
          <p className="text-sm text-muted mb-5">请输入管理员密码以继续</p>
          <input
            type="password"
            className="input w-full mb-3"
            placeholder="管理员密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLogin()}
            autoFocus
          />
          <button className="btn-primary w-full" onClick={onLogin} disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* 顶栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/paper-logo.png" alt="logo" className="w-9 h-9 rounded-[10px]" />
          <div>
            <h1 className="brand-name text-xl font-bold leading-tight">蓝色大肥鱼 · 后台管理</h1>
            <p className="text-xs text-muted">点播源 / 私密源 / 订阅 / 数据 / 登录设备统一管理（改动全站生效）</p>
          </div>
        </div>
        <button className="btn-ghost btn-sm" onClick={onLogout}>
          退出
        </button>
      </div>

      {/* 功能页签 */}
      <div className="flex gap-1 mb-5 border-b border-line">
        <AdminTab active={tab === 'quick'} onClick={() => setTab('quick')}>
          快捷选项
        </AdminTab>
        <AdminTab active={tab === 'sources'} onClick={() => setTab('sources')}>
          点播源
        </AdminTab>
        <AdminTab active={tab === 'private'} onClick={() => setTab('private')}>
          私密源
        </AdminTab>
        <AdminTab active={tab === 'subs'} onClick={() => setTab('subs')}>
          数据源订阅
        </AdminTab>
        <AdminTab active={tab === 'io'} onClick={() => setTab('io')}>
          数据
        </AdminTab>
        <AdminTab active={tab === 'sessions'} onClick={() => setTab('sessions')}>
          登录设备
        </AdminTab>
      </div>

      {tab === 'quick' && <QuickPanel />}
      {tab === 'sources' && <SourcesPanel />}
      {tab === 'private' && <SourcesPanel kind="private" />}
      {/* 数据源订阅 / 配置导入导出：从用户设置迁入，交由管理员统一管理 */}
      {tab === 'subs' && <SourceSubscriptions />}
      {tab === 'io' && <ConfigIoPanel />}
      {tab === 'sessions' && <SessionsPanel />}
      </div>
    </div>
  );
}

function AdminTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active ? 'border-accent text-content' : 'border-transparent text-muted hover:text-content'
      )}
    >
      {children}
    </button>
  );
}

/**
 * 源管理面板：点播源（全站可见）与私密源（需密码解锁）共用同一套 UI/交互，
 * 仅数据接口与提示文案不同，由 kind 区分。
 */
/**
 * 快捷选项：把高频维护动作收敛到一处——
 * 概览统计、全部启停、探活并自动屏蔽失效源、重置为部署默认。
 */
function QuickPanel() {
  const { toast } = useToast();
  const [stats, setStats] = useState<{
    vodTotal: number; vodEnabled: number; privTotal: number; sessions: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [vod, priv, ses] = await Promise.all([
        api.adminListSources(),
        api.adminListPrivateSources(),
        api.adminListSessions(),
      ]);
      setStats({
        vodTotal: vod.sources.length,
        vodEnabled: vod.sources.filter((s) => s.enabled).length,
        privTotal: priv.sources.length,
        sessions: ses.sessions.length,
      });
    } catch {
      toast('概览加载失败', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 批量设置点播源启用状态 */
  const setAll = async (enabled: boolean) => {
    if (!confirm(enabled ? '确认启用全部点播源？' : '确认停用全部点播源？停用后全站将无法使用该批源。')) return;
    setBusy('all');
    try {
      const { sources } = await api.adminListSources();
      let n = 0;
      for (const s of sources) {
        if (s.enabled === enabled) continue;
        await api.adminUpdateSource(s.key, { enabled });
        n += 1;
      }
      toast(`已${enabled ? '启用' : '停用'} ${n} 个源`, 'success');
      await load();
    } catch {
      toast('操作失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  /** 探活全部点播源，自动屏蔽探测失败的源 */
  const probeAndDisable = async () => {
    if (!confirm('将逐个探活全部已启用点播源，并自动屏蔽探测失败的源。耗时较长，确认继续？')) return;
    setBusy('probe');
    try {
      const { sources } = await api.adminListSources();
      const targets = sources.filter((s) => s.enabled);
      setProbe({ done: 0, total: targets.length });
      const dead: string[] = [];
      let done = 0;
      for (const s of targets) {
        try {
          const r = await api.testSource(s.url);
          if (!r.ok) dead.push(s.key);
        } catch {
          dead.push(s.key);
        }
        done += 1;
        setProbe({ done, total: targets.length });
      }
      for (const key of dead) {
        await api.adminUpdateSource(key, { enabled: false });
      }
      toast(`探活完成：${targets.length} 个源，已屏蔽 ${dead.length} 个失效源`, 'success');
      setProbe(null);
      await load();
    } catch {
      toast('探活失败', 'error');
      setProbe(null);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!confirm('确认按部署配置（env）重新播种点播源？将覆盖当前所有增删改与启用设置。')) return;
    setBusy('reset');
    try {
      const { sources } = await api.adminResetSources();
      toast(`已重置为 ${sources.length} 个默认源`, 'success');
      await load();
    } catch {
      toast('重置失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!stats) return <p className="text-sm text-muted py-10 text-center">加载中…</p>;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="点播源总数" value={stats.vodTotal} />
        <Stat label="启用中" value={stats.vodEnabled} tone="ok" />
        <Stat label="私密源" value={stats.privTotal} />
        <Stat label="登录记录" value={stats.sessions} />
      </div>

      <div className="card bg-card p-4 mb-4">
        <h3 className="text-sm font-semibold text-content mb-3">批量操作</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => setAll(true)}>
            {busy === 'all' ? '处理中…' : '全部启用'}
          </button>
          <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => setAll(false)}>
            全部停用
          </button>
          <button className="btn-primary btn-sm" disabled={!!busy} onClick={probeAndDisable}>
            {busy === 'probe' ? '探活中…' : '探活并屏蔽失效源'}
          </button>
          <button className="btn-ghost btn-sm" disabled={!!busy} onClick={reset}>
            {busy === 'reset' ? '处理中…' : '重置为默认'}
          </button>
        </div>
        {probe && (
          <p className="text-xs text-muted mt-3">
            探活进度：{probe.done} / {probe.total}
          </p>
        )}
      </div>

      <div className="card bg-card p-4">
        <h3 className="text-sm font-semibold text-content mb-3">常用入口</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <a className="btn-ghost btn-sm" href="/" target="_blank" rel="noreferrer">
            打开站点首页
          </a>
          <a className="btn-ghost btn-sm" href="/api/status" target="_blank" rel="noreferrer">
            查看状态接口
          </a>
        </div>
        <p className="text-xs text-faint mt-3 leading-relaxed">
          提示：点播源 / 私密源的增删改查、数据源订阅与配置导入导出均已集中在后台，用户侧设置只保留偏好项与数量概览。
        </p>
      </div>
    </>
  );
}

function SourcesPanel({ kind = 'public' }: { kind?: 'public' | 'private' }) {
  const { toast } = useToast();
  const isPrivate = kind === 'private';
  const [sources, setSources] = useState<ManagedSource[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ManagedSource | null>(null);
  const [health, setHealth] = useState<Record<string, HealthState>>({});

  const load = useCallback(async () => {
    setLoadingList(true);
    try {
      const { sources } = isPrivate ? await api.adminListPrivateSources() : await api.adminListSources();
      setSources(sources);
    } catch {
      toast('源列表加载失败', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [isPrivate, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = async (s: ManagedSource) => {
    try {
      const { source } = isPrivate
        ? await api.adminUpdatePrivateSource(s.key, { enabled: !s.enabled })
        : await api.adminUpdateSource(s.key, { enabled: !s.enabled });
      setSources((prev) => prev.map((x) => (x.key === s.key ? source : x)));
      toast(source.enabled ? `已启用「${source.name}」` : `已屏蔽「${source.name}」`, 'success');
    } catch {
      toast('操作失败', 'error');
    }
  };

  const onDelete = async (s: ManagedSource) => {
    if (!confirm(`确认删除「${s.name}」？此操作不可撤销。`)) return;
    try {
      if (isPrivate) await api.adminDeletePrivateSource(s.key);
      else await api.adminDeleteSource(s.key);
      setSources((prev) => prev.filter((x) => x.key !== s.key));
      toast(`已删除「${s.name}」`, 'success');
    } catch {
      toast('删除失败', 'error');
    }
  };

  const onReset = async () => {
    if (!confirm('确认按部署配置（env）重新播种？将覆盖当前所有增删改与启用设置。')) return;
    try {
      const { sources } = isPrivate ? await api.adminResetPrivateSources() : await api.adminResetSources();
      setSources(sources);
      toast(`已重置为 ${sources.length} 个默认源`, 'success');
    } catch {
      toast('重置失败', 'error');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
  }, [sources, query]);

  const enabledCount = sources.filter((s) => s.enabled).length;
  const disabledCount = sources.length - enabledCount;

  const newDraft = () =>
    setEditing({ key: '', name: '', url: '', detail: undefined, isAdult: false, enabled: true });

  if (loadingList) {
    return <p className="text-sm text-muted py-10 text-center">加载中…</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label={isPrivate ? '私密源总数' : '源总数'} value={sources.length} />
        <Stat label="启用中" value={enabledCount} tone="ok" />
        <Stat label="已屏蔽" value={disabledCount} tone="warn" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          className="input flex-1"
          placeholder="搜索源名称或地址…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn-primary btn-sm whitespace-nowrap" onClick={newDraft}>
          + 添加{isPrivate ? '私密源' : '源'}
        </button>
        <button className="btn-ghost btn-sm whitespace-nowrap" onClick={onReset}>
          重置为默认
        </button>
      </div>

      <div className="card bg-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.4fr_2fr_auto_auto_auto] gap-3 px-4 py-2.5 text-xs font-semibold text-muted border-b border-line">
          <span>名称</span>
          <span>地址</span>
          <span className="text-center">启用</span>
          <span className="text-center">探活</span>
          <span className="text-right">操作</span>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted text-sm">暂无匹配的源</div>
        ) : (
          filtered.map((s) => {
            const h = health[s.key];
            return (
              <div
                key={s.key}
                className="grid grid-cols-1 md:grid-cols-[1.4fr_2fr_auto_auto_auto] gap-2 md:gap-3 px-4 py-3 border-b border-line last:border-0 items-center"
              >
                <div className="min-w-0">
                  <div className="font-medium text-content truncate flex items-center gap-1.5">
                    {s.name}
                    {s.isAdult && (
                      <span className="text-[10px] px-1 rounded bg-rose-100 text-rose-600">成人</span>
                    )}
                  </div>
                  {!s.enabled && <div className="text-[11px] text-amber-600">已屏蔽</div>}
                </div>
                <div className="text-xs text-muted truncate" title={s.url}>
                  {s.url}
                </div>
                <div className="flex md:justify-center">
                  <Switch
                    checked={s.enabled}
                    onChange={() => toggleEnabled(s)}
                    label={`${s.name} 启用开关`}
                    title={s.enabled ? '点击屏蔽该源' : '点击启用该源'}
                  />
                </div>
                <div className="flex md:justify-center items-center gap-1">
                  <button
                    className="btn-ghost btn-xs"
                    onClick={async () => {
                      setHealth((x) => ({ ...x, [s.key]: 'testing' }));
                      try {
                        const r = await api.testSource(s.url);
                        setHealth((x) => ({ ...x, [s.key]: { ok: r.ok, ms: r.ms, count: r.count, error: r.error } }));
                      } catch (err) {
                        setHealth((x) => ({
                          ...x,
                          [s.key]: { ok: false, ms: 0, error: err instanceof Error ? err.message : '失败' },
                        }));
                      }
                    }}
                  >
                    测速
                  </button>
                  <span className="text-[11px] tabular-nums">
                    {h === 'testing' ? (
                      <span className="text-muted">…</span>
                    ) : h ? (
                      h.ok ? (
                        <span className="text-emerald-600">{h.ms}ms{h.count ? ` · ${h.count}` : ''}</span>
                      ) : (
                        <span className="text-rose-600" title={h.error}>✕</span>
                      )
                    ) : null}
                  </span>
                </div>
                <div className="flex md:justify-end gap-2">
                  <button className="btn-ghost btn-xs" onClick={() => setEditing({ ...s })}>
                    编辑
                  </button>
                  <button className="btn-ghost btn-xs text-rose-600" onClick={() => onDelete(s)}>
                    删除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted mt-4">
        {isPrivate
          ? '私密源需输入私密源密码解锁后才对用户可见（未解锁时前端拿不到地址）；启用/禁用与删除立即写回服务端。'
          : '启用/禁用与删除会立即写入服务端并影响全站点播搜索与换源；「重置为默认」会按部署配置重新生成源清单。'}
      </p>

      {editing && (
        <SourceEditor
          source={editing}
          kind={kind}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setSources((prev) => {
              const idx = prev.findIndex((x) => x.key === saved.key);
              if (idx === -1) return [saved, ...prev];
              const next = prev.slice();
              next[idx] = saved;
              return next;
            });
            setEditing(null);
          }}
          onError={() => toast('保存失败，请检查名称与地址', 'error')}
        />
      )}
    </>
  );
}

/** 登录设备台账：IP / 设备 / 时间，可远程强制下线 */
function SessionsPanel() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { sessions } = await api.adminListSessions();
      setSessions(sessions);
    } catch {
      toast('登录记录加载失败', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const kick = async (jti?: string, all?: boolean) => {
    if (!all && !confirm('确认强制该设备下线？该设备需要重新输入密码登录。')) return;
    if (all && !confirm('确认注销全部登录设备？（会保留你当前的后台会话）')) return;
    setBusy(all ? '__all__' : (jti ?? ''));
    try {
      const r = await api.adminRevokeSession(jti, all);
      toast(`已强制下线 ${r.revoked} 个设备`, 'success');
      await load();
    } catch {
      toast('操作失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const fmt = (ts: number) => (ts < 0 ? '—' : new Date(ts).toLocaleString('zh-CN', { hour12: false }));

  if (loadingList) return <p className="text-sm text-muted py-10 text-center">加载中…</p>;

  const alive = sessions.filter((s) => !s.revokedAt).length;

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="登录记录" value={sessions.length} />
        <Stat label="有效会话" value={alive} tone="ok" />
        <Stat label="已下线" value={sessions.length - alive} tone="warn" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted">
          记录最近 300 次登录的 IP 与设备指纹；强制下线后该设备所有接口请求立即失效。
        </p>
        <button className="btn-ghost btn-sm whitespace-nowrap" onClick={() => kick(undefined, true)} disabled={busy === '__all__'}>
          {busy === '__all__' ? '处理中…' : '注销全部设备'}
        </button>
      </div>

      <div className="card bg-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.3fr_1.3fr_1.6fr_1.6fr_auto] gap-3 px-4 py-2.5 text-xs font-semibold text-muted border-b border-line">
          <span>IP</span>
          <span>设备</span>
          <span>登录时间</span>
          <span>最后活跃</span>
          <span className="text-right">操作</span>
        </div>
        {sessions.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted text-sm">暂无登录记录</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.jti}
              className="grid grid-cols-1 md:grid-cols-[1.3fr_1.3fr_1.6fr_1.6fr_auto] gap-2 md:gap-3 px-4 py-3 border-b border-line last:border-0 items-center"
            >
              <div className="font-mono text-sm text-content">{s.ip}</div>
              <div className="text-xs text-muted truncate" title={s.ua}>
                {s.device}
                {s.current && <span className="ml-1 text-[10px] text-emerald-600">当前设备</span>}
              </div>
              <div className="text-xs text-muted">{fmt(s.createdAt)}</div>
              <div className="text-xs text-muted">{fmt(s.lastSeenAt)}</div>
              <div className="md:text-right">
                {s.revokedAt ? (
                  <span className="text-xs text-rose-600">已强制下线</span>
                ) : (
                  <button
                    className="btn-ghost btn-xs text-rose-600"
                    disabled={!!busy}
                    onClick={() => kick(s.jti)}
                  >
                    {busy === s.jti ? '处理中…' : '强制下线'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-content';
  return (
    <div className="card bg-card px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}

function SourceEditor({
  source,
  kind = 'public',
  onClose,
  onSaved,
  onError,
}: {
  source: ManagedSource;
  kind?: 'public' | 'private';
  onClose: () => void;
  onSaved: (s: ManagedSource) => void;
  onError: () => void;
}) {
  const { toast } = useToast();
  const isNew = source.key === '';
  const [name, setName] = useState(source.name);
  const [url, setUrl] = useState(source.url);
  const [detail, setDetail] = useState(source.detail ?? '');
  const [isAdult, setIsAdult] = useState(!!source.isAdult);
  const [enabled, setEnabled] = useState(source.enabled);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { name, url, detail: detail.trim() || undefined, isAdult, enabled };
      const saved = kind === 'private'
        ? isNew
          ? await api.adminAddPrivateSource(payload)
          : await api.adminUpdatePrivateSource(source.key, payload)
        : isNew
          ? await api.adminAddSource(payload)
          : await api.adminUpdateSource(source.key, payload);
      onSaved(saved.source);
      toast(isNew ? '已添加源' : '已保存修改', 'success');
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card bg-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title text-lg font-bold mb-4">
          {isNew ? (kind === 'private' ? '添加私密源' : '添加点播源') : kind === 'private' ? '编辑私密源' : '编辑点播源'}
        </h2>
        <label className="block text-sm mb-1 text-muted">名称</label>
        <input className="input w-full mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 暴风资源站" />
        <label className="block text-sm mb-1 text-muted">接口地址</label>
        <input
          className="input w-full mb-3"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/api.php/provide/vod"
        />
        <label className="block text-sm mb-1 text-muted">备注（可选）</label>
        <input className="input w-full mb-3" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="来源说明" />
        <div className="flex items-center gap-6 mb-5">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onChange={setEnabled} label="启用" />
            <span>启用（纳入全站）</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isAdult} onChange={setIsAdult} label="成人内容" />
            <span>成人内容</span>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary btn-sm" onClick={save} disabled={saving || !name.trim() || !url.trim()}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
