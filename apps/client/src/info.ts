/** Textes et fiches d'information du combat (sorts, monstres, aperçus). Aucune règle ici. */
import { slotKeyLabel } from './keys';
import {
  DAMAGE_FACTORS,
  combinePassives,
  spellConcentrationCost,
  spellConcentrationLoss,
  spellMaxRange,
  equipmentRange,
  getCastError,
  getMonster,
  getSpell,
  monsterBehavior,
  monsterAttacks,
  spellDamageOn,
  type ActionPreview,
  type Element,
  type MonsterBehavior,
  type MonsterIntent,
  type RunState,
  type SpellDef,
  type Unit,
} from '@chabfu/engine';

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

/** Liste des effets d'un sort, en phrases courtes (passifs équipés compris). */
export function spellEffects(spell: SpellDef, passives: readonly string[] = []): string[] {
  const burnTurns = spell.burn ? spell.burn.turns + combinePassives(passives).burnExtraTurns : 0;
  const out: string[] = [];
  if (spell.damage !== undefined) out.push(`<b>${spell.damage}</b> dégâts ${el(spell.element)}${spell.zone === 'cross' ? ' en croix (5 cases)' : spell.zone === 'square' ? ' en carré (9 cases)' : ''}`);
  if (spell.burn) out.push(`Brûlure : <b>${spell.burn.damage}</b> dégâts Feu au début de ses ${burnTurns} prochains tours`);
  if (spell.push) out.push(`Pousse de <b>${spell.push}</b> case${spell.push > 1 ? 's' : ''} (collision : 8 dégâts par case restante, moitié pour le monstre heurté)`);
  if (spell.pmRemoval) out.push(`Retire <b>${spell.pmRemoval} PM</b> à la cible pour son prochain tour`);
  if (spell.jump) out.push(`Saute sur la case visée, par-dessus les obstacles`);
  if (spell.gainPm) out.push(`Rend <b>${spell.gainPm} PM</b> à l'Archer`);
  if (spell.buffNextShot) out.push(`Le prochain tir inflige <b>le double</b> de dégâts`);
  return out;
}

export function spellConcentration(spell: SpellDef, passives: readonly string[] = []): string[] {
  const out: string[] = [];
  const cost = spellConcentrationCost(spell, passives);
  const loss = spellConcentrationLoss(spell, passives);
  if (cost) out.push(`Coûte <b>${cost}</b> Concentration (requise)${cost < (spell.concentrationCost ?? 0) ? ' <span class="muted">(réduit par un passif)</span>' : ''}`);
  if (loss) out.push(`<span class="neg">−${loss}</span> Concentration`);
  else if (spell.concentrationLoss) out.push('Ne coûte plus de Concentration <span class="muted">(passif)</span>');
  if (spell.concentrationGain)
    out.push(
      `<span class="pos">+${spell.concentrationGain}</span> Concentration${spell.concentrationGainMinDistance ? ` si la cible est à ${spell.concentrationGainMinDistance} cases ou plus` : ''}`,
    );
  return out;
}

/** Infobulle complète d'un sort de la barre. */
export function spellTooltip(state: RunState, spellId: string, index: number): string {
  const s = getSpell(spellId);
  const err = getCastError(state, spellId);
  const uses = state.player.spellUses[spellId] ?? 0;
  const target = { unit: 'Un ennemi', cell: 'Une case', emptyCell: 'Une case libre', self: 'Soi-même' }[s.target];
  const passives = state.player.passives ?? [];
  const conc = spellConcentration(s, passives);
  const maxRange = spellMaxRange(s, passives, equipmentRange(state));
  return `
    <div class="tt-head"><b>${s.name}</b><span class="key">${esc(slotKeyLabel(index))}</span></div>
    <div class="tt-meta">${el(s.element)} · <span class="pa">${s.pa} PA</span>${s.maxPerTurn ? ` · ${uses}/${s.maxPerTurn} ce tour` : ''}</div>
    <div class="tt-grid">
      <span>Portée</span><b>${rangeLabel(s.minRange, maxRange)}${maxRange > s.maxRange ? ` <span class="pos">(+${maxRange - s.maxRange} passifs et stuff)</span>` : ''}</b>
      <span>Cible</span><b>${target}</b>
      <span>Ligne de vue</span><b>${s.target === 'self' ? '—' : s.los ? 'requise' : 'non requise'}</b>
      ${s.inLine ? '<span>Lancer</span><b>en ligne droite</b>' : ''}
    </div>
    <ul class="tt-list">${spellEffects(s, passives).map((e) => `<li>${e}</li>`).join('')}</ul>
    ${conc.length ? `<ul class="tt-list conc-list">${conc.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
    ${state.player.nextShotDouble && s.damage !== undefined ? '<div class="tt-note pos">Tir concentré actif : dégâts ×2</div>' : ''}
    ${err ? `<div class="tt-note neg">${esc(err)}</div>` : ''}`;
}

export function factorTags(d: NonNullable<ReturnType<typeof spellDamageOn>>): string {
  const tags: string[] = [];
  if (d.flat) tags.push(`dommages +${d.flat}`);
  if (d.mastery) tags.push(`maîtrise +${d.mastery} %`);
  if (d.weakness) tags.push(`<span class="pos">faiblesse ${pct(DAMAGE_FACTORS.weakness)}</span>`);
  if (d.resistance) tags.push(`<span class="neg">résistance ${pct(DAMAGE_FACTORS.resistance)}</span>`);
  if (d.doubled) tags.push('<span class="pos">×2 concentré</span>');
  return tags.join(' · ');
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
    ${t.description ? `<p class="desc-line">${esc(t.description)}</p>` : ''}
    <h4>À son tour, si vous finissez maintenant</h4>
    <p class="intent">${intentText(intent, u)}</p>
    ${
      deck.length
        ? `<h4>Vos sorts sur lui</h4><table class="dmg-table">${deck
            .map((s) => {
              const d = spellDamageOn(state, s.id, u)!;
              const mark = d.weakness ? '<span class="pos">▲</span>' : d.resistance ? '<span class="neg">▼</span>' : '';
              const lethal = d.amount >= u.hp ? ' <span class="kill">tue</span>' : '';
              return `<tr><td>${el(s.element)} ${s.name}</td><td><b>${d.amount}</b> ${mark}${d.burn ? ` <span class="muted">+${d.burn.damage}×${d.burn.turns}</span>` : ''}${lethal}</td></tr>`;
            })
            .join('')}</table>`
        : ''
    }`;
}

/** Détail d'un aperçu de sort (panneau d'inspection). */
export function castPreviewCard(state: RunState, spellId: string, preview: ActionPreview): string {
  const s = getSpell(spellId);
  if (!preview.valid) return `<div class="card-head"><b>${s.name}</b></div><p class="neg">${esc(preview.error ?? '')}</p>`;
  const rows = preview.outcomes
    .filter((o) => o.unitId !== 'archer' || o.damage)
    .map((o) => {
      const u = state.units.find((x) => x.id === o.unitId)!;
      const d = s.damage !== undefined && u.team === 'monster' ? spellDamageOn(state, spellId, u) : null;
      const parts: string[] = [];
      if (o.bySource.spell) parts.push(`<b>−${o.bySource.spell}</b> ${ELEMENT_LABEL[s.element]}${d ? ` <span class="muted">(${factorTags(d) || 'sans bonus'})</span>` : ''}`);
      if (o.bySource.collision) parts.push(`<b>−${o.bySource.collision}</b> collision`);
      if (o.pushedFrom && o.movedTo) parts.push(`poussé de ${Math.abs(o.movedTo.x - o.pushedFrom.x) + Math.abs(o.movedTo.y - o.pushedFrom.y)} case(s)`);
      for (const st of o.statuses) parts.push(st);
      return `<li><b>${o.name}</b> ${o.hpBefore} → <b>${o.hpAfter}</b> PV${o.killed ? ' <span class="kill">vaincu</span>' : ''}<br><span class="small">${parts.join(' · ')}</span></li>`;
    });
  const dc = preview.concentrationAfter - preview.concentrationBefore;
  return `
    <div class="card-head"><b>${s.name}</b><span class="pa">${s.pa} PA</span></div>
    <ul class="outcomes">${rows.join('') || '<li class="muted">Aucun ennemi touché.</li>'}</ul>
    ${dc ? `<p>Concentration ${preview.concentrationBefore} → <b class="${dc > 0 ? 'pos' : 'neg'}">${preview.concentrationAfter}</b></p>` : ''}
    ${preview.clearsRoom ? '<p class="pos">La salle sera vidée.</p>' : ''}`;
}
