/**
 * Réglages temporaires des valeurs du jeu, pour essayer un équilibrage sans toucher au code :
 *
 *   --set monster.ronceau.hp=30            valeur absolue
 *   --set monster.*.hp=x0.7                multiplicateur (arrondi), sur tous les monstres
 *   --set monster.*.pm=+1                  ajout
 *   --set monster.gardien_racineux.attacks.etreinte.damage=12
 *   --set spell.tir_concentre.concentrationCost=3
 *   --set item.*.stats.masteries.fire=x2   objets (data/items.ts)
 *   --set rarity.mythic.power=1.6          puissance des raretés (loot.ts)
 *
 * Les tables du moteur (MONSTERS, SPELLS) sont modifiées en mémoire dans le processus du solveur
 * uniquement ; rien n'est écrit sur disque.
 */
import { ITEMS, MONSTERS, RARITIES, SPELLS } from '@chabfu/engine';

export function applyOverrides(specs: string[]): void {
  for (const spec of specs) applyOverride(spec);
}

function applyOverride(spec: string): void {
  const eq = spec.indexOf('=');
  if (eq < 0) throw new Error(`Réglage invalide (il manque =) : ${spec}`);
  const path = spec.slice(0, eq).split('.');
  const raw = spec.slice(eq + 1);
  const [kind, id, ...fieldPath] = path;
  const tables: Record<string, () => { id: string }[]> = {
    monster: () => MONSTERS,
    spell: () => SPELLS,
    item: () => ITEMS,
    // Les raretés sont un dictionnaire : on présente chaque entrée avec son identifiant (même objet, modifié en place).
    rarity: () => Object.entries(RARITIES).map(([rid, def]) => new Proxy(def, { get: (t, k) => (k === 'id' ? rid : t[k as keyof typeof t]) }) as unknown as { id: string }),
  };
  const table = tables[kind]?.();
  if (!table) throw new Error(`Réglage invalide (monster.*, spell.*, item.* ou rarity.*) : ${spec}`);
  const targets = id === '*' ? table : table.filter((t) => t.id === id);
  if (!targets.length) throw new Error(`Identifiant inconnu dans ${spec}`);
  let touched = 0;
  for (const target of targets) touched += walk(target as unknown, fieldPath, raw, spec);
  if (!touched) throw new Error(`Aucun champ modifié par ${spec}`);
}

/** Descend dans l'objet ; une liste (ex. attacks) se traverse par l'id de l'élément, ou * pour tous. */
function walk(node: unknown, fields: string[], raw: string, spec: string): number {
  if (node === null || typeof node !== 'object') return 0;
  const [f, ...rest] = fields;
  if (Array.isArray(node)) {
    const items = node.filter((it: { id?: string }) => f === '*' || it.id === f);
    return items.reduce((n: number, it: unknown) => n + walk(it, rest, raw, spec), 0);
  }
  const obj = node as Record<string, unknown>;
  if (!rest.length) return setValue(obj, f, raw, spec) ? 1 : 0;
  return walk(obj[f], rest, raw, spec);
}

function setValue(obj: Record<string, unknown>, field: string, raw: string, spec: string): boolean {
  if (raw.startsWith('+')) {
    const current = obj[field];
    if (typeof current !== 'number') return false;
    obj[field] = current + Number(raw.slice(1));
    return true;
  }
  if (raw.startsWith('x')) {
    const current = obj[field];
    if (typeof current !== 'number') return false; // champ absent sur cette cible : ignoré pour les jokers
    obj[field] = Math.round(current * Number(raw.slice(1)));
    return true;
  }
  const n = Number(raw);
  if (raw === 'true' || raw === 'false') obj[field] = raw === 'true';
  else if (!Number.isNaN(n)) obj[field] = n;
  else if (/^[a-z_]+$/.test(raw) && typeof obj[field] === 'string') obj[field] = raw; // ex. weakness=earth
  else throw new Error(`Valeur invalide dans ${spec}`);
  return true;
}
