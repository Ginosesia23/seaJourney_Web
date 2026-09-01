
import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';
import { cn } from '@/lib/utils';
import { CartProvider } from '@/context/cart-context';
import { ThemeProvider } from '@/context/theme-provider';
import { SupabaseProvider } from '@/supabase';
import { MainSiteThemeWrapper } from '@/components/main-site-theme-wrapper';
import { PostHogProvider } from '@/components/providers/posthog-provider';

export const metadata: Metadata = {
  title: 'SeaJourney - Seatime Tracker for Maritime Professionals',
  description:
    'The essential app for yacht crew and maritime professionals to track sea days, manage testimonials, and streamline certificate applications.',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  verification: {
    google: 'JmWJuSaFBw70J4i954zCHayoRpQpTMJ2RpLO3ImXA14',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light scroll-smooth" suppressHydrationWarning>
      <head>
        {/**
         * Supabase recovery-link guard.
         *
         * Supabase password-reset emails land on the Site URL with the recovery
         * tokens in the URL fragment (`/#access_token=…&type=recovery`). If
         * that arrives anywhere other than /reset-password the Supabase client
         * will silently consume the hash on init, so the user just sees the
         * landing page and the reset form never opens. This inline script runs
         * synchronously before any React/Supabase code mounts and forwards the
         * hash (or `?type=recovery&token_hash=…` query) to /reset-password,
         * preserving the tokens.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=window.location.pathname;if(p==='/reset-password')return;var h=window.location.hash||'';var s=window.location.search||'';var isRecHash=h.indexOf('type=recovery')>-1&&h.indexOf('access_token=')>-1;var isRecQuery=s.indexOf('type=recovery')>-1&&(s.indexOf('token_hash=')>-1||s.indexOf('token=')>-1);if(isRecHash||isRecQuery){window.location.replace('/reset-password'+s+h);}}catch(e){}})();`,
          }}
        />
        {/**
         * Landing defaults to dark before React hydrates. Honour an explicit
         * light choice from localStorage; otherwise force dark on `/`.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(window.location.pathname!=='/')return;var s=null;try{s=window.localStorage.getItem('wk-theme-mode');}catch(e){}var light=s==='light';var d=document.documentElement;if(light){d.classList.add('light');d.classList.remove('dark');}else{d.classList.add('dark');d.classList.remove('light');}}catch(e){}})();`,
          }}
        />
        <link rel="icon" href="/icon.png" type="image/png" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Lato:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={cn('font-body antialiased bg-background text-foreground')}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <MainSiteThemeWrapper>
            <SupabaseProvider>
              <PostHogProvider>
                <CartProvider>
                  {children}
                </CartProvider>
              </PostHogProvider>
            </SupabaseProvider>
          </MainSiteThemeWrapper>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
