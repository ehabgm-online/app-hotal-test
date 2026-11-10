import React from 'react';
import { Archive, Cloud, Database, Sparkles } from 'lucide-react';

interface LoadingSkeletonProps {
  message?: string;
  subMessage?: string;
}

/**
 * Top slim indeterminate loading line for active Firestore synchronization
 */
export const TopSyncBar: React.FC = () => {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] bg-slate-200 overflow-hidden" role="progressbar" aria-label="جاري المزامنة السحابية">
      <div className="h-full bg-gradient-to-r from-blue-600 via-emerald-400 to-indigo-600 animate-[shimmer_1.4s_infinite_linear] w-full origin-left" />
    </div>
  );
};

/**
 * Floating sync badge that appears quietly during background Firestore updates
 */
export const FloatingSyncBadge: React.FC<{ lastSyncTime?: string }> = ({ lastSyncTime }) => {
  return (
    <div
      className="fixed bottom-4 left-4 z-40 bg-slate-900/90 backdrop-blur-md text-white text-xs px-3.5 py-2 rounded-xl shadow-lg border border-slate-700/80 flex items-center gap-2.5 transition-all duration-300 animate-in fade-in"
      dir="rtl"
    >
      <div className="relative flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute"></span>
        <span className="w-2 h-2 rounded-full bg-emerald-500 relative"></span>
      </div>
      <span className="font-medium text-slate-200 text-[11px]">جاري المزامنة السحابية مع Firestore...</span>
      {lastSyncTime && (
        <span className="text-[10px] text-slate-400 font-mono-num border-r border-slate-700 pr-2">
          {lastSyncTime}
        </span>
      )}
    </div>
  );
};

/**
 * Reusable Box Card Skeleton
 */
export const BoxCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-200 rounded-xl animate-pulse" />
          <div className="space-y-2">
            <div className="w-28 h-4 bg-slate-200 rounded-md animate-pulse" />
            <div className="w-20 h-3 bg-slate-100 rounded-md animate-pulse" />
          </div>
        </div>
        <div className="w-16 h-6 bg-slate-200 rounded-lg animate-pulse" />
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="w-full h-3 bg-slate-100 rounded-md animate-pulse" />
        <div className="w-3/4 h-3 bg-slate-100 rounded-md animate-pulse" />
      </div>

      <div className="h-10 bg-slate-100/80 rounded-xl border border-slate-200 flex items-center justify-center animate-pulse">
        <div className="w-3/5 h-4 bg-slate-200 rounded" />
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <div className="w-20 h-3 bg-slate-200 rounded animate-pulse" />
        <div className="w-24 h-7 bg-slate-200 rounded-lg animate-pulse" />
      </div>
    </div>
  );
};

/**
 * Reusable File Row Skeleton for Tables
 */
export const FileRowSkeleton: React.FC = () => {
  return (
    <tr className="border-b border-slate-100">
      <td className="px-4 py-3 text-center">
        <div className="w-6 h-4 bg-slate-200 rounded mx-auto animate-pulse" />
      </td>
      <td className="px-4 py-3">
        <div className="w-16 h-4 bg-slate-200 rounded animate-pulse" />
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <div className="w-44 h-4 bg-slate-200 rounded animate-pulse" />
          <div className="w-28 h-3 bg-slate-100 rounded animate-pulse" />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="w-20 h-4 bg-slate-200 rounded animate-pulse" />
      </td>
      <td className="px-4 py-3">
        <div className="w-16 h-4 bg-slate-200 rounded animate-pulse" />
      </td>
      <td className="px-4 py-3">
        <div className="w-32 h-4 bg-slate-100 rounded animate-pulse" />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="w-12 h-6 bg-slate-200 rounded mx-auto animate-pulse" />
      </td>
    </tr>
  );
};

/**
 * Full Page Architectural Loading Skeleton
 * Matches the exact layout, colors, and spatial geometry of the application
 */
export const FullPageSkeleton: React.FC<LoadingSkeletonProps> = ({
  message = 'جاري تحميل وفهرسة الأرشيف السحابي...',
  subMessage = 'الاتصال بقاعدة بيانات Firestore ومزامنة الصناديق والموردين والباركودات',
}) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row overflow-x-hidden font-sans" dir="rtl">
      {/* Top Animated Sync Bar */}
      <TopSyncBar />

      {/* Sidebar Skeleton (Matching Dark Navy #0B1426) */}
      <aside className="hidden lg:flex w-[290px] h-screen bg-[#0B1426] border-l border-slate-800/90 flex-col justify-between shrink-0 select-none">
        <div className="p-5 space-y-6">
          {/* Brand Shimmer */}
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800/80">
            <div className="w-10 h-10 rounded-xl bg-blue-600/60 flex items-center justify-center text-white shadow-sm shrink-0 animate-pulse">
              <Archive className="w-5 h-5 text-blue-200" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-28 bg-slate-700/80 rounded animate-pulse" />
              <div className="h-3 w-20 bg-slate-800 rounded animate-pulse" />
            </div>
          </div>

          {/* Navigation Links Skeleton */}
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-10 rounded-xl bg-slate-800/50 border border-slate-800/60 flex items-center px-3.5 gap-3 animate-pulse"
              >
                <div className="w-4 h-4 rounded bg-slate-700/60 shrink-0" />
                <div className="h-3.5 bg-slate-700/60 rounded flex-1" />
              </div>
            ))}
          </div>

          {/* Quick Box Index Shimmer */}
          <div className="pt-4 border-t border-slate-800/60 space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="h-3 w-24 bg-slate-700/60 rounded animate-pulse" />
              <div className="h-3 w-10 bg-slate-700/60 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-7 bg-slate-800/60 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Footer Shimmer */}
        <div className="p-4 border-t border-slate-800/80 bg-[#08101E]">
          <div className="h-8 bg-slate-800/70 rounded-lg animate-pulse" />
        </div>
      </aside>

      {/* Main Content Skeleton Area */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Header Bar Skeleton */}
        <header className="h-[72px] bg-white border-b border-slate-200/90 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="lg:hidden w-9 h-9 rounded-xl bg-slate-200 animate-pulse" />
            <div className="space-y-1">
              <div className="h-4 w-36 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-48 bg-slate-100 rounded animate-pulse hidden sm:block" />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="h-9 w-28 sm:w-40 bg-slate-200 rounded-xl animate-pulse" />
            <div className="h-9 w-9 bg-slate-200 rounded-xl animate-pulse" />
            <div className="h-9 w-24 bg-blue-100 rounded-xl animate-pulse hidden sm:block" />
          </div>
        </header>

        {/* Central Content Skeleton */}
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* Hero Banner / Sync Notice */}
          <div className="bg-gradient-to-l from-blue-900/90 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-800 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
              <div className="space-y-3 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-mono-num font-semibold text-emerald-300">
                    SMART DOCS ARCHIVE SYSTEM
                  </span>
                </div>

                <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-bold text-white tracking-tight leading-snug">
                  {message}
                </h1>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>{subMessage}</span>
                </p>
              </div>

              <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs min-w-[140px] text-center self-stretch sm:self-auto">
                <div className="w-10 h-10 rounded-full border-2 border-emerald-400/40 border-t-emerald-400 animate-spin mb-2" />
                <span className="text-[11px] font-bold text-slate-200">مزامنة نشطة</span>
                <span className="text-[10px] text-slate-400 font-mono-num">Firestore 100%</span>
              </div>
            </div>
          </div>

          {/* 4 Metric KPI Cards Skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-2 shadow-xs"
              >
                <div className="w-24 h-3 bg-slate-200 rounded animate-pulse" />
                <div className="flex items-baseline gap-2">
                  <div className="w-14 h-8 bg-slate-300 rounded-lg animate-pulse" />
                  <div className="w-10 h-3 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Filter Bar Skeleton */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-16 h-3 bg-slate-200 rounded animate-pulse" />
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-14 h-8 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
            <div className="w-full sm:w-72 h-10 bg-slate-100 rounded-xl border border-slate-200 animate-pulse" />
          </div>

          {/* Box Cards Grid Skeleton (6 Cards) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-36 h-4 bg-slate-200 rounded animate-pulse" />
              <div className="w-24 h-3 bg-slate-100 rounded animate-pulse" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <BoxCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
