import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import '@server/production';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Proxy Key Manager',
  description: 'Manage your proxy keys efficiently',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
} 