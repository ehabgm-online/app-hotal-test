import React, { useState } from 'react';
import { Lock, User, ShieldCheck, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { authenticateUser, saveActiveSession, UserAccount } from '../services/authService';

interface UserLoginModalProps {
  onLoginSuccess: (user: UserAccount) => void;
}

export function UserLoginModal({ onLoginSuccess }: UserLoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = authenticateUser(username, password);
      setIsLoading(false);
      if (res.success && res.user) {
        saveActiveSession(res.user);
        onLoginSuccess(res.user);
      } else {
        setError(res.error || 'خطأ في بيانات الدخول');
      }
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-indigo-900/40 px-6 py-8 text-center border-b border-slate-800">
          <div className="w-16 h-16 bg-blue-600/20 border border-blue-500/40 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-lg shadow-blue-500/10">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-white">نظام الأرشيف الذكي الآمن</h2>
          <p className="text-xs text-slate-400 mt-1">يرجى إدخال بيانات المستخدم وكلمة المرور الخاصة بك</p>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">اسم المستخدم</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                required
                className="w-full pr-10 pl-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-500">
                <KeyRound className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور السرية"
                required
                className="w-full pr-10 pl-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>
          </div>


          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span>جاري التحقق...</span>
            ) : (
              <>
                <span>تسجيل الدخول</span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
