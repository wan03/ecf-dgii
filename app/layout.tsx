import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Facturación Electrónica e-CF 31 DGII',
  description: 'Sistema de facturación electrónica conforme a DGII e-CF 31',
  icons: { icon: '/favicon.ico' },
};

/**
 * Root layout — wraps every page (authenticated app AND login).
 * Only provides the HTML shell, fonts, and global CSS.
 * The sidebar / app chrome lives in the (authenticated) group layout.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
