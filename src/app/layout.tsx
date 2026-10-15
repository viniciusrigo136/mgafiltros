import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';

// Uma família só: largura normal no texto, condensada/itálica nos números e títulos (eco do logotipo MGA).
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'MGA Mecânica Agrícola', template: '%s · MGA' },
  description: 'Controle de manutenção de tratores, ordens de serviço e estoque — MGA Mecânica Agrícola.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'MGA', statusBarStyle: 'black' },
};

export const viewport: Viewport = { themeColor: '#000000' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
