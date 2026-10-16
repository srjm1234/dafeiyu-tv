import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: '蓝色大肥鱼影院 - 优雅的私人影视库',
    template: '%s - 蓝色大肥鱼影院',
  },
  description:
    '蓝色大肥鱼影院是一个优雅的私人影视聚合库，界面极简、无广告，聚合多个点播源与每日新番放送，无需注册即可使用。',
  manifest: '/manifest.webmanifest',
  // 图标与门户站（LibreTV-portal）同一套：同一张 artwork 导出的多尺寸 + 根目录 favicon.ico 兜底。
  // 只声明单张 512 时，抓取端只能拿大图缩放，小尺寸下易糊、看起来「没填满」。
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#f6fafd',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏前同步主题，避免亮暗闪烁（默认 paper 纸质蓝；pixel 为暗色系变体需同时挂两个类） */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('libretv-theme')||'paper';var p=t==='pixel';var k=t==='paper';var d=t==='dark'||p||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('pixel',p);r.classList.toggle('paper',k);var ic=document.querySelector('link[rel=\"icon\"]');if(ic){if(p)ic.href='/icons/pixel-favicon.png';else if(k)ic.href='/icons/paper-favicon.png';else ic.href='/favicon.ico';}}catch(e){}})()",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
