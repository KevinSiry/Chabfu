/** Textes et fiches d'information du combat (sorts, monstres, aperçus). Aucune règle ici. */
import {
  DAMAGE_FACTORS,
  MECHANIC_TEXT,
  MECHANICS,
  TRAIT_TEXT,
  getMonster,
  isThornGuarded,
  getSpell,
  monsterBehavior,
  monsterAttacks,
  spellDamageOn,
  type Element,
  type MonsterBehavior,
  type MonsterIntent,
  type RunState,
  type Unit,
} from '@chabfu/engine';
import { icon } from './ui/icons';

export const ELEMENT_LABEL: Record<Element, string> = { fire: 'Feu', water: 'Eau', earth: 'Terre', air: 'Air', neutral: 'Neutre' };

const pct = (f: number) => `${f > 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`;

export function el(e: Element): string {
  return `<span class="el el-${e}"></span>${ELEMENT_LABEL[e]}`;
}

export function rangeLabel(min: number, max: number): string {
  if (max === 0) return 'Soi';
  return min === max ? `Portée ${min}` : `Portée ${min}–${max}`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function intentText(intent: MonsterIntent | undefined, unit: Unit): string {
  if (!intent) return '<span class="muted">—</span>';
  if (intent.diesFromBurn) return `<span class="pos">Meurt de sa brûlure (−${intent.burnTaken} PV) au début de son tour.</span>`;
  if (intent.skipped) return '<span class="muted">N’agira pas (combat terminé avant son tour).</span>';
  const parts: string[] = [];
  if (intent.burnTaken) parts.push(`subit ${intent.burnTaken} de brûlure`);
  if (intent.path.length) parts.push(`avance de ${intent.path.length} case${intent.path.length > 1 ? 's' : ''}`);
  else parts.push('reste sur place');
  if (intent.attacks.length) parts.push(intent.attacks.map((a) => `${a.name} <b class="neg">−${a.damage} PV</b>`).join(', puis '));
  else parts.push('ne peut pas vous toucher');
  if (intent.effects.length) parts.push(`<span class="neg">${intent.effects.map(esc).join(', ')}</span>`);
  const s = parts.join(', ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.${unit.pmMalus ? ` <span class="muted">(${unit.pmMalus} PM retiré${unit.pmMalus > 1 ? 's' : ''})</span>` : ''}`;
}

const BEHAVIOR_LABEL: Record<MonsterBehavior, string> = {
  aggressive: 'Fonce sur vous',
  kiter: 'Garde ses distances',
  sentinel: 'Immobile, tire depuis sa case',
};

/** Fiche complète d'un monstre. */
export function monsterCard(state: RunState, u: Unit, intent: MonsterIntent | undefined, pinned: boolean): string {
  const t = getMonster(u.templateId);
  const pmNext = Math.max(0, u.basePm - u.pmMalus);
  const states: string[] = [];
  if (u.burn) states.push(`<span class="chip fire">Brûlure ${u.burn.damage} × ${u.burn.turns} tour${u.burn.turns > 1 ? 's' : ''}</span>`);
  if (u.pmMalus) states.push(`<span class="chip water">−${u.pmMalus} PM au prochain tour</span>`);
  states.push(...mechanicChips(state, u));
  const attacks = monsterAttacks(state, u);
  const deck = state.player.deck.map(getSpell).filter((s) => s.damage !== undefined);
  return `
    <div class="card-head"><b>${u.name}</b>${u.isBoss ? '<span class="chip boss">Boss</span>' : ''}${pinned ? '<span class="chip">Épinglé · clic pour libérer</span>' : ''}</div>
    <div class="behavior">${BEHAVIOR_LABEL[monsterBehavior(t)]}</div>
    <div class="hp-line"><span>${u.hp} / ${u.maxHp} PV</span></div>
    <div class="bar"><div style="width:${(100 * u.hp) / u.maxHp}%;background:var(--hp)"></div></div>
    <div class="mini-stats">
      <span><b>${u.basePa}</b> PA</span>
      <span><b>${pmNext}</b>${pmNext !== u.basePm ? `<s>${u.basePm}</s>` : ''} PM au prochain tour</span>
    </div>
    <div class="aff">
      <span>Faiblesse ${el(t.weakness)} <b class="pos">${pct(DAMAGE_FACTORS.weakness)}</b></span>
      <span>Résistance ${el(t.resistance)} <b class="neg">${pct(DAMAGE_FACTORS.resistance)}</b></span>
    </div>
    ${states.length ? `<div class="states">${states.join('')}</div>` : ''}
    <h4>Attaques</h4>
    <ul class="atk-list">${attacks
      .map(
        (a) =>
          `<li><span>${el(a.element)} <b>${a.name}</b></span><span class="neg"><b>${a.damage}</b> dégâts${a.resisted ? ` <span class="muted">(−${a.resisted} % résistance)</span>` : ''}</span><span class="muted">${a.pa} PA · ${rangeLabel(a.minRange, a.maxRange)}${a.los ? '' : ' · en cloche (sans ligne de vue)'}${a.maxPerTurn > 1 ? ` · ${a.maxPerTurn}/tour` : ''}${a.burn ? ` · <span class="neg">brûlure ${a.burn.damage} × ${a.burn.turns}</span>` : ''}${a.pmRemoval ? ` · <span class="neg">−${a.pmRemoval} PM</span>` : ''}${a.push ? ` · <span class="neg">pousse de ${a.push}</span>` : ''}</span></li>`,
      )
      .join('')}</ul>
    ${mechanicBlock(t.mechanic ? MECHANIC_TEXT[t.mechanic] : t.trait ? TRAIT_TEXT[t.trait] : undefined)}
    ${t.description ? `<p class="desc-line">${esc(t.description)}</p>` : ''}
    <h4>À son tour, si vous finissez maintenant</h4>
    <p class="intent">${intentText(intent, u)}</p>
    ${
      deck.length
        ? `<h4>Vos sorts sur lui</h4><table class="dmg-table">${deck
            .map((s) => {
              const d = spellDamageOn(state, s.id, u)!;
              const mark = d.weakness ? `<span class="pos">${icon('arrowUp')}</span>` : d.resistance ? `<span class="neg">${icon('arrowDown')}</span>` : '';
              const lethal = d.amount >= u.hp ? ' <span class="kill">tue</span>' : '';
              return `<tr><td>${el(s.element)} ${s.name}</td><td><b>${d.amount}</b> ${mark}${d.burn ? ` <span class="muted">+${d.burn.damage}×${d.burn.turns}</span>` : ''}${lethal}</td></tr>`;
            })
            .join('')}</table>`
        : ''
    }`;
}

function mechanicBlock(m: { name: string; text: string } | undefined): string {
  return m ? `<h4>${escText(m.name)}</h4><p class="desc-line mech-line">${escText(m.text)}</p>` : '';
}
const escText = (x: string) => esc(x);

/** États liés aux mécaniques de donjon : chaleur, refroidi, annonce, œuf, épines. */
export function mechanicChips(state: RunState, u: Unit): string[] {
  const out: string[] = [];
  if (u.heat !== undefined) out.push(`<span class="chip fire">Chaleur ${u.heat}/${MECHANICS.overheat.max}</span>`);
  if (u.cooled) out.push('<span class="chip water">Refroidi : +50 % de dégâts subis</span>');
  if (u.telegraph?.kind === 'roots') out.push('<span class="chip boss">Racines au prochain tour</span>');
  if (u.telegraph?.kind === 'blast') out.push('<span class="chip boss">Explosion au prochain tour</span>');
  if (u.telegraph?.kind === 'gale') out.push(`<span class="chip boss">Grand vent ${dirArrow(u.telegraph.dir)} au prochain tour</span>`);
  if (u.hatchIn !== undefined) out.push(`<span class="chip boss">Éclot dans ${u.hatchIn} tour${u.hatchIn > 1 ? 's' : ''}</span>`);
  if (u.hp > 0 && isThornGuarded(state, u)) out.push('<span class="chip earth">Protégé par les épines : −50 % de dégâts</span>');
  return out;
}

/** Flèche du sens du vent, dans le repère de l'écran iso (x vers le bas à droite, y vers le bas à gauche). */
export function dirArrow(d: { x: number; y: number } | undefined): string {
  if (!d) return '';
  if (d.x > 0) return '↘';
  if (d.x < 0) return '↖';
  if (d.y > 0) return '↙';
  return '↗';
}
