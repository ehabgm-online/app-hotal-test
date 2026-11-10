/**
 * Service to communicate with server-side AI Vision OCR API (/api/ai-vision-extract)
 */

export interface VisionExtractedData {
  supplierName?: string | null;
  docNo?: string | null;
  checkNo?: string | null;
  amount?: number | null;
  year?: number | null;
  notes?: string;
  suggestedBoxNumber?: number | null;
}

export async function extractDocumentFromImage(file: File): Promise<VisionExtractedData | null> {
  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/ai-vision-extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: file.type || 'image/jpeg',
      }),
    });

    if (!res.ok) {
      console.warn('AI vision extract non-200 status:', res.status);
      return null;
    }

    const data = await res.json();
    return data?.extractedData || null;
  } catch (err) {
    console.error('Failed to process image via AI vision:', err);
    return null;
  }
}
