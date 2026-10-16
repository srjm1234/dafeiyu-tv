# Selftv

> 自托管的影视搜索点播站 · 基于 LibreTV 深度定制 · Next.js 15 · Docker 单容器部署

在线实例：<https://dafeiyu-tv.app.workbuddy.host>（受站点密码保护）

## 简介

Selftv 是一个自托管的影视聚合搜索与在线点播平台：在页面输入关键词，服务端并发查询多个点播采集源，聚合去重后统一呈现，并直接站内播放。项目在 [LibreTV](https://github.com/LibreSpark/LibreTV) 基础上深度定制，方向是**聚合搜索体验**、**分类内容增强**与**部署后的可管理性**。

- 前后端同仓：Next.js App Router，API 路由即后端，无需独立服务
- 单容器部署：多阶段构建产出 standalone 镜像，非 root 运行，amd64 / arm64 双架构
- 数据自持：点播源清单、私密源、登录台账落盘于容器 `/app/data`，重建不丢
- 采集站格式：Apple CMS V10、XML、TVBox 配置地址均可作为点播源接入

## 功能特性

### 搜索与筛选

- 多源并发聚合搜索，跨源同名影片合并为一张卡片，可展开比较各来源
- 搜索结果支持**按年份、按分类筛选**，默认按时间（年份）排序，并显示筛选统计
- 搜索时自动记录各源健康度，连续失败的源按阶梯时长自动停用（30 分钟 → 24 小时 → 长期），可一键恢复
- 搜索历史本地留存

### 内容分类

- 电视剧 / 动漫 / 综艺 / 纪录片四个分类视图，卡片下标与所在分类一致
- 动漫分类接入番组数据（Bangumi）增强：封面、简介、放送信息，失败自动降级
- 豆瓣数据增强：首页推荐、影片详情（榜单、评分、简介），带缓存与并发控制

### 播放体验

- ArtPlayer 播放内核，支持 HLS（hls.js）、MPEG-TS（mpegts.js）与 MP4（内置转封装）
- 播放中一键换源并测速排序，保留集数位置；广告分片过滤、自动连播、倍速、快捷键、移动端长按 3 倍速
- 播放进度恢复、收藏夹、观看历史（本机 IndexedDB，精确到秒续播）
- 后续分片自动预缓存，播放页可下载本集（TS / MP4）离线观看

### 源管理

- 点播源增删改查**仅在后台完成**，清单持久化于 `/app/data/sources.json`
- 后台一键探活全部源，并自动屏蔽失效源
- 私密源：部署者通过环境变量预置，用户凭密钥解锁后可见可用
- 用户端「设置 → 片源」仅展示点播源个数等只读概览

### 后台管理（`/admin`）

- 快捷面板：源数量概览、全部启用 / 停用、探活并屏蔽失效源、重置默认源、常用入口
- 片源管理：点播源 / 私密源的增删改查
- 偏好设置：源订阅管理（远程 SourceList JSON / TVBOX 地址）、配置导入导出
- 登录设备台账：记录每次登录的 IP、时间与在线状态，可**远程踢下线**

### 其他

- 极简扁平「paper」主题：2px 卡片描边、内嵌字体，深浅色切换无首屏闪烁，移动端全屏搜索浮层
- 安全：SSRF 防护、API 守卫、httpOnly 签名会话 Cookie
- PWA：可安装到桌面 / 主屏幕

## 与上游 LibreTV 的主要差异

| 方向 | 变化 |
| --- | --- |
| 新增 | 搜索筛选（年份 / 分类）与时间排序、分类下标修正、番组数据增强、私密源、后台源管理、登录设备台账与远程踢下线、paper 主题 |
| 移除 | 通知功能、直播 / IPTV |
| 调整 | 点播源管理收敛到后台；用户端设置只保留只读概览 |

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Next.js 15（App Router）/ React 19 / TypeScript |
| 样式 | Tailwind CSS 3 |
| 状态与请求 | TanStack Query / Zustand |
| 本地存储 | Dexie（IndexedDB：历史、收藏、设置） |
| 播放 | ArtPlayer / hls.js / mpegts.js / 自研 mp4 转封装 |
| 测试 | Vitest |
| 部署 | Docker（node:22-alpine 多阶段构建，standalone 输出） |

## 快速开始

### Docker Compose（推荐）

```bash
git clone https://github.com/srjm1234/dafeiyu-tv.git
cd dafeiyu-tv

# 至少设置站点访问密码
echo "PASSWORD=change-me" > .env

docker compose up -d        # 拉取发布镜像；本地构建用 docker compose up -d --build
```

访问 <http://localhost:8080>。

> **数据持久化**：点播源 / 私密源 / 登录台账写在容器内 `/app/data`。建议挂载卷，避免重建容器后丢失：
>
> ```yaml
> services:
>   libretv:
>     volumes:
>       - selftv-data:/app/data
> volumes:
>   selftv-data: {}
> ```

> **HTTPS 提醒**：生产模式会话 cookie 带 `Secure` 标记，请通过反向代理（Nginx / Caddy / Traefik）或 Cloudflare 套上 TLS 后对外提供服务；`http://服务器IP:端口` 直连会出现「密码正确但无法登录」。反代未正确传递 `x-forwarded-proto` 时，设置 `COOKIE_SECURE=true` 可解。本地 `localhost` 不受影响。

### 本地开发

```bash
npm install
npm run dev          # http://localhost:8080
```

生产运行：`npm run build && npm start`（监听 8080）。

## 环境变量

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `PASSWORD` | 是 | — | 站点访问密码，未设置时站点不可用 |
| `PROXY_SECRET` | 否 | 由 `PASSWORD` 派生 | 会话 / 代理签名密钥，多实例部署建议显式设置（`openssl rand -hex 32`） |
| `ADMIN_PASSWORD` | 否 | 空 | 后台登录密码（`/admin`），未设置则无法登录后台 |
| `PRIVATE_SOURCE_PASSWORD` | 否 | 空 | 私密源解锁密钥，未设置则私密功能不可用 |
| `PRIVATE_SOURCES` | 否 | — | 预置私密源（JSON 数组），解锁后经 `/api/private-sources` 下发 |
| `DEFAULT_SOURCES` | 否 | — | 预置点播源（JSON 数组），用户端自动出现且默认勾选 |
| `DEFAULT_SUBSCRIPTIONS` | 否 | — | 预置源订阅（SourceList JSON 链接，也接受 TVBOX 配置地址），首次访问自动导入，之后每 24h 静默刷新 |
| `DEFAULT_RECOMMEND_SOURCE` | 否 | — | 首页推荐数据源默认值（`douban` / `bangumi` / `hot-list`），仅对未主动选择过的用户生效 |
| `DEFAULT_IMAGE_MODE` | 否 | — | 图片加载模式默认值 |
| `COOKIE_SECURE` | 否 | 按请求协议推导 | 显式覆盖会话 cookie 的 `Secure` 标记（`true` / `false`） |
| `REQUEST_TIMEOUT` | 否 | `8000` | 上游请求超时（毫秒） |
| `MAX_RETRIES` | 否 | `1` | 上游请求重试次数 |
| `SEARCH_MAX_PAGES` | 否 | `5` | 每个搜索源最多抓取页数（1-50） |
| `SEARCH_SOURCE_TIMEOUT_MS` | 否 | `10000` | 单源搜索总死线（毫秒，3s-60s），到点中断该源并标记超时 |
| `USER_AGENT` | 否 | Chrome UA | 代理请求 UA（豆瓣防盗链等场景） |
| `FALLBACK_CORS_PROXY` | 否 | — | 豆瓣推荐数据直连被拒时降级使用的 CORS 代理地址 |
| `60S_API_BASE` | 否 | 官方公共实例 | 影视榜单（60s API）实例地址，有限流，可自部署 |
| `DEBUG` | 否 | `false` | 调试日志 |

点播源 JSON 格式示例：

```json
[{"name":"示例源","url":"https://example.com/api.php/provide/vod"}]
```

## 后台管理

入口 `/admin`，使用 `ADMIN_PASSWORD` 登录（独立的后台会话 cookie）。后台集中了源的全部写操作：点播源与私密源的增删改查、探活与屏蔽、订阅与配置迁移、登录设备台账。用户端不再提供源的详细管理，仅展示只读概览。

## API 一览

| 路由 | 说明 |
| --- | --- |
| `/api/auth` | 站点登录 / 登出 |
| `/api/admin/*` | 后台：点播源管理、私密源管理、登录设备台账、配置导入导出 |
| `/api/private-sources` | 私密源解锁与下发 |
| `/api/search` | 多源聚合搜索 |
| `/api/detail` | 影片详情与播放地址解析 |
| `/api/source` | 单源查询 / 探活 |
| `/api/source-list` | 源清单发布与订阅同步 |
| `/api/status` | 站点状态（版本、源开关状态等） |
| `/api/bangumi` | 番组数据 |
| `/api/douban` | 豆瓣数据 |
| `/api/hot-list` | 影视榜单 |
| `/api/proxy` | 通用代理（防盗链资源等） |
| `/api/publish` | 源清单发布 |

## 项目结构

```text
src/
├── app/                  # Next.js App Router：页面与 API 路由
│   ├── page.tsx          # 首页（推荐 + 预取）
│   ├── watch/            # 播放页
│   ├── admin/            # 后台管理
│   ├── about/            # 关于
│   └── api/              # 后端 API（见 API 一览）
├── components/           # UI 组件（播放器、分类视图、源管理、主题、搜索等）
└── lib/                  # 核心逻辑（采集站解析、豆瓣、番组、会话、存储、探活）
public/                   # 静态资源（内嵌字体、图标、占位图）
scripts/                  # 品牌资产生成、字体子集化工具
.github/workflows/        # Docker 镜像发布（GHCR / Docker Hub，多架构）
```

## 开发命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发（8080） |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 单元测试（Vitest） |

版本号以 `package.json` 为单一来源，构建时注入 `APP_VERSION`，部署后可用 `/api/status` 的 `version` 字段核对。

## 部署

- **镜像发布**：推送 `v*` tag 时自动构建多架构镜像并发布到 GHCR（`ghcr.io/librespark/libretv`）；配置 `DOCKER_USERNAME` / `DOCKER_PASSWORD` 后同步 Docker Hub。也可在 Actions 页手动触发
- **数据持久化**：`/app/data`（`sources.json` / `private-sources.json` / `sessions.json`），挂载卷即可在容器重建后保留
- **反向代理**：置于任意反代之后即可，记得透传 `x-forwarded-proto`

## 致谢

- 上游项目：[LibreTV](https://github.com/LibreSpark/LibreTV)（Next.js 版）及其贡献者
- 番组数据：[Bangumi](https://bangumi.tv/)；影视数据：豆瓣公开接口；榜单：vikiboss/60s
- 播放内核：[ArtPlayer](https://artplayer.org/) / hls.js / mpegts.js
- 字体：[Maple Mono](https://github.com/SpaceTimee/Maple-Mono)（子集化后内置于 `public/fonts`）

## 许可

本项目为 LibreTV 的衍生作品，遵循 **AGPL-3.0-or-later** 开源，详见 [LICENSE](./LICENSE)。
