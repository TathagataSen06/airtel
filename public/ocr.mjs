const read = (text, pattern) => text.match(pattern)?.[1]?.trim() || '';
const clean = (s) => s.replace(/^[ :.;—-]+|[ :.;—-]+$/g, '').trim();
const date = (s) => (s.match(/20\d\d[\s./-]+\d{2}[\s./-]+\d{2}/)?.[0] || '').replace(/[\s./-]+/g, '-');
const ref = (s) => s.replace(/[^A-Z0-9]/g, '');

const digitFromOcr = { O: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };
const letterFromOcr = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };
function formatGst(text) {
  const value = ref(text);
  if (value.length !== 15) return value;
  return Array.from(value, (char, i) => {
    if (i < 2 || (i >= 7 && i <= 10)) return digitFromOcr[char] || char;
    if ((i >= 2 && i <= 6) || i === 11) return letterFromOcr[char] || char;
    return char;
  }).join('');
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
    return { synthetic, fields: {
      'SIGNATORY ID': ref(exact('SIGNATORY ID') || get(/(SYN\s*-\s*ID\s*-\s*\d{6})/)),
      'SIGNATORY NAME': exact('SIGNATORY NAME') || get(/^\s*NAME\s*([^\n]+)/m),
      'TRADE NAME': exact('TRADE NAME') || get(/^\s*FOR BUSINESS\s*([^\n]+)/m)
    } };
  }
  return { synthetic, fields: {
    'LEGAL NAME': exact('LEGAL NAME') || get(/^\s*BILLED TO\s*(.*)$/m),
    ADDRESS: exact('ADDRESS') || combine(get(/SUPPLY ADDRESS\s*([\s\S]*?)\s*BILL DATE/)),
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

async function preprocess(blob, kind, tilt) {
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  const generated = image.width / image.height > 1.8;
  const max = generated ? 1450 : 1250;
  const scale = Math.min(1, max / image.width);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale * (generated || kind === 'id' ? 1 : 0.59));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (tilt) {
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(tilt * Math.PI / 180);
    context.translate(-canvas.width / 2, -canvas.height / 2);
  }
  context.drawImage(image, 0, 0, canvas.width, Math.round(image.height * scale));
  image.close();
  const sample = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < sample.data.length; i += 4) {
    const shade = Math.max(0, Math.min(255, (sample.data[i] - 85) * 2.0));
    sample.data[i] = sample.data[i + 1] = sample.data[i + 2] = shade;
  }
  context.putImageData(sample, 0, 0);
  return canvas;
}

export async function scanImage(blob, kind, { deskew = false } = {}) {
  if (!blob || !/^image\/(png|jpeg|webp)$/.test(blob.type) || blob.size > 8_000_000) {
    throw new Error('IMAGE_FORMAT');
  }
  const instance = await getWorker();
  const canvas = await preprocess(blob, kind, deskew ? -7.5 : 0);
  const { data } = await instance.recognize(canvas);
  const result = extractFields(kind, data.text);
  if (deskew && kind === 'gst' && result.synthetic) {
    const codeLine = document.createElement('canvas');
    const width = Math.round(canvas.width * 0.28);
    const height = Math.round(canvas.height * (0.043 / 0.59));
    codeLine.width = 2 * width;
    codeLine.height = 2 * height;
    codeLine.getContext('2d').drawImage(canvas, Math.round(canvas.width * 0.37),
      Math.round(canvas.height * (0.15 / 0.59)), width, height, 0, 0, 2 * width, 2 * height);
    try {
      await instance.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
      const line = (await instance.recognize(codeLine)).data;
      const gst = formatGst(line.text);
      if (gst.length === 15 && line.confidence >= 60) result.fields.GSTIN = gst;
    } finally {
      await instance.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
    }
  }
  return { ...result, confidence: data.confidence };
}

export async function sampleImage(specimen, kind) {
  if (specimen.fields[kind]) return drawSpecimen(specimen.id, kind, specimen.fields[kind]);
  if (!specimen.files[kind]) return null;
  const response = await fetch(specimen.files[kind]);
  if (!response.ok) throw new Error('SPECIMEN_UNAVAILABLE');
  return response.blob();
}
