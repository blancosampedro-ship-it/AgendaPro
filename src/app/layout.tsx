import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'AgendaPro',
  description: 'Tu secretaria virtual para macOS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
        {/* Titlebar drag region para macOS */}
        <div className="titlebar-drag-region fixed top-0 left-0 right-0 h-[52px] z-50" />
        
        {/* Main content */}
        <main className="h-screen pt-[52px]">
          {children}
        </main>
      </body>
    </html>
  );
}
