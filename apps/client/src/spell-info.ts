/**
 * Fiche de sort et carte de visée. Tous les chiffres viennent du moteur (`spellPower`,
 * `previewCastDetailed`) : cette vue ne fait que les mettre en forme.
 */
import {
  COLLISION_DAMAGE_PER_CELL,
  DAMAGE_FACTORS,
  DISTANCE_BONUS_FROM,
  DISTANCE_BONUS_MAX_CELLS,
  distanceBonus,
  combinePassives,
  getCastError,
  getPassive,
  getSpell,
  isRangedShot,
  spellDamageOn,
  spellPaCost,
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
import { icon } from './ui/icons';

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
  // Zones en ligne : le lanceur est en bas, la ligne part vers le haut.
  const on = (x: number, y: number) =>
    zone === 'cross' ? (x === 1 || y === 1) && !(x !== 1 && y !== 1) : zone === 'square' ? true : zone === 'line' || zone === 'pierce' ? x === 1 : x === 1 && y === 1;
  const cells = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push(`<i class="${on(x, y) ? 'on' : ''} ${x === 1 && y === 1 ? 'c' : ''}"></i>`);
  return `<span class="zone-mini">${cells.join('')}</span>`;
}

function zoneLabel(zone: SpellDef['zone'], length?: number): string {
  if (zone === 'cross') return 'Croix de 5 cases';
  if (zone === 'square') return 'Carré de 9 cases';
  if (zone === 'line') return `Ligne de ${length ?? 1} cases`;
  if (zone === 'pierce') return 'Toute la ligne';
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
  const paCost = spellPaCost(s, passives);
  let err = opts.outOfCombat ? null : getCastError(state, spellId);
  if (err === 'Pas assez de PA.') err = `Pas assez de PA : ${state.units.find((u) => u.team === 'player')!.pa} sur ${paCost}.`;

  // Coûts
  const costs = [`<span class="ss-cost pa"><b>${paCost}</b> PA${paCost < s.pa ? ' <small class="pos">(passif)</small>' : ''}</span>`];
  if (s.maxPerTurn) costs.push(`<span class="ss-cost uses"><b>${opts.outOfCombat ? s.maxPerTurn : `${uses}/${s.maxPerTurn}`}</b> par tour</span>`);

  // Dégâts
  let damage = '';
  if (s.damage !== undefined) {
    const factors = [`${s.damage} de base`];
    if (power.flat) factors.push(`+ ${power.flat} <span class="muted">dommages (équipement)</span>`);
    if (power.mastery) factors.push(`× ${num(1 + power.mastery / 100)} <span class="muted">maîtrise ${ELEMENT_LABEL[s.element]} +${power.mastery} %</span>`);
    damage = `
      <div class="ss-dmg" style="--c:${color}">
        <div class="ss-dmg-main"><b>${power.damage.normal}</b><span>${el(s.element)} de près${s.zone ? `<br><small>sur chaque ennemi de la zone</small>` : ''}</span>${power.farBonus ? `<b class="ss-far">${power.damageFar.normal}</b><span>à ${plural(power.farDistance, 'case')}<br><small class="pos">+${pct(power.farBonus)}${power.aimed ? ', visé' : ''}</small></span>` : ''}</div>
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
      icon: icon('burn'),
      cls: 'fire',
      html: `<b>Brûlure</b> : <b>${b.perTurn.normal}</b> dégâts Feu au début de chacun de ses <b>${b.turns}</b> prochains tours, soit <b>${b.perTurn.normal * b.turns}</b> au total${
        b.turns > s.burn.turns ? ` <span class="pos">(+${b.turns - s.burn.turns} tour, passif)</span>` : ''
      }. <span class="muted">Ne se cumule pas : la plus forte est gardée. Pas de bonus de distance.</span>`,
    });
  }
  if (s.push) {
    fx.push({
      icon: icon('push'),
      cls: 'earth',
      html: `<b>Poussée</b> : repousse la cible de <b>${plural(s.push, 'case')}</b>, à l’opposé de l’Archer. Contre un rocher ou une unité : <b>${COLLISION_DAMAGE_PER_CELL}</b> dégâts par case non parcourue, et la moitié à l’unité heurtée.`,
    });
  }
  if (s.pmRemoval) {
    fx.push({ icon: icon('slow'), cls: 'water', html: `<b>Ralentit</b> : retire <b>${s.pmRemoval} PM</b> à la cible pour son prochain tour. <span class="muted">Se cumule si vous le relancez.</span>` });
  }
  if (s.jump) fx.push({ icon: icon('jump'), cls: 'neutral', html: `<b>Saut</b> : l’Archer atterrit sur la case visée, par-dessus rochers et unités. <span class="muted">Ne coûte pas de PM.</span>` });
  if (s.zone === 'pierce') fx.push({ icon: icon('range'), cls: 'earth', html: `<b>Perforant</b> : touche <b>tous les ennemis alignés</b> derrière la cible, jusqu’au premier rocher.` });
  if (s.recoil) fx.push({ icon: icon('jump'), cls: 'air', html: `<b>Recul</b> : après le tir, l’Archer recule de <b>${plural(s.recoil, 'case')}</b> à l’opposé de la cible, si la case est libre. <span class="muted">Ne coûte ni PM ni Concentration.</span>` });
  if (s.detonateBurn) fx.push({ icon: icon('burn'), cls: 'fire', html: `<b>Éclatement</b> : toute la brûlure restante de la cible part d’un coup, <b>+${Math.round((s.detonateBurn - 1) * 100)} %</b>, puis s’éteint. <span class="muted">Sans brûlure, seuls les dégâts directs s’appliquent.</span>` });
  if (s.bonusVsSlowed) fx.push({ icon: icon('slow'), cls: 'water', html: `<b>Brise-glace</b> : <b>+${Math.round((s.bonusVsSlowed - 1) * 100)} %</b> de dégâts sur une cible ralentie (PM retirés pour son prochain tour).` });
  if (s.bonusVsObstacle) fx.push({ icon: icon('push'), cls: 'earth', html: `<b>Écrasement</b> : dégâts <b>×${num(s.bonusVsObstacle)}</b> si un rocher, le bord ou une unité se trouve juste derrière la cible, dans l’axe du tir.` });
  if (s.gainPm) fx.push({ icon: icon('pm'), cls: 'air', html: `<b>Élan</b> : rend <b>${s.gainPm} PM</b> à l’Archer, utilisable tout de suite.` });
  if (s.buffNextShot) {
    fx.push({
      icon: icon('conc'),
      cls: 'conc',
      html: `<b>Tir visé</b> : votre prochain sort de dégâts double son bonus de distance, jusqu’à <b>+${pct(distanceBonus(state, DISTANCE_BONUS_FROM + DISTANCE_BONUS_MAX_CELLS, true))}</b> à ${DISTANCE_BONUS_FROM + DISTANCE_BONUS_MAX_CELLS} cases. <span class="muted">Sans effet sur un tir à ${DISTANCE_BONUS_FROM} cases ou moins. Reste actif d’un tour et d’une salle à l’autre jusqu’à ce tir.</span>`,
    });
  }
  // Portée = puissance
  const conc: string[] = [];
  if (s.damage !== undefined && s.target !== 'self') {
    const steps = [4, 6, 8].map((d) => `${d} cases <b class="pos">+${pct(distanceBonus(state, d, power.aimed))}</b>`);
    conc.push(`Plus la cible est loin, plus ce sort frappe fort : ${steps.join(' · ')}. <span class="muted">Brûlure et collisions ne sont pas concernées.</span>`);
  }
  if (s.damage !== undefined && mods.killPm) conc.push(`<b class="pos">+${mods.killPm} PM</b> par ennemi achevé pendant votre tour (passif).`);

  // Passifs qui modifient ce sort
  const affecting = passives
    .map(getPassive)
    .filter((p) => {
      const m = p.mods;
      return (
        (m.burnExtraTurns && s.burn) ||
        (m.rangeBonus && isRangedShot(s)) ||
        (m.paCostReduction && m.paCostReduction[s.id]) ||
        (m.distanceBonusPerCell && s.damage !== undefined) ||
        (m.killPm && s.damage !== undefined)
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
        <span>Portée</span><b>${range}${power.maxRange > s.maxRange ? ` <span class="pos">(+${power.maxRange - s.maxRange} passifs et équipement)</span>` : ''}</b>
        <span>Cible</span><b>${TARGET_LABEL[s.target]}</b>
        ${s.target !== 'self' ? `<span>Ligne de vue</span><b>${s.los ? 'Requise' : '<span class="pos">Non requise</span>'}</b>` : ''}
        ${s.target !== 'self' ? `<span>Lancer</span><b>${s.inLine ? 'En ligne droite uniquement' : 'Dans toutes les directions'}</b>` : ''}
        ${s.damage !== undefined ? `<span>Zone</span><b>${zoneDiagram(s.zone)} ${zoneLabel(s.zone, s.zoneLength)}</b>` : ''}
        <span>Utilisations</span><b>${s.maxPerTurn ? `${plural(s.maxPerTurn, 'fois')} par tour` : 'Illimitées'} <span class="muted">· pas de temps de recharge</span></b>
      </div>
      ${conc.length ? `<div class="ss-conc"><div class="ss-sec">Portée = puissance</div>${conc.map((c) => `<p>${c}</p>`).join('')}</div>` : ''}
      ${affecting.length ? `<div class="ss-passives">Modifié par : ${affecting.map((n) => `<span class="chip">${esc(n)}</span>`).join(' ')}</div>` : ''}
      ${power.aimed ? '<div class="ss-note pos">Tir concentré actif : ce tir double son bonus de distance et consomme le Tir concentré.</div>' : ''}
      ${err ? `<div class="ss-note neg">${esc(err)}</div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Bandeau compact : l'essentiel d'un sort en combat, la fiche complète sur demande
// ---------------------------------------------------------------------------

/** Effets du sort en quelques mots (le détail exact reste dans `spellSheet`). */
export function briefEffects(state: RunState, s: SpellDef): string[] {
  const power = spellPower(state, s.id);
  const out: string[] = [];
  if (s.zone) out.push(zoneLabel(s.zone, s.zoneLength));
  if (s.burn && power.burn) out.push(`Brûlure ${power.burn.perTurn.normal} × ${power.burn.turns} tours`);
  if (s.push) out.push(`Pousse de ${plural(s.push, 'case')}`);
  if (s.pmRemoval) out.push(`−${s.pmRemoval} PM à la cible`);
  if (s.jump) out.push('Saut sur la case');
  if (s.gainPm) out.push(`+${s.gainPm} PM`);
  if (s.buffNextShot) out.push('Prochain tir : bonus de distance ×2');
  if (s.recoil) out.push(`Recule de ${plural(s.recoil, 'case')}`);
  if (s.detonateBurn) out.push(`Fait éclater la brûlure +${Math.round((s.detonateBurn - 1) * 100)} %`);
  if (s.bonusVsSlowed) out.push(`+${Math.round((s.bonusVsSlowed - 1) * 100)} % sur cible ralentie`);
  if (s.bonusVsObstacle) out.push(`×${num(s.bonusVsObstacle)} contre un obstacle`);
  return out;
}

/**
 * Bandeau compact au-dessus de la barre de sorts : dégâts, portée, effets en bref.
 * Le bouton « Détails » (touche I) ouvre la fiche complète à droite.
 */
export function spellBrief(state: RunState, spellId: string, opts: { slot?: number; detailsOpen?: boolean } = {}): string {
  const s = getSpell(spellId);
  const passives = state.player.passives ?? [];
  const power = spellPower(state, spellId);
  const color = EL_COLOR[s.element];
  void passives;
  const err = getCastError(state, spellId);
  const range = s.target === 'self' ? 'Sur soi' : s.minRange === power.maxRange ? plural(s.minRange, 'case') : `${s.minRange} à ${power.maxRange} cases`;
  const main: string[] = [];
  if (s.damage !== undefined)
    main.push(
      `<b class="sb-dmg" title="${power.damage.normal} de près, ${power.damageFar.normal} à ${power.farDistance} cases">${power.farBonus ? `${power.damage.normal}–${power.damageFar.normal}` : power.damage.normal}</b> <span>${el(s.element)}</span>`,
    );
  main.push(`<span class="sb-range">${icon('range')}${range}</span>`);
  const fx = briefEffects(state, s);
  return `
    <div class="sb" style="--c:${color}">
      <span class="sb-icon">${spellIconImg(spellId)}</span>
      <div class="sb-body">
        <div class="sb-title"><b>${s.name}</b>${power.aimed ? '<span class="sb-tag pos">Visé</span>' : ''}</div>
        <div class="sb-main">${main.join('')}</div>
        ${fx.length ? `<div class="sb-fx">${fx.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
        ${err ? `<div class="sb-err neg">${esc(err)}</div>` : ''}
      </div>
      <button type="button" class="sb-more" data-sheet="${spellId}" aria-pressed="${opts.detailsOpen ? 'true' : 'false'}" aria-label="${opts.detailsOpen ? 'Masquer' : 'Afficher'} la fiche complète du sort">
        ${icon('info')}<span>Détails</span><kbd>I</kbd>
      </button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Carte de visée : survol d'une case avec un sort sélectionné
// ---------------------------------------------------------------------------

function factorLine(d: DamageBreakdown): string {
  const f: string[] = [`${d.base} ${ELEMENT_LABEL[d.element]}`];
  if (d.flat) f.push(`+${d.flat} dommages`);
  if (d.mastery) f.push(`maîtrise +${d.mastery} %`);
  if (d.weakness) f.push(`<span class="pos">faiblesse ×${num(DAMAGE_FACTORS.weakness)}</span>`);
  if (d.resistance) f.push(`<span class="neg">résistance ×${num(DAMAGE_FACTORS.resistance)}</span>`);
  if (d.distanceBonus) f.push(`<span class="pos">${d.distance} cases +${pct(d.distanceBonus)}${d.aimed ? ' (visé)' : ''}</span>`);
  else f.push(`<span class="muted">${d.distance} cases, pas de bonus</span>`);
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
      `<li class="fire"><i>${icon('burn')}</i><span>Brûlure <b>${o.burn.damage}</b> × ${plural(o.burn.turns, 'tour')}${
        o.burnKillsIn ? ` : <b class="kill-txt">l’achève ${o.burnKillsIn === 1 ? 'au début de son prochain tour' : `au début de son ${o.burnKillsIn}e tour`}</b>` : ` <span class="muted">(−${burnLoss} au total)</span>`
      }</span></li>`,
    );
  if (o.pmRemoved && !o.killed)
    fx.push(`<li class="water"><i>${icon('slow')}</i><span>−${o.pmRemoved} PM : <b>${o.pmNextTurn}</b> PM à son prochain tour <span class="muted">(au lieu de ${o.pmNextTurn + o.pmRemoved})</span></span></li>`);
  if (o.push) {
    const moved = o.push.cells ? `Poussé de <b>${plural(o.push.cells, 'case')}</b>` : 'Bloqué, ne bouge pas';
    fx.push(
      `<li class="earth"><i>${icon('push')}</i><span>${moved}${o.push.blocked ? ` : choc <b class="neg">−${o.collisionDamage}</b> <span class="muted">(${o.push.wanted - o.push.cells} case${o.push.wanted - o.push.cells > 1 ? 's' : ''} non parcourue${o.push.wanted - o.push.cells > 1 ? 's' : ''})</span>` : ''}</span></li>`,
    );
  }
  if (o.hitByCollision) fx.push(`<li class="earth"><i>${icon('impact')}</i><span>Heurté par un ennemi poussé : <b class="neg">−${o.collisionDamage}</b></span></li>`);
  return `
    <div class="tp-unit ${o.killed ? 'dead' : ''} ${compact ? 'compact' : ''}">
      <div class="tp-line"><b class="tp-name">${esc(o.name)}</b>${o.killed ? `<span class="tp-kill">${icon('skull')} Vaincu</span>` : ''}<b class="tp-dmg" style="color:${o.spellDamage ? color : '#fff'}">−${total}</b></div>
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
  const head = `<div class="tp-head" style="--c:${EL_COLOR[spell.element]}"><span class="tp-icon">${spellIconImg(spell.id)}</span><b>${spell.name}</b><span class="tp-pa">${spellPaCost(spell, state.player.passives ?? [])} PA</span></div>`;
  if (!p.valid) {
    let ghost = '';
    if (hovered && hovered.team === 'monster' && spell.damage !== undefined) {
      const d = spellDamageOn(state, spell.id, hovered)!;
      ghost = `<div class="tp-ghost">S’il était à portée : <b>−${d.amount}</b> sur ${esc(hovered.name)}${d.amount >= hovered.hp ? ' <span class="tp-kill">☠</span>' : ''}<br><span class="muted">${factorLine(d)}</span></div>`;
    }
    const far =
      spell.damage !== undefined && p.error !== 'Hors de portée.'
        ? `<div class="tp-ghost">${p.distanceBonus ? `<span class="pos">Tir à ${plural(p.distance, 'case')} : +${pct(p.distanceBonus)} de dégâts</span>` : `<span class="muted">Tir à ${plural(p.distance, 'case')} : pas de bonus de distance</span>`}</div>`
        : '';
    return `<div class="tp invalid">${head}<div class="tp-error">${esc(errorDetail(p))}</div>${ghost}${far}</div>`;
  }
  const compact = p.targets.length > 2;
  const rows = p.targets.map((o) => outcomeRow(o, spell, compact)).join('');
  const foot: string[] = [];
  if (p.zone.length > 1) foot.push(`<span>${plural(p.zone.length, 'case')} touchée${p.zone.length > 1 ? 's' : ''} · ${plural(p.targets.filter((t) => !t.hitByCollision).length, 'ennemi')}</span>`);
  if (p.playerMovedTo) foot.push('<span>L’Archer saute sur cette case</span>');
  if (spell.gainPm) foot.push(`<span class="pos">+${spell.gainPm} PM pour l’Archer</span>`);
  if (spell.damage !== undefined)
    foot.push(p.distanceBonus ? `<span class="pos">Tir à ${plural(p.distance, 'case')} : +${pct(p.distanceBonus)}</span>` : `<span class="muted">Tir à ${plural(p.distance, 'case')} : pas de bonus de distance</span>`);
  if (p.consumesAimed) foot.push('<span class="pos">Consomme le Tir concentré</span>');
  if (p.clearsRoom) foot.push('<span class="pos">La salle sera vidée</span>');
  return `<div class="tp">${head}${rows || (spell.damage !== undefined ? '<div class="tp-empty">Aucun ennemi touché.</div>' : '')}${foot.length ? `<div class="tp-foot">${foot.join('')}</div>` : ''}</div>`;
}

function pct(f: number): string {
  return `${Math.round(f * 100)} %`;
}
