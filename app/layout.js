import './globals.css';

export const metadata = {
  title: '収支管理',
  description: '月次収支管理アプリ',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
  manifest: '/manifest.json',
  themeColor: '#ffffff',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '収支管理' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
