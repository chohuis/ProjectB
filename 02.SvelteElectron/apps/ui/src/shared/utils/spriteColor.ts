/**
 * PNG 스프라이트 런타임 팀 컬러 교체 유틸 (HSL Hue 교체 방식)
 *
 * RGB 거리 방식 대신 HSL Hue 범위로 유니폼 픽셀을 감지합니다.
 * 정확한 placeholder 색상과 무관하게 동작하므로 PNG가 어떤 파란/빨간 계열이어도 처리됩니다.
 *
 * 투수: Hue 195~265° (파란/네이비 계열)
 * 타자: Hue 335~360° 또는 0~25° (빨간/크림슨 계열)
 */

// ── HSL 변환 ───────────────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else                h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h)       * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── 유니폼 픽셀 감지 ────────────────────────────────────────────────────────

/** 투수 유니폼 픽셀 여부 (파란/네이비 Hue 범위) */
function isPitcherUniform(r: number, g: number, b: number): boolean {
  const [h, s, l] = rgbToHsl(r, g, b);
  return h >= 195 && h <= 270 && s > 0.3 && l > 0.08 && l < 0.80;
}

/** 타자 유니폼 픽셀 여부 (빨간/크림슨 Hue 범위) */
function isBatterUniform(r: number, g: number, b: number): boolean {
  const [h, s, l] = rgbToHsl(r, g, b);
  return (h >= 330 || h <= 30) && s > 0.40 && l > 0.08 && l < 0.75;
}

// ── Hue 교체 ────────────────────────────────────────────────────────────────

function replaceHue(
  sr: number, sg: number, sb: number,
  targetHex: string,
  isUniform: (r: number, g: number, b: number) => boolean
): [number, number, number] | null {
  if (!isUniform(sr, sg, sb)) return null;
  const [, , l] = rgbToHsl(sr, sg, sb);
  const [tr, tg, tb] = hexToRgb(targetHex);
  const [th, ts] = rgbToHsl(tr, tg, tb);
  // 픽셀의 명도는 유지하고, 팀 컬러의 Hue·Saturation 적용
  const newSat = Math.max(0.25, Math.min(1, ts));
  return hslToRgb(th, newSat, l);
}

// ── Canvas 처리 ─────────────────────────────────────────────────────────────

async function recolorSprite(
  src: string,
  targetHex: string,
  isUniform: (r: number, g: number, b: number) => boolean
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(src); return; }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 20) continue;
          const result = replaceHue(data[i], data[i + 1], data[i + 2], targetHex, isUniform);
          if (result) {
            [data[i], data[i + 1], data[i + 2]] = result;
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

// ── 캐시 ────────────────────────────────────────────────────────────────────

const cache = new Map<string, string>();

/** 투수 스프라이트에 팀 컬러 적용 (파란 계열 → teamColorHex) */
export async function getPitcherSprite(originalSrc: string, teamColorHex: string): Promise<string> {
  if (!teamColorHex) return originalSrc;
  const key = `P:${originalSrc}__${teamColorHex}`;
  if (cache.has(key)) return cache.get(key)!;
  const result = await recolorSprite(originalSrc, teamColorHex, isPitcherUniform);
  cache.set(key, result);
  return result;
}

/** 타자 스프라이트에 팀 컬러 적용 (빨간 계열 → teamColorHex) */
export async function getBatterSprite(originalSrc: string, teamColorHex: string): Promise<string> {
  if (!teamColorHex) return originalSrc;
  const key = `B:${originalSrc}__${teamColorHex}`;
  if (cache.has(key)) return cache.get(key)!;
  const result = await recolorSprite(originalSrc, teamColorHex, isBatterUniform);
  cache.set(key, result);
  return result;
}

export function clearSpriteCache() {
  cache.clear();
}
