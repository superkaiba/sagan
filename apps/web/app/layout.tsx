import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import {
  Inter_Tight,
  Bricolage_Grotesque,
  Outfit,
  Manrope,
  Space_Grotesk,
  DM_Sans,
  IBM_Plex_Sans,
  Source_Serif_4,
  Newsreader,
} from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';

// Each candidate font exposes a CSS variable. globals.css maps
// :root[data-font="<slug>"] to override --font-sans so the entire
// dashboard (chrome + clean-result bodies via inheritance) picks up
// the selection. Default is Geist when no data-font is set.
const interTight = Inter_Tight({ subsets: ['latin'], display: 'swap', variable: '--font-inter-tight' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap', variable: '--font-bricolage' });
const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-outfit' });
const manrope = Manrope({ subsets: ['latin'], display: 'swap', variable: '--font-manrope' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-space-grotesk' });
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-dm-sans' });
const ibmPlex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-ibm-plex' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], display: 'swap', variable: '--font-source-serif' });
const newsreader = Newsreader({ subsets: ['latin'], display: 'swap', variable: '--font-newsreader' });

// Read the persisted font choice and set `data-font` on <html> before the
// page paints so we never flash the wrong font.
const themeScript = `
(() => {
  try {
    const choice = window.localStorage.getItem('sagan-theme');
    if (choice === 'light' || choice === 'dark') {
      document.documentElement.dataset.theme = choice;
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    const font = window.localStorage.getItem('sagan-font');
    if (font) {
      document.documentElement.dataset.font = font;
    }
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: 'Sagan',
  description: 'Personal research-life dashboard.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: '/favicon.png', sizes: '32x32' },
    shortcut: '/favicon.png',
  },
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
  const fontClasses = [
    GeistSans.variable,
    GeistMono.variable,
    interTight.variable,
    bricolage.variable,
    outfit.variable,
    manrope.variable,
    spaceGrotesk.variable,
    dmSans.variable,
    ibmPlex.variable,
    sourceSerif.variable,
    newsreader.variable,
  ].join(' ');

  return (
    <html lang="en" suppressHydrationWarning className={fontClasses}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
