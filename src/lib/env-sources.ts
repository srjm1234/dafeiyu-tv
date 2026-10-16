import type { SourceConfig } from './types';

/**
 * 部署者通过环境变量预置的采集站。
 * 公开源格式（DEFAULT_SOURCES）：
 *   JSON 数组 [{"name":"源名","url":"https://.../api.php/provide/vod","detail":"...","isAdult":false}]
 * 私密源格式（PRIVATE_SOURCES）：同上，但仅在设置「私密源」密码解锁后可见/可用。
 * 解析失败时告警并整体忽略，不影响站点运行。
 */

function parseSourceList(raw: string | undefined, keyPrefix: string, label: string): SourceConfig[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('必须是 JSON 数组');
    const list: SourceConfig[] = parsed.map((item, i) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`第 ${i + 1} 项不是对象`);
      }
      const { name, url, detail, isAdult } = item as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error(`第 ${i + 1} 项缺少 name`);
      }
      if (typeof url !== 'string' || !/^https?:\/\//.test(url.trim())) {
        throw new Error(`第 ${i + 1} 项的 url 必须以 http:// 或 https:// 开头`);
      }
      return {
        key: `${keyPrefix}_${i}`,
        name: name.trim(),
        url: url.trim().replace(/\/+$/, ''),
        detail: typeof detail === 'string' && detail.trim() ? detail.trim() : undefined,
        isAdult: isAdult === true,
      };
    });
    return list;
  } catch (err) {
    console.warn(`[LibreTV] ${label} 解析失败，已忽略：`, err instanceof Error ? err.message : err);
    return [];
  }
}

/** 公开预置源（DEFAULT_SOURCES） */
export function getEnvSources(): SourceConfig[] {
  return parseSourceList(process.env.DEFAULT_SOURCES, 'env', 'DEFAULT_SOURCES');
}

/** 私密预置源（PRIVATE_SOURCES）：密码解锁后由 /api/private-sources 下发 */
export function getPrivateSources(): SourceConfig[] {
  return parseSourceList(process.env.PRIVATE_SOURCES, 'private', 'PRIVATE_SOURCES');
}

/** 私密源解锁密码（PRIVATE_SOURCE_PASSWORD）；未配置时私密功能不可用 */
export function getPrivateSourcePassword(): string | undefined {
  const pwd = process.env.PRIVATE_SOURCE_PASSWORD;
  return pwd && pwd.length > 0 ? pwd : undefined;
}
