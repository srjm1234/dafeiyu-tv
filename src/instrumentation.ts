/**
 * 服务端启动钩子：预热豆瓣分类页常用合集缓存。
 *
 * 分类页数据源为豆瓣移动端合集（douban-rexxar），首次请求需 300ms~1.5s
 * （合集响应体较大）。启动后静默预热默认标签，用户首次打开分类页即缓存命中。
 * 预热失败静默忽略——各标签仍会在用户点击时按需加载。
 */

const WARMUP_ENTRIES: [type: 'movie' | 'tv', tag: string][] = [
  ['movie', '热门'],
  ['movie', '最新'],
  ['tv', '热门'],
  ['tv', '综艺'],
  ['tv', '纪录片'],
];

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // 延迟执行：等 HTTP 服务就绪、避免拖慢启动
  setTimeout(() => {
    void import('./lib/douban')
      .then(({ fetchDoubanRecommend }) =>
        Promise.all(
          WARMUP_ENTRIES.map(([type, tag]) =>
            fetchDoubanRecommend(type, tag, 0, 50).catch(() => undefined)
          )
        )
      )
      .catch(() => undefined);
  }, 3000);
}
