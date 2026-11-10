/**
 * Tableau de l'économie du stuff : runs gagnés pour une panoplie complète, par rareté visée et par difficulté.
 *
 *   npm run economy -- [--dungeon bosquet_des_ronces] [--seeds 200] [--no-craft]
 */
import { RARITIES, RARITY_ORDER, type Rarity } from '@chabfu/engine';
import { runsForFullSet } from './economy.js';

const argv = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const dungeonId = opt('--dungeon', 'bosquet_des_ronces');
const seeds = Number(opt('--seeds', '200'));
const craft = !argv.includes('--no-craft');
const targets: Rarity[] = RARITY_ORDER.filter((r) => r !== 'common');
const diffs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const cell = (v: number | null) => (v === null ? '—' : v < 10 ? v.toFixed(1) : Math.round(v).toString());
console.log(`Runs gagnés pour une panoplie complète (${dungeonId}, ${craft ? 'drops + atelier' : 'drops seuls'}, moyenne sur ${seeds} graines)\n`);
console.log(`| Difficulté | ${targets.map((t) => RARITIES[t].label).join(' | ')} |`);
console.log(`|---|${targets.map(() => '---').join('|')}|`);
for (const d of diffs) {
  const row = targets.map((t) => cell(runsForFullSet(dungeonId, d, t, { craft, seeds }).meanRuns));
  console.log(`| D${d} | ${row.join(' | ')} |`);
}
