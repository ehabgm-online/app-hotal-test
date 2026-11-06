import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Standard ISO/IEC 15417 Code-128 module width patterns (0..106)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

export function encodeCode128B(text: string): { bars: Array<{ x: number; w: number }>; totalModules: number } {
  const codes: number[] = [104]; // Start Code B
  let checksum = 104;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const val = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    codes.push(val);
    checksum += val * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop Code

  const bars: Array<{ x: number; w: number }> = [];
  let cursor = 10; // Quiet zone

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    for (let j = 0; j < pattern.length; j++) {
      const width = Number(pattern[j]);
      if (j % 2 === 0) {
        bars.push({ x: cursor, w: width });
      }
      cursor += width;
    }
  }

  cursor += 10; // Trailing quiet zone
  return { bars, totalModules: cursor };
}

interface Code128BarcodeProps {
  value: string;
  height?: number;
  className?: string;
  showLabel?: boolean;
}

export const Code128Barcode: React.FC<Code128BarcodeProps> = ({
  value,
  height = 46,
  className = '',
  showLabel = true,
}) => {
  const { bars, totalModules } = encodeCode128B(value);
  const svgHeight = showLabel ? height + 18 : height;

  return (
    <svg
      viewBox={`0 0 ${totalModules} ${svgHeight}`}
      className={`w-full max-w-full select-none ${className}`}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <rect x="0" y="0" width={totalModules} height={svgHeight} fill="#FFFFFF" />
      {bars.map((bar, idx) => (
        <rect key={idx} x={bar.x} y={2} width={bar.w} height={height - 4} fill="#0F172A" />
      ))}
      {showLabel && (
        <text
          x={totalModules / 2}
          y={height + 13}
          textAnchor="middle"
          fill="#0F172A"
          fontSize="10.5"
          fontFamily="'IBM Plex Mono', monospace"
          fontWeight="600"
          letterSpacing="1.4"
        >
          {value}
        </text>
      )}
    </svg>
  );
};

interface BoxQrCodeProps {
  value: string;
  size?: number;
  className?: string;
  onDataUrlReady?: (dataUrl: string) => void;
}

export const BoxQrCode: React.FC<BoxQrCodeProps> = ({
  value,
  size = 160,
  className = '',
  onDataUrlReady,
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0B1426',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) {
          setDataUrl(url);
          onDataUrlReady?.(url);
        }
      })
      .catch(() => {
        if (active) setDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [value, size, onDataUrlReady]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200 text-slate-400 text-xs ${className}`}
      >
        QR...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR Code"
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className={`block select-none bg-white ${className}`}
    />
  );
};
