/** Affichage des défis de combat : pastille du HUD, bandeau d'entrée de salle, résumé de fin de run. */
import './challenge.css';
import {
  CHALLENGE_TIERS,
  challengeBonus,
  challengeCounter,
  describeChallenge,
  getChallenge,
  type ChallengeProgress,
  type RunState,
} from '@chabfu/engine';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const pct = (b: number) => `+${Math.round(b * 100)} %`;

/** Nom du monstre à abattre en premier (« Le chef d'abord »), s'il est dans la salle. */
export function chefName(state: RunState, p: ChallengeProgress): string | undefined {
  return p.targetId ? state.units.find((u) => u.id === p.targetId)?.name : undefined;
}

export function challengeRule(state: RunState, p: ChallengeProgress): string {
  return describeChallenge(p, chefName(state, p));
}

const STATUS_MARK: Record<ChallengeProgress['status'], string> = { active: '', success: '✓', failed: '✗' };

/** Pastille du HUD : icône, nom, avancement et état en direct. */
export function challengePill(state: RunState, p: ChallengeProgress, maxHp: number): string {
  const c = getChallenge(p.id);
  const counter = p.status === 'active' ? challengeCounter(p, maxHp) : null;
  const tail = p.status === 'active' ? (counter ? `<em class="num">${esc(counter)}</em>` : '') : `<i>${STATUS_MARK[p.status]}</i>`;
  const state_ = p.status === 'success' ? 'Réussi' : p.status === 'failed' ? 'Raté' : 'En cours';
  return `<span class="cb-chal is-${p.status} tier-${c.tier}" title="${esc(`Défi ${CHALLENGE_TIERS[c.tier].label.toLowerCase()} (${pct(c.bonus)} XP et loot) : ${challengeRule(state, p)} ${state_}.`)}">
    <b class="cb-chal__ico" aria-hidden="true">${c.icon}</b><span class="cb-chal__name">${esc(c.name)}</span><small>${pct(c.bonus)}</small>${tail}
  </span>`;
}

/** Ligne du bandeau d'entrée de salle. */
export function challengeBannerLine(state: RunState, p: ChallengeProgress): { title: string; rule: string; tier: number } {
  const c = getChallenge(p.id);
  return { title: `Défi : ${c.name} · ${pct(c.bonus)}`, rule: challengeRule(state, p), tier: c.tier };
}

/** Résumé de fin de run : un jeton par salle et le bonus total. */
export function challengeEndRow(challenges: ChallengeProgress[] | undefined): string {
  if (!challenges?.length) return '';
  const total = challengeBonus(challenges);
  const chips = challenges
    .map((p) => {
      const c = getChallenge(p.id);
      const st = p.status === 'success' ? 'is-success' : 'is-failed';
      const mark = p.status === 'success' ? '✓' : '✗';
      return `<span class="end-chal__chip ${st}" title="${esc(describeChallenge(p))}"><i>${mark}</i>${esc(c.name)}${p.status === 'success' ? ` <small>${pct(c.bonus)}</small>` : ''}</span>`;
    })
    .join('');
  return `<div class="end-chal" aria-label="Défis de combat">
    <span class="end-chal__label">Défis</span>${chips}
    <span class="end-chal__total ${total ? 'on' : ''}">${total ? `${pct(total)} XP et loot` : 'Aucun bonus'}</span>
  </div>`;
}
