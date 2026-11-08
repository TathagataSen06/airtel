import { productSource as demoProducts, officialGst as demoGst, officialUdyam as demoUdyam,
  officialFixtures as demoFixtures, baselines as demoBaselines } from './official.mjs';

let imported;
try {
  imported = await import('./official.local.mjs');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

export const productSource = imported?.productSource ?? demoProducts;
export const officialGst = imported?.officialGst ?? demoGst;
export const officialUdyam = imported?.officialUdyam ?? demoUdyam;
export const officialFixtures = imported?.officialFixtures ?? demoFixtures;
export const baselines = imported?.baselines ?? demoBaselines;
