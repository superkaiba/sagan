import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';

const themeScript = `
(() => {
  try {
    const choice = window.localStorage.getItem('sagan-theme');
    if (choice === 'light' || choice === 'dark') {
      document.documentElement.dataset.theme = choice;
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: 'Sagan',
  description: 'Personal research-life dashboard.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Sagan',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#16172e' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
