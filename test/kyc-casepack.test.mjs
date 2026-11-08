import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import { evaluateEvidence, specimens } from '../src/domain.mjs';
import { readDocument } from '../public/ocr.mjs';

const caseData = process.env.CASE_DATA_DIR;
const expected = {
  K01: ['review', 'GST_CANCELLED'], K02: ['cleared', 'GST_ACTIVE'],
  K03: ['cleared', 'GST_ACTIVE'], K04: ['correction', 'OCR_BLUR'],
  K05: ['correction', 'PROOF_MISSING'], K06: ['correction', 'GSTIN_NEAR_MATCH'],
  K07: ['correction', 'GST_LEGAL_TRADE_MISMATCH'], K08: ['cleared', 'GST_ACTIVE'],
  K09: ['cleared', 'ADDRESS_VALID'], K10: ['correction', 'SIGNATORY_MISMATCH'],
  K11: ['correction', 'ADDRESS_STALE'], K12: ['cleared', 'GST_ACTIVE']
};
const documents = { gst: 'gst_certificate', udyam: 'udyam_certificate', id: 'signatory_id', address: 'address_proof' };

test('organizer images run through OCR and server rules for all 12 KYC fixtures', {
  skip: caseData ? false : 'Import the case pack and set CASE_DATA_DIR to run the original images',
  timeout: 360000
}, async t => {
  assert.equal(Object.keys(specimens).filter(id => /^K\d\d$/.test(id)).length, 12,
    'Run python scripts/import-case.py with the same directory first');
  const ocr = await createWorker('eng', 1, {
    langPath: fileURLToPath(new URL('../public/vendor', import.meta.url)), cacheMethod: 'none'
  });
  t.after(() => ocr.terminate());
  const recognize = async (image, psm, whitelist = '') => {
    await ocr.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist, preserve_interword_spaces: '1' });
    return (await ocr.recognize(PNG.sync.write({ ...image, data: Buffer.from(image.data) }))).data;
  };
  for (const [id, [status, code]] of Object.entries(expected)) await t.test(id, async () => {
    const extracted = {};
    for (const [kind, suffix] of Object.entries(documents)) {
      const source = join(caseData, 'kyc_documents', id + '_' + suffix + '.png');
      try {
        const doc = await readDocument(PNG.sync.read(await readFile(source)), kind, recognize);
        if (doc.synthetic || doc.quality === 'blurred') extracted[kind] = doc;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const result = evaluateEvidence(id, extracted);
    t.diagnostic([id, result.status, result.checks.map(check => check.reason).join(', ')].join(' | '));
    assert.equal(result.status, status);
    assert.ok(result.checks.some(check => check.reason === code));
    if (id === 'K02') assert.ok(Math.abs(extracted.gst.tilt) >= 3, 'K02 should be deskewed before OCR');
  });
});
