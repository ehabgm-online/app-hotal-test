/**
 * Services for Server-Side AI Vision OCR / Bilingual Arabic-English / Handwriting Recognition (/api/ai-vision-extract)
 * and Server-Side Gemini Speech-to-Text Transcription (/api/ai-transcribe).
 */

export type VisionScanMode = 'auto' | 'handwriting' | 'check' | 'invoice';
export type VisionEnhancementPreset = 'original' | 'scan-crisp' | 'handwriting-ink' | 'shadow-remove';

export interface VisionExtractedItem {
  supplierName: string;
  supplierNameAr?: string | null;
  supplierNameEn?: string | null;
  docNo?: string | null;
  checkNo?: string | null;
  amount?: number | null;
  year?: number | null;
  notes?: string | null;
}

export interface VisionExtractedData {
  supplierName?: string | null;
  supplierNameAr?: string | null;
  supplierNameEn?: string | null;
  primaryLanguage?: 'ar' | 'en' | 'mixed';
  docNo?: string | null;
  checkNo?: string | null;
  bankName?: string | null;
  documentDate?: string | null;
  amount?: number | null;
  currency?: 'EGP' | 'USD' | 'EUR' | 'OTHER';
  year?: number | null;
  envelopeOrFileHint?: string | null;
  notes?: string;
  suggestedBoxNumber?: number | null;
  documentType?: 'handwritten-note' | 'bank-check' | 'printed-invoice' | 'envelope-manifest' | 'mixed';
  handwritingDetected?: boolean;
  handwritingQuality?: 'clear' | 'moderate' | 'challenging';
  arabicText?: string;
  englishText?: string;
  rawTranscribedText?: string;
  documentSummaryAr?: string;
  confidenceNotes?: string | null;
  extractedKeywords?: string[];
  extractedItems?: VisionExtractedItem[];
}

export interface VisionImageEnhanceOptions {
  rotateDeg?: 0 | 90 | 180 | 270;
  preset?: VisionEnhancementPreset;
  highContrastHandwriting?: boolean;
  brightnessBoost?: boolean;
  maxDimension?: number;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Estimates coarse local background illumination on a downsampled grid and applies
 * smooth bilinear paper-normalization or adaptive handwriting ink enhancement directly on pixels.
 */
function applyPixelDocumentEnhancement(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  preset: VisionEnhancementPreset,
  brightnessBoost: boolean
) {
  if (preset === 'original' && !brightnessBoost) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const totalPixels = w * h;

  if (preset === 'scan-crisp' || (preset === 'original' && brightnessBoost)) {
    // Compute 2nd & 98th percentile luminance for clean auto-levels stretch
    const hist = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 16) {
      const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      hist[lum]++;
    }
    const sampledCount = Math.ceil(totalPixels / 4);
    const lowThresh = sampledCount * 0.02;
    const highThresh = sampledCount * 0.985;
    let acc = 0;
    let minL = 0;
    let maxL = 255;
    for (let l = 0; l < 256; l++) {
      acc += hist[l];
      if (acc >= lowThresh) {
        minL = l;
        break;
      }
    }
    acc = 0;
    for (let l = 0; l < 256; l++) {
      acc += hist[l];
      if (acc >= highThresh) {
        maxL = l;
        break;
      }
    }
    const span = Math.max(40, maxL - minL);
    const scale = 255 / span;
    const boost = brightnessBoost ? 18 : 0;

    for (let i = 0; i < data.length; i += 4) {
      let r = (data[i] - minL) * scale + boost;
      let g = (data[i + 1] - minL) * scale + boost;
      let b = (data[i + 2] - minL) * scale + boost;
      // Subtle clarity punch around midtones
      if (preset === 'scan-crisp') {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const factor = lum < 165 ? 0.92 : 1.04;
        r *= factor;
        g *= factor;
        b *= factor;
      }
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  // Coarse block grid background estimation (handles shadows & uneven paper lighting)
  const gridW = Math.max(16, Math.min(48, Math.round(w / 32)));
  const gridH = Math.max(16, Math.min(48, Math.round(h / 32)));
  const bgR = new Float32Array(gridW * gridH);
  const bgG = new Float32Array(gridW * gridH);
  const bgB = new Float32Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.floor((gy * h) / gridH);
    const y1 = Math.min(h, Math.floor(((gy + 1) * h) / gridH));
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor((gx * w) / gridW);
      const x1 = Math.min(w, Math.floor(((gx + 1) * w) / gridW));
      // Use top-quartile (brightest 25% samples) inside cell to estimate clean paper color
      let maxLumR = 180;
      let maxLumG = 180;
      let maxLumB = 180;
      let bestSum = -1;
      const stepY = Math.max(1, Math.floor((y1 - y0) / 5));
      const stepX = Math.max(1, Math.floor((x1 - x0) / 5));
      for (let py = y0; py < y1; py += stepY) {
        const rowOffset = py * w;
        for (let px = x0; px < x1; px += stepX) {
          const idx = (rowOffset + px) * 4;
          const sum = data[idx] + data[idx + 1] + data[idx + 2];
          if (sum > bestSum) {
            bestSum = sum;
            maxLumR = Math.max(90, data[idx]);
            maxLumG = Math.max(90, data[idx + 1]);
            maxLumB = Math.max(90, data[idx + 2]);
          }
        }
      }
      const gIdx = gy * gridW + gx;
      bgR[gIdx] = maxLumR;
      bgG[gIdx] = maxLumG;
      bgB[gIdx] = maxLumB;
    }
  }

  // Smooth the background grid once (3x3 box pass) so paper transitions never band
  const smoothGrid = (src: Float32Array) => {
    const dst = new Float32Array(src.length);
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        let sum = 0;
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = gy + dy;
          if (ny < 0 || ny >= gridH) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= gridW) continue;
            sum += src[ny * gridW + nx];
            cnt++;
          }
        }
        dst[gy * gridW + gx] = sum / cnt;
      }
    }
    return dst;
  };

  const sR = smoothGrid(bgR);
  const sG = smoothGrid(bgG);
  const sB = smoothGrid(bgB);

  const isInkMode = preset === 'handwriting-ink';
  const boost = brightnessBoost ? 16 : 0;

  for (let y = 0; y < h; y++) {
    const fy = ((y + 0.5) * gridH) / h - 0.5;
    const gy0 = Math.max(0, Math.min(gridH - 1, Math.floor(fy)));
    const gy1 = Math.max(0, Math.min(gridH - 1, gy0 + 1));
    const ty = Math.max(0, Math.min(1, fy - gy0));

    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) * gridW) / w - 0.5;
      const gx0 = Math.max(0, Math.min(gridW - 1, Math.floor(fx)));
      const gx1 = Math.max(0, Math.min(gridW - 1, gx0 + 1));
      const tx = Math.max(0, Math.min(1, fx - gx0));

      const i00 = gy0 * gridW + gx0;
      const i10 = gy0 * gridW + gx1;
      const i01 = gy1 * gridW + gx0;
      const i11 = gy1 * gridW + gx1;

      const bR = (sR[i00] * (1 - tx) + sR[i10] * tx) * (1 - ty) + (sR[i01] * (1 - tx) + sR[i11] * tx) * ty;
      const bG = (sG[i00] * (1 - tx) + sG[i10] * tx) * (1 - ty) + (sG[i01] * (1 - tx) + sG[i11] * tx) * ty;
      const bB = (sB[i00] * (1 - tx) + sB[i10] * tx) * (1 - ty) + (sB[i01] * (1 - tx) + sB[i11] * tx) * ty;

      const idx = (y * w + x) * 4;
      const nr = (data[idx] / Math.max(60, bR)) * 246 + boost;
      const ng = (data[idx + 1] / Math.max(60, bG)) * 246 + boost;
      const nb = (data[idx + 2] / Math.max(60, bB)) * 246 + boost;

      if (isInkMode) {
        // Isolate dark ink strokes on clean white background for faint handwriting
        const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
        const ink = lum > 205 ? 255 : lum < 115 ? lum * 0.55 : (lum - 115) * (195 / 90) + 60;
        const val = clampByte(ink);
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
      } else {
        // Color-preserving shadow removal
        data[idx] = clampByte(nr);
        data[idx + 1] = clampByte(ng);
        data[idx + 2] = clampByte(nb);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Optimizes camera photos / document scans client-side before sending to Vision OCR:
 * - Resizes oversized mobile images to <= maxDimension (default 2200px)
 * - Applies user-selected rotation (0/90/180/270)
 * - Applies adaptive pixel-level document enhancements (crisp scan, handwriting ink isolation, shadow removal)
 */
export async function preprocessImageForVision(
  file: File,
  options: VisionImageEnhanceOptions = {}
): Promise<{ dataUrl: string; mimeType: string }> {
  const {
    rotateDeg = 0,
    preset: explicitPreset,
    highContrastHandwriting = false,
    brightnessBoost = false,
    maxDimension = 2200,
  } = options;

  const preset: VisionEnhancementPreset =
    explicitPreset ?? (highContrastHandwriting ? 'handwriting-ink' : 'original');

  const readAsDataUrl = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (err) => reject(err);
      el.src = objectUrl;
    });

    const needsResize = img.width > maxDimension || img.height > maxDimension;
    if (!needsResize && rotateDeg === 0 && preset === 'original' && !brightnessBoost) {
      const rawUrl = await readAsDataUrl();
      return { dataUrl: rawUrl, mimeType: file.type || 'image/jpeg' };
    }

    const scale = needsResize ? Math.min(maxDimension / img.width, maxDimension / img.height) : 1;
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const isQuarterTurn = rotateDeg === 90 || rotateDeg === 270;
    const canvas = document.createElement('canvas');
    canvas.width = isQuarterTurn ? targetH : targetW;
    canvas.height = isQuarterTurn ? targetW : targetH;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      const rawUrl = await readAsDataUrl();
      return { dataUrl: rawUrl, mimeType: file.type || 'image/jpeg' };
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotateDeg * Math.PI) / 180);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();

    applyPixelDocumentEnhancement(canvas, ctx, preset, brightnessBoost);

    const outputMime = 'image/jpeg';
    const dataUrl = canvas.toDataURL(outputMime, 0.94);
    return { dataUrl, mimeType: outputMime };
  } catch {
    const rawUrl = await readAsDataUrl();
    return { dataUrl: rawUrl, mimeType: file.type || 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function extractDocumentsFromImages(
  items: Array<{ file: File; options?: VisionImageEnhanceOptions }>,
  scanMode: VisionScanMode = 'auto',
  knownSuppliers: string[] = []
): Promise<{ extractedData: VisionExtractedData | null; processedPreviewUrls: string[] }> {
  try {
    const processed = await Promise.all(
      items.slice(0, 4).map((item) => preprocessImageForVision(item.file, item.options || {}))
    );

    const res = await fetch('/api/ai-vision-extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        images: processed.map((p) => ({
          imageBase64: p.dataUrl,
          mimeType: p.mimeType,
        })),
        scanMode,
        knownSuppliers: knownSuppliers.slice(0, 120),
      }),
    });

    if (!res.ok) {
      let errMsg = `فشل تحليل الصورة (${res.status})`;
      try {
        const errBody = await res.json();
        if (errBody?.error) errMsg = String(errBody.error);
      } catch {
        // ignore JSON parse error on non-200 body
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    return {
      extractedData: data?.extractedData || null,
      processedPreviewUrls: processed.map((p) => p.dataUrl),
    };
  } catch (err) {
    console.error('Failed to process images via AI vision:', err);
    throw err instanceof Error ? err : new Error('تعذر الاتصال بخدمة تحليل الصور.');
  }
}

export async function extractDocumentFromImage(
  file: File,
  scanMode: VisionScanMode = 'auto',
  enhanceOptions: VisionImageEnhanceOptions = {},
  knownSuppliers: string[] = []
): Promise<{ extractedData: VisionExtractedData | null; processedPreviewUrl?: string }> {
  const res = await extractDocumentsFromImages(
    [{ file, options: enhanceOptions }],
    scanMode,
    knownSuppliers
  );
  return {
    extractedData: res.extractedData,
    processedPreviewUrl: res.processedPreviewUrls[0],
  };
}

export async function transcribeVoiceAudio(
  audioBlob: Blob
): Promise<{ transcript: string; model?: string }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(audioBlob);
  });

  const res = await fetch('/api/ai-transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioBase64: base64,
      mimeType: audioBlob.type || 'audio/webm',
    }),
  });

  if (!res.ok) {
    let errMsg = `تعذر تحويل الصوت (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error) errMsg = String(errBody.error);
    } catch {
      // ignore parse failure
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  return {
    transcript: String(data?.transcript || '').trim(),
    model: data?.model,
  };
}
