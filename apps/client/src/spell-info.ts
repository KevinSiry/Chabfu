/**
 * Fiche de sort et carte de visée. Tous les chiffres viennent du moteur (`spellPower`,
 * `previewCastDetailed`) : cette vue ne fait que les mettre en forme.
 */
import {
  COLLISION_DAMAGE_PER_CELL,
  DAMAGE_FACTORS,
  combinePassives,
  getCastError,
  getPassive,
  getSpell,
  isRangedShot,
  spellConcentrationCost,
  spellConcentrationLoss,
  spellDamageOn,
  spellPower,
  type CastPreview,
  type DamageBreakdown,
  type Element,
  type RunState,
  type SpellDef,
  type TargetOutcome,
  type Unit,
} from '@chabfu/engine';
import { slotKeyLabel } from './keys';
import { spellIconImg } from './ui/assets';
import { ELEMENT_LABEL, el, esc } from './info';
import './ui/spell-info.css';

const EL_COLOR: Record<Element, string> = { fire: '#ff7a4d', water: '#4fb0ff', earth: '#d1a060', air: '#7fe08a', neutral: '#c9d2e3' };
const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const plural = (n: number, w: string) => `${n} ${w}${n > 1 && !w.endsWith('s') ? 's' : ''}`;

const TARGET_LABEL: Record<SpellDef['target'], string> = {
  unit: 'Un ennemi',
  cell: 'Une case, ennemie ou vide',
  emptyCell: 'Une case libre',
  self: 'Soi-même',
};

function zoneDiagram(zone: SpellDef['zone']): string {
  const on = (x: number, y: number) =>
    zone === 'cross' ? (x === 1 || y === 1) && !(x !== 1 && y !== 1) : zone === 'square' ? true : x === 1 && y === 1;
  const cells = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push(`<i class="${on(x, y) ? 'on' : ''} ${x === 1 && y === 1 ? 'c' : ''}"></i>`);
  return `<span class="zone-mini">${cells.join('')}</span>`;
}

function zoneLabel(zone: SpellDef['zone']): string {
  if (zone === 'cross') return 'Croix de 5 cases';
  if (zone === 'square') return 'Carré de 9 cases';
  return '1 case';
}

export interface SheetOptions {
  /** Emplacement dans la barre (raccourci affiché). */
  slot?: number;
  /** Fiche hors combat (grimoire) : pas d'utilisations ni d'erreur de lancer. */
  outOfCombat?: boolean;
}

/** Fiche complète d'un sort : ce qu'il fait exactement, avec les stats actuelles du personnage. */
export function spellSheet(state: RunState, spellId: string, opts: SheetOptions = {}): string {
  const s = getSpell(spellId);
  const passives = state.player.passives ?? [];
  const mods = combinePassives(passives);
  const power = spellPower(state, spellId);
  const color = EL_COLOR[s.element];
  const uses = state.player.spellUses[spellId] ?? 0;
  const concCost = spellConcentrationCost(s, passives);
  const concLoss = spellConcentrationLoss(s, passives);
  let err = opts.outOfCombat ? null : getCastError(state, spellId);
  if (err === 'Pas assez de Concentration.') err = `Pas assez de Concentration : ${state.player.concentration} sur ${concCost}.`;
  if (err === 'Pas assez de PA.') err = `Pas assez de PA : ${state.units.find((u) => u.team === 'player')!.pa} sur ${s.pa}.`;

  // Coûts
  const costs = [`<span class="ss-cost pa"><b>${s.pa}</b> PA</span>`];
  if (concCost) costs.push(`<span class="ss-cost conc"><b>${concCost}</b> Concentration</span>`);
  if (s.maxPerTurn) costs.push(`<span class="ss-cost uses"><b>${opts.outOfCombat ? s.maxPerTurn : `${uses}/${s.maxPerTurn}`}</b> par tour</span>`);

  // Dégâts
  let damage = '';
  if (s.damage !== undefined) {
    const factors = [`${s.damage} de base`];
    if (power.mastery) factors.push(`× ${num(1 + power.mastery / 100)} <span class="muted">maîtrise ${ELEMENT_LABEL[s.element]} +${power.mastery} %</span>`);
    if (power.doubled) factors.push('× 2 <span class="muted">Tir concentré</span>');
    damage = `
      <div class="ss-dmg" style="--c:${color}">
        <div class="ss-dmg-main"><b>${power.damage.normal}</b><span>dégâts ${el(s.element)}${s.zone ? `<br><small>sur chaque ennemi de la zone</small>` : ''}</span></div>
        ${
          s.element !== 'neutral'
            ? `<div class="ss-dmg-cases">
                <span>Ennemi faible au ${ELEMENT_LABEL[s.element]}<b class="pos">${power.damage.weak}</b></span>
                <span>Ennemi résistant<b class="neg">${power.damage.resist}</b></span>
              </div>`
            : '<div class="ss-dmg-cases"><span class="muted">Neutre : ni faiblesse ni résistance.</span></div>'
        }
        <div class="ss-formula">${
          factors.length > 1
            ? `${factors.join(' ')} = <b>${power.damage.normal}</b> <span class="muted">(arrondi à l’inférieur)</span>`
            : `${s.damage} de base <span class="muted">· aucune maîtrise ${ELEMENT_LABEL[s.element]} pour l’instant</span>`
        }</div>
      </div>`;
  }

  // Effets, en phrases exactes
  const fx: { icon: string; cls: string; html: string }[] = [];
  if (s.burn && power.burn) {
    const b = power.burn;
    fx.push({
      icon: '🔥',
      cls: 'fire',
      html: `<b>Brûlure</b> : <b>${b.perTurn.normal}</b> dégâts Feu au début de chacun de ses <b>${b.turns}</b> prochains tours, soit <b>${b.perTurn.normal * b.turns}</b> au total${
        b.turns > s.burn.turns ? ` <span class="pos">(+${b.turns - s.burn.turns} tour, passif)</span>` : ''
      }. <span class="muted">Ne se cumule pas : la plus forte est gardée. Jamais doublée par Tir concentré.</span>`,
    });
  }
  if (s.push) {
    fx.push({
      icon: '➜',
      cls: 'earth',
      html: `<b>Poussée</b> : repousse la cible de <b>${plural(s.push, 'case')}</b>, à l’opposé de l’Archer. Contre un rocher ou une unité : <b>${COLLISION_DAMAGE_PER_CELL}</b> dégâts par case non parcourue, et la moitié à l’unité heurtée.`,
    });
  }
  if (s.pmRemoval) {
    fx.push({ icon: '❄', cls: 'water', html: `<b>Ralentit</b> : retire <b>${s.pmRemoval} PM</b> à la cible pour son prochain tour. <span class="muted">Se cumule si vous le relancez.</span>` });
  }
  if (s.jump) fx.push({ icon: '⤴', cls: 'neutral', html: `<b>Saut</b> : l’Archer atterrit sur la case visée, par-dessus rochers et unités. <span class="muted">Ne coûte pas de PM.</span>` });
  if (s.gainPm) fx.push({ icon: '👣', cls: 'air', html: `<b>Élan</b> : rend <b>${s.gainPm} PM</b> à l’Archer, utilisable tout de suite.` });
  if (s.buffNextShot) {
    fx.push({
      icon: '◎',
      cls: 'conc',
      html: `<b>Prochain tir doublé</b> : votre prochain sort de dégâts inflige <b>×2</b> dégâts directs (sur chaque cible s’il a une zone). <span class="muted">Le bonus reste actif d’un tour et d’une salle à l’autre jusqu’à ce tir, et ne se cumule pas.</span>`,
    });
  }
  if (s.damage !== undefined && !power.doubled && state.player.deck.includes('tir_concentre') && !s.buffNextShot) {
    fx.push({ icon: '◎', cls: 'conc muted-fx', html: `<span class="muted">Doublé par Tir concentré : <b>${power.damage.normal * 2}</b> dégâts.</span>` });
  }

  // Concentration
  const conc: string[] = [];
  if (concCost) conc.push(`Coûte <b>${concCost}</b> Concentration, et il faut l’avoir pour lancer le sort${concCost < (s.concentrationCost ?? 0) ? ' <span class="pos">(réduit par un passif)</span>' : ''}.`);
  if (concLoss) conc.push(`Fait perdre <b class="neg">${concLoss}</b> Concentration.`);
  else if (s.concentrationLoss) conc.push('<span class="pos">Ne fait plus perdre de Concentration (passif).</span>');
  if (s.concentrationGain)
    conc.push(
      `Rapporte <b class="pos">+${s.concentrationGain}</b> Concentration${s.concentrationGainMinDistance ? ` si la cible est à <b>${s.concentrationGainMinDistance} cases ou plus</b> de l’Archer` : ''}.`,
    );
  if (s.damage !== undefined && mods.killConcentration) conc.push(`<b class="pos">+${mods.killConcentration}</b> Concentration par ennemi achevé (passif).`);

  // Passifs qui modifient ce sort
  const affecting = passives
    .map(getPassive)
    .filter((p) => {
      const m = p.mods;
      return (
        (m.burnExtraTurns && s.burn) ||
        (m.rangeBonus && isRangedShot(s)) ||
        m.noConcentrationLoss?.includes(s.id) ||
        (m.concentrationCostReduction && m.concentrationCostReduction[s.id]) ||
        (m.killConcentration && s.damage !== undefined)
      );
    })
    .map((p) => p.name);

  const range = s.target === 'self' ? 'Sur soi' : s.minRange === power.maxRange ? plural(s.minRange, 'case') : `${s.minRange} à ${power.maxRange} cases`;
  return `
    <div class="ss" style="--c:${color}">
      <div class="ss-head">
        <span class="ss-icon">${spellIconImg(spellId)}</span>
        <div class="ss-title"><b>${s.name}</b><span>${el(s.element)} · Niveau ${s.level}</span></div>
        ${opts.slot !== undefined ? `<kbd class="ss-key">${esc(slotKeyLabel(opts.slot))}</kbd>` : ''}
      </div>
      <div class="ss-costs">${costs.join('')}</div>
      ${damage}
      ${fx.length ? `<ul class="ss-fx">${fx.map((f) => `<li class="${f.cls}"><i>${f.icon}</i><span>${f.html}</span></li>`).join('')}</ul>` : ''}
      <div class="ss-grid">
        <span>Portée</span><b>${range}${power.maxRange > s.maxRange ? ` <span class="pos">(+${power.maxRange - s.maxRange} passif)</span>` : ''}</b>
        <span>Cible</span><b>${TARGET_LABEL[s.target]}</b>
        ${s.target !== 'self' ? `<span>Ligne de vue</span><b>${s.los ? 'Requise' : '<span class="pos">Non requise</span>'}</b>` : ''}
        ${s.target !== 'self' ? `<span>Lancer</span><b>${s.inLine ? 'En ligne droite uniquement' : 'Dans toutes les directions'}</b>` : ''}
        ${s.damage !== undefined ? `<span>Zone</span><b>${zoneDiagram(s.zone)} ${zoneLabel(s.zone)}</b>` : ''}
        <span>Utilisations</span><b>${s.maxPerTurn ? `${plural(s.maxPerTurn, 'fois')} par tour` : 'Illimitées'} <span class="muted">· pas de temps de recharge</span></b>
      </div>
      ${conc.length ? `<div class="ss-conc"><div class="ss-sec">Concentration</div>${conc.map((c) => `<p>${c}</p>`).join('')}</div>` : ''}
      ${affecting.length ? `<div class="ss-passives">Modifié par : ${affecting.map((n) => `<span class="chip">${esc(n)}</span>`).join(' ')}</div>` : ''}
      ${power.doubled ? '<div class="ss-note pos">Tir concentré actif : ce tir est doublé et consomme le bonus.</div>' : ''}
      ${err ? `<div class="ss-note neg">${esc(err)}</div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Carte de visée : survol d'une case avec un sort sélectionné
// ---------------------------------------------------------------------------

function factorLine(d: DamageBreakdown): string {
  const f: string[] = [`${d.base} ${ELEMENT_LABEL[d.element]}`];
  if (d.mastery) f.push(`maîtrise +${d.mastery} %`);
  if (d.weakness) f.push(`<span class="pos">faiblesse ×${num(DAMAGE_FACTORS.weakness)}</span>`);
  if (d.resistance) f.push(`<span class="neg">résistance ×${num(DAMAGE_FACTORS.resistance)}</span>`);
  if (d.doubled) f.push('<span class="pos">Tir concentré ×2</span>');
  return f.join(' · ');
}

/** Barre de PV avant/après : reste, perte immédiate, perte par la brûlure. */
export function hpBar(hpBefore: number, hpAfter: number, maxHp: number, burnLoss = 0): string {
  const pct = (n: number) => `${Math.max(0, (100 * n) / maxHp)}%`;
  const burn = Math.min(burnLoss, hpAfter);
  return `<div class="tp-bar">
    <i class="rest" style="width:${pct(hpAfter - burn)}"></i><i class="burn" style="width:${pct(burn)}"></i><i class="loss" style="width:${pct(hpBefore - hpAfter)}"></i>
  </div>`;
}

function outcomeRow(o: TargetOutcome, spell: SpellDef, compact: boolean): string {
  const color = EL_COLOR[spell.element];
  const total = o.spellDamage + o.collisionDamage;
  const burnLoss = o.burn ? o.burn.damage * o.burn.turns : 0;
  const fx: string[] = [];
  if (o.burn && !o.killed)
    fx.push(
      `<li class="fire"><i>🔥</i><span>Brûlure <b>${o.burn.damage}</b> × ${plural(o.burn.turns, 'tour')}${
        o.burnKillsIn ? ` : <b class="kill-txt">l’achève ${o.burnKillsIn === 1 ? 'au début de son prochain tour' : `au début de son ${o.burnKillsIn}e tour`}</b>` : ` <span class="muted">(−${burnLoss} au total)</span>`
      }</span></li>`,
    );
  if (o.pmRemoved && !o.killed)
    fx.push(`<li class="water"><i>❄</i><span>−${o.pmRemoved} PM : <b>${o.pmNextTurn}</b> PM à son prochain tour <span class="muted">(au lieu de ${o.pmNextTurn + o.pmRemoved})</span></span></li>`);
  if (o.push) {
    const moved = o.push.cells ? `Poussé de <b>${plural(o.push.cells, 'case')}</b>` : 'Bloqué, ne bouge pas';
    fx.push(
      `<li class="earth"><i>➜</i><span>${moved}${o.push.blocked ? ` : choc <b class="neg">−${o.collisionDamage}</b> <span class="muted">(${o.push.wanted - o.push.cells} case${o.push.wanted - o.push.cells > 1 ? 's' : ''} non parcourue${o.push.wanted - o.push.cells > 1 ? 's' : ''})</span>` : ''}</span></li>`,
    );
  }
  if (o.hitByCollision) fx.push(`<li class="earth"><i>💥</i><span>Heurté par un ennemi poussé : <b class="neg">−${o.collisionDamage}</b></span></li>`);
  return `
    <div class="tp-unit ${o.killed ? 'dead' : ''} ${compact ? 'compact' : ''}">
      <div class="tp-line"><b class="tp-name">${esc(o.name)}</b>${o.killed ? '<span class="tp-kill">☠ Vaincu</span>' : ''}<b class="tp-dmg" style="color:${o.spellDamage ? color : '#fff'}">−${total}</b></div>
      ${hpBar(o.hpBefore, o.hpAfter, o.maxHp, o.killed ? 0 : burnLoss)}
      <div class="tp-hp"><span>${o.hpBefore} → <b>${o.hpAfter}</b> / ${o.maxHp} PV</span>${o.breakdown && !compact ? `<span class="tp-factors">${factorLine(o.breakdown)}</span>` : ''}</div>
      ${fx.length ? `<ul class="tp-fx">${fx.join('')}</ul>` : ''}
    </div>`;
}

function errorDetail(p: CastPreview): string {
  if (p.error === 'Hors de portée.') return `Hors de portée : cible à ${plural(p.distance, 'case')}, portée ${p.minRange === p.maxRange ? p.minRange : `${p.minRange} à ${p.maxRange}`}.`;
  if (p.error === 'Pas de ligne de vue.') return 'Pas de ligne de vue : un obstacle ou une unité bloque le tir.';
  return p.error ?? '';
}

/** Carte affichée près du curseur quand un sort est pointé sur une case. */
export function castTargetCard(state: RunState, p: CastPreview, hovered: Unit | undefined): string {
  const spell = getSpell(p.spellId);
  const head = `<div class="tp-head" style="--c:${EL_COLOR[spell.element]}"><span class="tp-icon">${spellIconImg(spell.id)}</span><b>${spell.name}</b><span class="tp-pa">${spell.pa} PA</span></div>`;
  if (!p.valid) {
    let ghost = '';
    if (hovered && hovered.team === 'monster' && spell.damage !== undefined) {
      const d = spellDamageOn(state, spell.id, hovered)!;
      ghost = `<div class="tp-ghost">S’il était à portée : <b>−${d.amount}</b> sur ${esc(hovered.name)}${d.amount >= hovered.hp ? ' <span class="tp-kill">☠</span>' : ''}<br><span class="muted">${factorLine(d)}</span></div>`;
    }
    return `<div class="tp invalid">${head}<div class="tp-error">${esc(errorDetail(p))}</div>${ghost}</div>`;
  }
  const compact = p.targets.length > 2;
  const rows = p.targets.map((o) => outcomeRow(o, spell, compact)).join('');
  const foot: string[] = [];
  if (p.zone.length > 1) foot.push(`<span>${plural(p.zone.length, 'case')} touchée${p.zone.length > 1 ? 's' : ''} · ${plural(p.targets.filter((t) => !t.hitByCollision).length, 'ennemi')}</span>`);
  if (p.playerMovedTo) foot.push('<span>L’Archer saute sur cette case</span>');
  if (spell.gainPm) foot.push(`<span class="pos">+${spell.gainPm} PM pour l’Archer</span>`);
  const dc = p.concentrationAfter - p.concentrationBefore;
  if (dc) foot.push(`<span>Concentration ${p.concentrationBefore} → <b class="${dc > 0 ? 'pos' : 'neg'}">${p.concentrationAfter}</b></span>`);
  if (p.concentrationGainMissed)
    foot.push(`<span class="muted">Pas de +${p.concentrationGainMissed.gain} Concentration : cible à ${p.concentrationGainMissed.distance} cases, il en faut ${p.concentrationGainMissed.needed}</span>`);
  if (p.consumesDouble) foot.push('<span class="pos">Consomme le Tir concentré (×2)</span>');
  if (p.clearsRoom) foot.push('<span class="pos">La salle sera vidée</span>');
  return `<div class="tp">${head}${rows || (spell.damage !== undefined ? '<div class="tp-empty">Aucun ennemi touché.</div>' : '')}${foot.length ? `<div class="tp-foot">${foot.join('')}</div>` : ''}</div>`;
}
