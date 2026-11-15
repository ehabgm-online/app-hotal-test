import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Normalize direct non-root pathnames (e.g. /boxes/19 or /search) into HashRouter routes cleanly
if (typeof window !== 'undefined') {
  const { pathname, search, hash } = window.location;
  if (pathname && pathname !== '/' && pathname !== '/index.html' && !hash) {
    const cleanPath = pathname.replace(/\/+$/, '') || '/';
    window.history.replaceState(null, '', `/#${cleanPath}${search}`);
  }
}

if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('Smart Docs E-Archive جاهز للعمل بدون إنترنت.');
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <HashRouter>
      <App />
    </HashRouter>
  </ErrorBoundary>
);
