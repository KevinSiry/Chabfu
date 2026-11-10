/**
 * Affichage des stats d'objets et du personnage : lignes avec médaillon, comparaison ligne à ligne, totaux.
 * Toutes les valeurs viennent du moteur (`statLines`, `combatStats`) : l'affichage ne recalcule rien.
 */
import { combatStats, MAX_RESISTANCE, statLines, type EquipmentConfig, type StatLine } from '@chabfu/engine';

const LABELS = { fire: 'Feu', water: 'Eau', earth: 'Terre', air: 'Air', neutral: 'Neutre' } as const;

/** Glyphe du médaillon de chaque famille de stat. */
const GLYPH: Record<StatLine['stat'], string> = {
  hp: '❤',
  pa: '✦',
  pm: '➤',
  mastery: '⚔',
  resistance: '⛨',
  damage: '✸',
  range: '◎',
  concentration: '◆',
};

function medal(l: Pick<StatLine, 'stat' | 'element'>): string {
  return `<i class="stat-medal st-${l.stat}${l.element ? ` el-${l.element}` : ''}" aria-hidden="true">${GLYPH[l.stat]}</i>`;
}

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

/** Lignes de stats d'un objet (ou d'un total). */
export function statRowsHtml(bonus: EquipmentConfig, opts: { compact?: boolean } = {}): string {
  const lines = statLines(bonus, LABELS);
  if (!lines.length) return '<div class="stat-rows empty muted">Aucune stat</div>';
  return `<ul class="stat-rows${opts.compact ? ' compact' : ''}">${lines
    .map((l) => `<li>${medal(l)}<span class="stat-label">${l.label}</span><b class="stat-val">${signed(l.value)}${l.unit}</b></li>`)
    .join('')}</ul>`;
}

/** Comparaison ligne à ligne avec ce que l'objet remplacerait (delta déjà calculé par le moteur). */
export function statDeltaHtml(delta: EquipmentConfig): string {
  const lines = statLines(delta, LABELS);
  if (!lines.length) return '<div class="stat-delta same">Identique à l’objet porté</div>';
  return `<div class="stat-delta"><span class="delta-title">Si vous l’équipez</span><ul>${lines
    .map(
      (l) =>
        `<li class="${l.value > 0 ? 'up' : 'down'}">${medal(l)}<span class="stat-label">${l.label}</span><b>${l.value > 0 ? '▲' : '▼'} ${signed(l.value)}${l.unit}</b></li>`,
    )
    .join('')}</ul></div>`;
}

/**
 * Stats d'un objet et écart avec l'objet porté, sur une seule liste : valeur de l'objet, puis ▲/▼ si on l'équipe.
 * Les stats que l'objet n'a pas mais que l'objet remplacé avait apparaissent avec « — » et leur perte.
 */
export function statCompareHtml(bonus: EquipmentConfig, delta: EquipmentConfig | null): string {
  const lines = statLines(bonus, LABELS);
  const deltas = delta ? statLines(delta, LABELS) : [];
  const byKey = new Map(deltas.map((d) => [d.key, d]));
  const lost = deltas.filter((d) => !lines.some((l) => l.key === d.key));
  if (!lines.length && !lost.length) return '<div class="stat-rows empty muted">Aucune stat</div>';
  const dv = (d: StatLine | undefined) =>
    !delta ? '' : d ? `<em class="${d.value > 0 ? 'up' : 'down'}">${d.value > 0 ? '▲' : '▼'} ${signed(d.value)}${d.unit}</em>` : '<em class="same">=</em>';
  return `<ul class="stat-rows stat-cmp${delta ? ' has-delta' : ''}">${[
    ...lines.map((l) => `<li>${medal(l)}<span class="stat-label">${l.label}</span><b class="stat-val">${signed(l.value)}${l.unit}</b>${dv(byKey.get(l.key))}</li>`),
    ...lost.map((d) => `<li class="lost">${medal(d)}<span class="stat-label">${d.label}</span><b class="stat-val">—</b>${dv(d)}</li>`),
  ].join('')}</ul>`;
}

/** Totaux du personnage (base de l'Archer + équipement), pour la fiche et l'écran d'équipement. */
export function characterStatsHtml(equipment: EquipmentConfig, masteries?: Partial<Record<'fire' | 'water' | 'earth' | 'air' | 'neutral', number>>): string {
  const s = combatStats(equipment, masteries);
  const eq = s.fromEquipment;
  const plus = (n: number, unit = '') => (n ? `<small>${signed(n)}${unit} stuff</small>` : '');
  const big = (stat: StatLine['stat'], label: string, value: number, bonus: number) =>
    `<div class="cstat st-${stat}">${medal({ stat })}<b>${value}</b><span>${label}</span>${plus(bonus)}</div>`;
  const els = ['fire', 'water', 'earth', 'air'] as const;
  return `
    <div class="char-stats">
      <div class="cstat-row">
        ${big('hp', 'PV', s.hp, eq.hp)}
        ${big('pa', 'PA', s.pa, eq.pa)}
        ${big('pm', 'PM', s.pm, eq.pm)}
      </div>
      <div class="cstat-row small">
        ${big('damage', 'Dommages', s.damage, 0)}
        ${big('range', 'Portée', s.range, 0)}
        ${big('concentration', 'Conc. par salle', s.concentration, 0)}
      </div>
      <table class="el-table">
        <thead><tr><th></th><th>${medal({ stat: 'mastery' })} Maîtrise</th><th>${medal({ stat: 'resistance' })} Résistance</th></tr></thead>
        <tbody>${els
          .map(
            (e) =>
              `<tr><td><span class="el el-${e}"></span>${LABELS[e]}</td><td><b>${s.masteries[e]} %</b></td><td><b class="${s.resistances[e] >= MAX_RESISTANCE ? 'capped' : ''}">${s.resistances[e]} %</b></td></tr>`,
          )
          .join('')}</tbody>
      </table>
      <p class="muted small">Résistances plafonnées à ${MAX_RESISTANCE} %. Dommages : ajoutés à chaque coup de sort avant la maîtrise. Portée : tirs à distance.</p>
    </div>`;
}
