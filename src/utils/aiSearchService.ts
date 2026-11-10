/**
 * Service to communicate with server-side AI Search API (/api/ai-search)
 * Supporting Google Gemini (free/system or custom), OpenAI ChatGPT, Anthropic Claude, and DeepSeek.
 */

export interface AiSearchResponse {
  isAiActive: boolean;
  query: string;
  providerUsed?: string;
  interpretedIntent: {
    targetSupplierName?: string | null;
    alternateSearchTerms?: string[];
    targetBoxNumber?: number | null;
    targetYear?: number | null;
    fileType?: 'check' | 'doc' | 'all';
    directAnswerAr?: string;
    suggestedQueries?: string[];
    correctedQuery?: string;
    detectedLanguage?: string;
  };
}

export interface AiConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'deepseek';
  apiKey: string;
  model?: string;
}

const AI_CONFIG_STORAGE_KEY = 'archive_ai_provider_config_v1';

export function getStoredAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    // fallback
  }
  return { provider: 'gemini', apiKey: '', model: '' };
}

export function saveStoredAiConfig(config: AiConfig) {
  try {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    // fallback
  }
}

export async function askGeminiAiSearch(query: string): Promise<AiSearchResponse | null> {
  if (!query || !query.trim()) return null;

  const config = getStoredAiConfig();

  try {
    const res = await fetch('/api/ai-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-provider': config.provider || 'gemini',
        'x-custom-api-key': config.apiKey || '',
        'x-ai-model': config.model || '',
      },
      body: JSON.stringify({
        query: query.trim(),
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
      }),
    });

    if (!res.ok) {
      console.warn('AI search returned non-200 status:', res.status);
      return null;
    }

    const data: AiSearchResponse = await res.json();
    return data;
  } catch (err) {
    console.error('Failed to contact AI search endpoint:', err);
    return null;
  }
}
