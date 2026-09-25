import sharp from 'sharp';

export const MODES = ['true', 'gray', 'color', 'half', 'optimized'];

// Mix left/right eye pixels into one red/cyan pixel.
function mix(mode, l, r, out, o) {
  const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  switch (mode) {
    case 'true':
      out[o] = lum(l); out[o + 1] = 0; out[o + 2] = lum(r);
      break;
    case 'gray': {
      const gl = lum(l), gr = lum(r);
      out[o] = gl; out[o + 1] = gr; out[o + 2] = gr;
      break;
    }
    case 'color':
      out[o] = l[0]; out[o + 1] = r[1]; out[o + 2] = r[2];
      break;
    case 'half':
      out[o] = lum(l); out[o + 1] = r[1]; out[o + 2] = r[2];
      break;
    case 'optimized':
    default:
      out[o] = 0.7 * l[1] + 0.3 * l[2]; out[o + 1] = r[1]; out[o + 2] = r[2];
  }
}

/**
 * opts: mode, shift (% of width, whole-image parallax), depth (% of width, per-pixel
 * parallax driven by a pseudo depth map), blur (depth map smoothness), swap, maxSize
 */
export async function makeAnaglyph(input, opts) {
  const { mode, shift, depth, blur, swap, maxSize } = opts;

  const base = sharp(input).rotate().removeAlpha()
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  let depthMap = null;
  if (depth > 0) {
    depthMap = await sharp(data, { raw: { width: w, height: h, channels: 3 } })
      .greyscale().blur(Math.max(0.3, blur)).normalise().raw().toBuffer();
  }

  const baseShift = (shift / 100) * w;
  const depthAmt = (depth / 100) * w;
  const out = Buffer.alloc(w * h * 3);
  const l = [0, 0, 0], r = [0, 0, 0];

  const sample = (x, y, dst) => {
    const xi = Math.min(w - 1, Math.max(0, Math.round(x)));
    const i = (y * w + xi) * 3;
    dst[0] = data[i]; dst[1] = data[i + 1]; dst[2] = data[i + 2];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = baseShift + (depthMap ? (depthMap[y * w + x] / 255 - 0.5) * depthAmt : 0);
      const half = swap ? -d / 2 : d / 2;
      sample(x + half, y, l);
      sample(x - half, y, r);
      mix(mode, l, r, out, (y * w + x) * 3);
    }
  }
  return { raw: out, width: w, height: h };
}

export function encode({ raw, width, height }, format, quality) {
  const img = sharp(raw, { raw: { width, height, channels: 3 } });
  return format === 'jpeg' ? img.jpeg({ quality }).toBuffer() : img.png().toBuffer();
}
