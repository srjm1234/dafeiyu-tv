import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '蓝色大肥鱼影院 - 优雅的私人影视库',
    short_name: '蓝色大肥鱼',
    description: '优雅的私人影视聚合库',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6fafd',
    theme_color: '#3d7bd9',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
