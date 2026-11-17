import { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeVoiceAudio } from '../utils/aiVisionService';

export type VoiceTarget = 'global' | 'intra-box' | 'checks-vault';
export type VoiceLanguageHint = 'bilingual' | 'ar-EG' | 'en-US';

interface UseSmartVoiceSearchOptions {
  onTranscript: (text: string, target: VoiceTarget) => void;
  showToast: (msg: string) => void;
}

/**
 * Dual-engine Voice Recognition hook:
 * 1. Primary: MediaRecorder + Web Audio live level meter -> Gemini Audio Transcription (/api/ai-transcribe)
 *    Supports Arabic, Egyptian dialect, English supplier names, and mixed queries across all browsers & mobile.
 * 2. Fallback: Browser Web Speech API when microphone recording isn't available or server transcription fails.
 */
export function useSmartVoiceSearch({ onTranscript, showToast }: UseSmartVoiceSearchOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [activeTarget, setActiveTarget] = useState<VoiceTarget>('global');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // 0..100 live mic intensity
  const [voiceLangHint, setVoiceLangHint] = useState<VoiceLanguageHint>('bilingual');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const speechRecRef = useRef<any>(null);
  const cancelledRef = useRef(false);

  const cleanupRecordingResources = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
    setRecordingSeconds(0);
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      try {
        speechRecRef.current?.abort?.();
      } catch {
        // ignore
      }
      cleanupRecordingResources();
    };
  }, [cleanupRecordingResources]);

  const startWebSpeechFallback = useCallback(
    (target: VoiceTarget) => {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        showToast('تعذر الوصول للميكروفون أو أن المتصفح لا يدعم البحث الصوتي.');
        return;
      }

      const recognition = new SpeechRecognition();
      speechRecRef.current = recognition;
      recognition.lang = voiceLangHint === 'en-US' ? 'en-US' : 'ar-EG';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
        setActiveTarget(target);
        showToast('جاري الاستماع بالمتصفح... تحدث باسم المورد أو رقم الصندوق');
      };

      recognition.onresult = (event: any) => {
        const text = String(event.results?.[0]?.[0]?.transcript || '').trim();
        setIsRecording(false);
        if (text) {
          onTranscript(text, target);
          showToast(`تم التعرف على الكلام: "${text}"`);
        }
      };

      recognition.onerror = () => {
        setIsRecording(false);
        showToast('تعذر التقاط الصوت عبر المتصفح، تأكد من صلاحية الميكروفون.');
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      try {
        recognition.start();
      } catch {
        setIsRecording(false);
        showToast('تعذر بدء البحث الصوتي، تأكد من السماح بصلاحية الميكروفون.');
      }
    },
    [onTranscript, showToast, voiceLangHint]
  );

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      cancelledRef.current = false;
      mediaRecorderRef.current.stop();
    } else if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
    }
  }, []);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.abort();
      } catch {
        // ignore
      }
    }
    cleanupRecordingResources();
    setIsRecording(false);
    setIsTranscribing(false);
  }, [cleanupRecordingResources]);

  const startVoiceSearch = useCallback(
    async (target: VoiceTarget = 'global') => {
      // Toggle stop if user taps Mic while already recording
      if (isRecording) {
        stopRecording();
        return;
      }

      if (isTranscribing) return;

      // Check MediaRecorder availability for Gemini AI Speech Transcription
      const supportsMediaRecorder =
        typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== 'undefined';

      if (!supportsMediaRecorder) {
        startWebSpeechFallback(target);
        return;
      }

      try {
        cancelledRef.current = false;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];
        setActiveTarget(target);
        setIsRecording(true);
        setRecordingSeconds(0);

        // Live audio level meter
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateLevel = () => {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const avg = sum / dataArray.length;
              setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
              rafRef.current = requestAnimationFrame(updateLevel);
            };
            rafRef.current = requestAnimationFrame(updateLevel);
          }
        } catch {
          // ignore WebAudio meter failure
        }

        const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);

        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          const chunks = audioChunksRef.current;
          const mime = recorder.mimeType || 'audio/webm';
          cleanupRecordingResources();
          setIsRecording(false);

          if (cancelledRef.current || chunks.length === 0) {
            return;
          }

          const blob = new Blob(chunks, { type: mime });
          if (blob.size < 400) {
            showToast('التسجيل قصير جداً، حاول التحدث بوضوح.');
            return;
          }

          setIsTranscribing(true);
          try {
            const { transcript } = await transcribeVoiceAudio(blob);
            if (transcript) {
              onTranscript(transcript, target);
              showToast(`تم التعرف على الكلام: "${transcript}"`);
            } else {
              showToast('لم يتم التقاط كلمات واضحة، يرجى المحاولة مرة أخرى.');
            }
          } catch (err: any) {
            console.warn('Gemini audio transcribe failed, notice:', err);
            showToast(err?.message || 'تعذر تحويل التسجيل الصوتي إلى نص.');
          } finally {
            setIsTranscribing(false);
          }
        };

        recorder.start(250);
        timerRef.current = window.setInterval(() => {
          setRecordingSeconds((prev) => {
            const next = prev + 1;
            if (next >= 20) {
              stopRecording();
            }
            return next;
          });
        }, 1000);
      } catch (err) {
        console.warn('Microphone access denied or unavailable, trying browser speech fallback:', err);
        cleanupRecordingResources();
        setIsRecording(false);
        startWebSpeechFallback(target);
      }
    },
    [
      isRecording,
      isTranscribing,
      stopRecording,
      startWebSpeechFallback,
      cleanupRecordingResources,
      onTranscript,
      showToast,
    ]
  );

  return {
    isRecording,
    isTranscribing,
    activeTarget,
    recordingSeconds,
    audioLevel,
    voiceLangHint,
    setVoiceLangHint,
    startVoiceSearch,
    stopRecording,
    cancelRecording,
  };
}
