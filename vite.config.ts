import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'أرشيف فندق النيل ريتز كارلتون',
          short_name: 'أرشيف الفندق',
          description:
            'منظومة الأرشيف الرقمي المعتمد لفندق النيل ريتز كارلتون القاهرة — إدارة الصناديق والموردين والشيكات والباركود مع المزامنة السحابية والعمل أوفلاين.',
          theme_color: '#0B1426',
          background_color: '#0B1426',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          dir: 'rtl',
          lang: 'ar',
          start_url: '/',
          scope: '/',
          categories: ['business', 'productivity', 'utilities'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'البحث الذكي',
              short_name: 'بحث',
              description: 'البحث الفوري عن الموردين والشيكات والسندات',
              url: '/?section=search',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'إدارة الصناديق',
              short_name: 'الصناديق',
              description: 'فتح واستعراض صناديق الأرشيف',
              url: '/?section=boxes',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'مخزن الشيكات',
              short_name: 'الشيكات',
              description: 'مراجعة الشيكات والفواتير المالية',
              url: '/?section=checks-vault',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'مسح فاتورة بالكاميرا',
              short_name: 'كاميرا AI',
              description: 'تصوير واستخراج بيانات الفواتير والشيكات بكاميرا الهاتف',
              url: '/?scan=1',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/*.pdf', 'assets/*.pdf'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/firebase/')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/qrcode/')) {
              return 'vendor-qr';
            }
          },
        },
      },
    },
  };
});
