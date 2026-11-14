import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/useAndroidPwa';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar';
  onInstalled?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onInstalled,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState<'ios' | 'android' | null>(null);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    const ok = await install();
    if (ok && onInstalled) onInstalled();
  };

  if (isInstallable) {
    if (variant === 'sidebar') {
      return (
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-[0.98]"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>تثبيت التطبيق على الهاتف</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleInstallClick}
        className="h-9 px-2.5 sm:px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors whitespace-nowrap"
        title="تثبيت تطبيق الأرشيف على شاشة الهاتف الرئيسية"
        aria-label="تثبيت التطبيق"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS || (isAndroid && variant === 'sidebar')) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(isIOS ? 'ios' : 'android')}
          className={
            variant === 'sidebar'
              ? 'w-full py-2 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors'
              : 'h-9 px-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer'
          }
          title={isIOS ? 'طريقة التثبيت على iPhone / iPad' : 'طريقة التثبيت على Android'}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className={variant === 'header' ? 'hidden sm:inline' : ''}>
            {isIOS ? 'تثبيت على iOS' : 'تثبيت على أندرويد'}
          </span>
        </button>

        {showGuide && (
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4"
            onClick={() => setShowGuide(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-3"
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-900">
                  {showGuide === 'ios' ? 'تثبيت التطبيق على iPhone / iPad' : 'تثبيت التطبيق على هاتف أندرويد'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {showGuide === 'ios' ? (
                <ol className="text-xs text-slate-600 space-y-2 list-decimal pr-4 leading-relaxed">
                  <li>
                    اضغط على زر <strong>المشاركة (Share)</strong> في شريط متصفح Safari.
                  </li>
                  <li>
                    مرر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                  </li>
                  <li>
                    اضغط <strong>إضافة</strong> ليظهر كتطبيق مستقل.
                  </li>
                </ol>
              ) : (
                <ol className="text-xs text-slate-600 space-y-2 list-decimal pr-4 leading-relaxed">
                  <li>
                    افتح الموقع عبر متصفح <strong>Google Chrome</strong> على هاتف الأندرويد.
                  </li>
                  <li>
                    اضغط على قائمة <strong>النقاط الثلاث (⋮)</strong> أعلى المتصفح.
                  </li>
                  <li>
                    اختر <strong>تثبيت التطبيق (Install App)</strong> أو{' '}
                    <strong>الإضافة إلى الشاشة الرئيسية</strong> ليعمل بوضع الشاشة الكاملة وأوفلاين.
                  </li>
                </ol>
              )}

              <button
                type="button"
                onClick={() => setShowGuide(null)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors"
              >
                فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-50 flex items-center gap-2.5 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xl border border-amber-400/50"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>وضع عدم الاتصال — يتم العمل بالبيانات المحفوظة وسيتم المزامنة تلقائياً عند عودة الشبكة.</span>
    </div>
  );
};
