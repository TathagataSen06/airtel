import { gstinValid } from './gst-format.mjs';

const read = (text, pattern) => text.match(pattern)?.[1]?.trim() || '';
const clean = (s) => s.replace(/^[ :.;—-]+|[ :.;—-]+$/g, '').trim();
const date = (s) => (s.match(/20\d\d[\s./-]+\d{2}[\s./-]+\d{2}/)?.[0] || '').replace(/[\s./-]+/g, '-');
const ref = (s) => s.replace(/[^A-Z0-9]/g, '');
const addressLabel = s => s.replace(/^SHAP(?=\s*\/\s*UNIT\b)/, 'SHOP');

const digitFromOcr = { O: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };
const letterFromOcr = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };
function formatGst(text) {
  const value = ref(text);
  if (value.length !== 15) return value;
  return Array.from(value, (char, i) => {
    if (i < 2 || (i >= 7 && i <= 10)) return digitFromOcr[char] || char;
    if ((i >= 2 && i <= 6) || i === 11) return letterFromOcr[char] || char;
    if (i === 13 && /^[27]$/.test(char)) return 'Z';
    return char;
  }).join('');
}

function sampleGray(gray, width, height, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix + 1 >= width || iy + 1 >= height) return 255;
  const dx = x - ix, dy = y - iy;
  const index = iy * width + ix;
  const top = gray[index] * (1 - dx) + gray[index + 1] * dx;
  const bottom = gray[index + width] * (1 - dx) + gray[index + width + 1] * dx;
  return top * (1 - dy) + bottom * dy;
}

export function extractFields(kind, raw) {
  const text = raw.toUpperCase().replace(/\r/g, '').replace(/[–—]/g, '-');
  const synthetic = /SPECIMEN|HACKATHON|FICTIONAL/.test(text);
  const get = (pattern) => clean(read(text, pattern));
  const exact = (key) => get(new RegExp('^' + key + '\\s*:\\s*(.+)$', 'm'));
  const combine = (s) => clean(s.replace(/PLACE OF BUSINESS\s*/g, '').replace(/\n/g, ' '));
  if (kind === 'gst') {
    return { synthetic, fields: {
      GSTIN: formatGst(exact('GSTIN') || get(/^\s*GSTIN\s*(.*)$/m)),
      'LEGAL NAME': exact('LEGAL NAME') || get(/^\s*LEGAL NAME\s*(.*)$/m),
      'TRADE NAME': exact('TRADE NAME') || get(/^\s*TRADE NAME\s*(.*)$/m),
      ADDRESS: exact('ADDRESS') || combine(get(/ADDRESS OF PRINCIP[A-Z]*\s*([\s\S]*?)(?:\s*DATE OF LIABILITY|\s*TYPE OF REGISTRATION|$)/))
    } };
  }
  if (kind === 'udyam') {
    return { synthetic, fields: {
      UDYAM: ref(exact('UDYAM') || get(/(UDYAM\s*-\s*[A-Z]{2}\s*-\s*[0-9O]{2}\s*-\s*[0-9O ]{7,14})/))
        .replace(/^(UDYAM[A-Z]{2})(.*)$/, (_, prefix, digits) => prefix + digits.replace(/O/g, '0')),
      'LEGAL NAME': exact('LEGAL NAME') || get(/^\s*ENTERPRISE NAME\s*(.*)$/m)
    } };
  }
  if (kind === 'id') {
    const identifier = get(/SYN[ -]*[IL1]D[ -]*([0-9OILZSGB ]{6,15})/);
    return { synthetic, fields: {
      'SIGNATORY ID': ref(exact('SIGNATORY ID')) || (identifier ? 'SYNID' + ref(identifier).replace(/[OILZSGB]/g, char => digitFromOcr[char]) : ''),
      'SIGNATORY NAME': exact('SIGNATORY NAME') || get(/^\s*NAME\s*([^\n]+)/m),
      'TRADE NAME': exact('TRADE NAME') || get(/^\s*FOR BUSINESS\s*([^\n]+)/m),
      'VALID UNTIL': date(exact('VALID UNTIL') || get(/^\s*VALID TILL\s*([^\n]+)/m))
    } };
  }
  return { synthetic, fields: {
    'LEGAL NAME': exact('LEGAL NAME') || get(/^\s*BILLED TO\s*(.*)$/m),
    ADDRESS: addressLabel(exact('ADDRESS') || combine(get(/SUPPLY ADDRESS\s*([\s\S]*?)\s*BILL DATE/))),
    'ISSUE DATE': date(exact('ISSUE DATE') || get(/BILL DATE\s*([^\n]+)/))
  } };
}

export function drawSpecimen(id, kind, fields) {
  const canvas = document.createElement('canvas');
  canvas.width = 1320;
  canvas.height = 680;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#e6eaef';
  context.fillRect(0, 0, canvas.width, 130);
  context.fillStyle = '#10141c';
  context.font = 'bold 35px monospace';
  context.fillText('UDYAM DEMO SPECIMEN', 50, 64);
  context.font = '24px monospace';
  context.fillText(id + ' / ' + kind.toUpperCase() + ' / SYNTHETIC TEST DATA', 50, 105);
  let row = 202;
  context.font = '30px monospace';
  for (const [label, value] of Object.entries(fields)) {
    context.fillText(label + ': ' + value, 50, row, 1220);
    row += 66;
  }
  context.font = '22px monospace';
  context.fillText('Fictional proof for the Airtel SYNC sandbox.', 50, 620);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

let worker;
function loadScript() {
  if (globalThis.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/tesseract.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

async function getWorker() {
  if (!worker) {
    worker = (async () => {
      await loadScript();
      const instance = await Tesseract.createWorker('eng', 1, {
        workerPath: '/vendor/worker.js', corePath: '/vendor/core.js', langPath: '/vendor',
        workerBlobURL: false, cacheMethod: 'none'
      });
      await instance.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      return instance;
    })().catch(error => { worker = null; throw error; });
  }
  return worker;
}

function inkSharpness(gray, width, height) {
  let edges = 0, ink = 0;
  for (let y = Math.round(height * 0.10); y < Math.round(height * 0.47); y += 2) {
    for (let x = Math.round(width * 0.06); x < Math.round(width * 0.92); x += 2) {
      const i = y * width + x;
      const value = gray[i];
      const laplacian = 4 * value - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      edges += laplacian * laplacian;
      ink += 255 - value;
    }
  }
  return edges / Math.max(1, ink);
}

function detectTilt(gray, width, height) {
  const points = [];
  for (let y = Math.round(height * 0.18); y < Math.round(height * 0.38); y += 2) {
    for (let x = Math.round(width * 0.16); x < Math.round(width * 0.82); x += 2) {
      if (gray[y * width + x] < 130) points.push([x - width / 2, y]);
    }
  }
  if (points.length < 100) return 0;
  const projectionScore = angle => {
    const slope = Math.tan(angle * Math.PI / 180);
    const rows = new Uint16Array(height);
    for (const [x, y] of points) rows[Math.round(y - slope * x)]++;
    return rows.reduce((total, count) => total + count * count, 0);
  };
  const baseline = projectionScore(0);
  let peak = baseline, tilt = 0;
  for (let angle = -12; angle <= 12; angle += 0.5) {
    const score = projectionScore(angle);
    if (score > peak) { peak = score; tilt = angle; }
  }
  return Math.abs(tilt) >= 1.5 && peak >= baseline * 1.12 ? tilt : 0;
}

function grayscalePixels(image, limit) {
  const scale = Math.min(1, limit / image.width);
  const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ix = Math.min(image.width - 1, Math.round(x / scale));
      const iy = Math.min(image.height - 1, Math.round(y / scale));
      const offset = (iy * image.width + ix) * 4;
      const alpha = image.data[offset + 3] / 255;
      const light = 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
      gray[y * width + x] = light * alpha + 255 * (1 - alpha);
    }
  }
  return { gray, width, height };
}

export function prepareDocument(image, kind, { maxWidth = 1450, contrast = 50, estimatedTilt } = {}) {
  const generated = image.width / image.height > 1.8;
  const { gray, width, height } = grayscalePixels(image, maxWidth);
  const sharpness = inkSharpness(gray, width, height);
  const tilt = estimatedTilt ?? (!generated && kind !== 'id' && sharpness >= 12 ? detectTilt(gray, width, height) : 0);
  const cropHeight = generated || kind === 'id' ? height : Math.round(height * 0.59);
  const rgba = new Uint8ClampedArray(width * cropHeight * 4);
  const theta = tilt * Math.PI / 180;
  const c = Math.cos(theta), s = Math.sin(theta);
  const centreX = width / 2, centreY = cropHeight / 2;
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centreX, dy = y - centreY;
      const grayValue = tilt ? sampleGray(gray, width, height, c * dx - s * dy + centreX, s * dx + c * dy + centreY)
        : gray[y * width + x];
      const value = contrast ? Math.min(255, Math.max(0, (grayValue - contrast) * 2)) : grayValue;
      const offset = (y * width + x) * 4;
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = value;
      rgba[offset + 3] = 255;
    }
  }
  return { width, height: cropHeight, data: rgba, tilt, sharpness, quality: sharpness < 12 ? 'blurred' : 'usable' };
}

function gstLineCrop(image) {
  const left = Math.round(image.width * 0.36), top = Math.round(image.height * (0.145 / 0.59));
  const width = 2 * Math.round(image.width * 0.33), height = 2 * Math.round(image.height * (0.051 / 0.59));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = ((top + Math.floor(y / 2)) * image.width + left + Math.floor(x / 2)) * 4;
      data.set(image.data.subarray(source, source + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

export async function readDocument(image, kind, recognize) {
  const prepared = prepareDocument(image, kind);
  if (prepared.quality === 'blurred') return { synthetic: false, fields: {}, quality: prepared.quality };
  const data = await recognize(prepared, '6');
  const result = extractFields(kind, data.text);
  if (kind === 'id' && result.synthetic && !/^SYNID\d{6}$/.test(result.fields['SIGNATORY ID'])) {
    const alternate = prepareDocument(image, kind, { maxWidth: 1100, contrast: 85, estimatedTilt: prepared.tilt });
    const reread = extractFields(kind, (await recognize(alternate, '6')).text);
    if (/^SYNID\d{6}$/.test(reread.fields['SIGNATORY ID'])) result.fields['SIGNATORY ID'] = reread.fields['SIGNATORY ID'];
  }
  if (image.width / image.height < 1.8 && kind === 'gst' && result.synthetic && !gstinValid(result.fields.GSTIN)) {
    const line = await recognize(gstLineCrop(prepared), '7', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    const focused = formatGst(line.text);
    if (gstinValid(focused)) result.fields.GSTIN = focused;
    else {
      const alternate = prepareDocument(image, kind, { maxWidth: 1100, contrast: 85, estimatedTilt: prepared.tilt });
      const reread = extractFields(kind, (await recognize(alternate, '6')).text).fields.GSTIN;
      if (gstinValid(reread)) result.fields.GSTIN = reread;
      else if (focused.length === 15 && line.confidence >= 60) result.fields.GSTIN = focused;
    }
  }
  return { ...result, confidence: data.confidence, quality: prepared.quality, tilt: prepared.tilt };
}

async function browserPixels(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function scanImage(blob, kind) {
  if (!blob || !/^image\/(png|jpeg|webp)$/.test(blob.type) || blob.size > 8_000_000) {
    throw new Error('IMAGE_FORMAT');
  }
  const pixels = await browserPixels(blob);
  const instance = await getWorker();
  return readDocument(pixels, kind, async (image, psm, whitelist = '') => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    await instance.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
    return (await instance.recognize(canvas)).data;
  });
}

export async function sampleImage(specimen, kind, session) {
  if (specimen.fields[kind]) return drawSpecimen(specimen.id, kind, specimen.fields[kind]);
  if (!specimen.files[kind]) return null;
  const response = await fetch(specimen.files[kind], { headers: {
    Authorization: 'Bearer ' + session.token, 'X-Case-Ref': session.id
  } });
  if (!response.ok) throw new Error('SPECIMEN_UNAVAILABLE');
  return response.blob();
}
