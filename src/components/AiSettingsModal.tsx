import React, { useState } from 'react';
import { Sparkles, Key, ShieldCheck, Check, X, ExternalLink, Cpu, RefreshCw } from 'lucide-react';
import { AiConfig, getStoredAiConfig, saveStoredAiConfig } from '../utils/aiSearchService';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveToast: (msg: string) => void;
}

export function AiSettingsModal({ isOpen, onClose, onSaveToast }: AiSettingsModalProps) {
  const [config, setConfig] = useState<AiConfig>(getStoredAiConfig);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveStoredAiConfig(config);
    onSaveToast('تم حفظ إعدادات الذكاء الاصطناعي ونماذج البحث بنجاح!');
    onClose();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-provider': config.provider,
          'x-custom-api-key': config.apiKey,
          'x-ai-model': config.model || '',
        },
        body: JSON.stringify({
          query: 'اختبار الاتصال دومتي',
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
        }),
      });
      const data = await res.json();
      if (res.ok && data) {
        setTestResult({
          success: true,
          message: `تم الاتصال بنجاح (${data.providerUsed || config.provider})! الاستجابة: "${data.interpretedIntent?.directAnswerAr || 'متصل'}"`,
        });
      } else {
        setTestResult({
          success: false,
          message: 'فشل الاتصال، يرجى التأكد من مفتاح API الصحيح.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `خطأ في الاتصال: ${err?.message || 'غير معروف'}`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold">إعدادات الذكاء الاصطناعي ونماذج البحث الذكية</h3>
              <p className="text-xs text-emerald-100">اختر محرك الذكاء الاصطناعي (مجاني أو مفتاح API خاص)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              اختر مزود الذكاء الاصطناعي (AI Provider)
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'gemini', name: 'Google Gemini (مجاني / افتراضي)', desc: 'مدمج في النظام بدون مفتاح' },
                { id: 'openai', name: 'OpenAI ChatGPT', desc: 'GPT-4o / GPT-4o-mini' },
                { id: 'anthropic', name: 'Anthropic Claude', desc: 'Claude 3.5 Sonnet / Haiku' },
                { id: 'deepseek', name: 'DeepSeek AI', desc: 'DeepSeek Chat & Reasoner' },
              ].map((p) => (
                <div
                  key={p.id}
                  onClick={() => setConfig({ ...config, provider: p.id as any })}
                  className={`cursor-pointer border rounded-xl p-3.5 transition-all ${
                    config.provider === p.id
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">{p.name}</span>
                    {config.provider === p.id && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* API Key Input (if not gemini) */}
          {config.provider !== 'gemini' && (
            <div className="space-y-2 animate-in fade-in duration-200">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>مفتاح API الخاص بـ {config.provider.toUpperCase()}</span>
                <a
                  href={
                    config.provider === 'openai'
                      ? 'https://platform.openai.com/api-keys'
                      : config.provider === 'anthropic'
                      ? 'https://console.anthropic.com/'
                      : 'https://platform.deepseek.com/'
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-600 hover:underline flex items-center gap-1 font-normal"
                >
                  إنشاء مفتاح <ExternalLink className="w-3 h-3" />
                </a>
              </label>
              <div className="relative">
                <Key className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder={`أدخل مفتاح ${config.provider} (يبدأ بـ ${config.provider === 'openai' ? 'sk-' : config.provider === 'anthropic' ? 'sk-ant-' : 'sk-'})...`}
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مفتاحك يتم تخزينه محلياً في متصفحك فقط ولا يتم إرساله لأي جهة خارجية سوى نموذج الذكاء الاصطناعي المختار.
              </p>
            </div>
          )}

          {config.provider === 'gemini' && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">وضع الذكاء الاصطناعي المجاني (Gemini)</span>
                يستخدم النظام نموذج Google Gemini 3.8 Flash الذكي مع قاعدة مطابقة هجينة محلية فائقة السرعة. لا حاجة لإدخال أي مفتاح.
              </div>
            </div>
          )}

          {/* Optional Model Override */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              اسم النموذج المخصص (اختياري)
            </label>
            <input
              type="text"
              value={config.model || ''}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder={
                config.provider === 'openai'
                  ? 'gpt-4o-mini (الافتراضي)'
                  : config.provider === 'anthropic'
                  ? 'claude-3-5-sonnet-20241022'
                  : config.provider === 'deepseek'
                  ? 'deepseek-chat'
                  : 'gemini-3.8-flash'
              }
              className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Test Result Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              {testResult.success ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <X className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>{testResult.message}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || (config.provider !== 'gemini' && !config.apiKey.trim())}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
              اختبار الاتصال
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <Cpu className="w-4 h-4" />
                حفظ الإعدادات
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
