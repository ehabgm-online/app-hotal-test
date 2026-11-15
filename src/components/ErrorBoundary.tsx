import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.removeItem('smart_docs_boxes_data_v1');
    } catch (e) {
      // ignore
    }
    window.location.href = `${window.location.origin}/#/`;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 font-sans"
          dir="rtl"
        >
          <div className="max-w-md w-full bg-slate-800 border-2 border-rose-500/50 rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/30">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold font-display text-white">
                تم رصد خطأ غير متوقع وتأمينه بنجاح
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                قام نظام الحماية باحتواء الخطأ لضمان سلامة قاعدة البيانات والأرشيف. يمكنك إعادة تشغيل النظام فوراً أو استعادة النسخة النظيفة.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة تشغيل النظام فوراً</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetCache}
                className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>تفريغ الذاكرة المؤقتة واستعادة البيانات المحدثة</span>
              </button>
            </div>

            {this.state.error && (
              <details className="text-left text-[11px] font-mono text-slate-400 bg-slate-950/60 p-3 rounded-lg overflow-x-auto" dir="ltr">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Technical Details</summary>
                <div className="mt-2 text-rose-300 break-words">{this.state.error.toString()}</div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
