import { productSource as demoProducts, officialGst as demoGst, officialUdyam as demoUdyam,
  officialFixtures as demoFixtures, baselines as demoBaselines, cityTiers as demoCityTiers } from './official.mjs';
import demoPropensity from './propensity-model.json' with { type: 'json' };

async function localData(importFile) {
  try { return await importFile(); }
  catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
}

const [imported, trained] = await Promise.all([
  localData(() => import('./official.local.mjs')),
  localData(() => import('./propensity.local.json', { with: { type: 'json' } }))
]);
export const productSource = imported?.productSource ?? demoProducts;
export const officialGst = imported?.officialGst ?? demoGst;
export const officialUdyam = imported?.officialUdyam ?? demoUdyam;
export const officialFixtures = imported?.officialFixtures ?? demoFixtures;
export const baselines = imported?.baselines ?? demoBaselines;
export const cityTiers = imported?.cityTiers ?? demoCityTiers;
export const propensityModel = trained?.default ?? demoPropensity;
