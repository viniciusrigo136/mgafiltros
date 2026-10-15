import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MGA Mecânica Agrícola',
    short_name: 'MGA',
    description: 'Manutenção de tratores, ordens de serviço e estoque.',
    lang: 'pt-BR',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
