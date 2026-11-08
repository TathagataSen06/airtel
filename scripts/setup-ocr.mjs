import { access, copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const vendor = fileURLToPath(new URL('../public/vendor/', import.meta.url));
const exists = path => access(path).then(() => true, () => false);
const assets = ['tesseract.js', 'worker.js', 'core.js', 'tesseract-core-lstm.wasm', 'eng.traineddata.gz'];

if (!(await Promise.all(assets.map(file => exists(join(vendor, file))))).every(Boolean)) {
  const ocr = dirname(require.resolve('tesseract.js/package.json'));
  const core = dirname(require.resolve('tesseract.js-core/package.json'));
  const lang = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
  const source = [
    join(ocr, 'dist', 'tesseract.min.js'),
    join(ocr, 'dist', 'worker.min.js'),
    join(core, 'tesseract-core-lstm.js'),
    join(core, 'tesseract-core-lstm.wasm'),
    join(lang, '4.0.0_best_int', 'eng.traineddata.gz')
  ];
  await mkdir(vendor, { recursive: true });
  await Promise.all(assets.map((file, index) => copyFile(source[index], join(vendor, file))));
  console.log('Prepared browser-local OCR assets.');
}
