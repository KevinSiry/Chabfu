import { RUNE_GRADE_LABEL, parseRuneKey, runeEffectText, runeLabel, type RuneGrade, type RuneKey, type RuneType } from '@chabfu/engine';
import { assetImg } from '../ui/assets';
import './runes.css';

/** Icône peinte d'un type de rune (public/assets/runes/<type>.webp) ; repli : gemme dessinée en CSS. */
export const runeIconImg = (type: RuneType, cls = 'asset-rune') => assetImg(`runes/${type}.webp`, cls);

/** Pierre d'une rune (ou emplacement vide si key est null). */
export function runeGemHtml(key: RuneKey | null, opts: { size?: 'sm' | 'md' | 'lg'; count?: number; dim?: boolean } = {}): string {
  const size = opts.size ?? 'md';
  if (!key) return `<span class="rune-gem rune-empty rune-${size}" aria-label="Emplacement vide"></span>`;
  const { type, grade } = parseRuneKey(key);
  return `<span class="rune-gem rune-${type} grade-${grade} rune-${size}${opts.dim ? ' dim' : ''}" title="${runeLabel(key)} : ${runeEffectText(key)}">
    <i class="rune-stone"></i>${runeIconImg(type)}${gradePips(grade)}${opts.count !== undefined ? `<b class="rune-count">${opts.count}</b>` : ''}
  </span>`;
}

export function gradePips(grade: RuneGrade): string {
  const n = grade === 'brute' ? 1 : grade === 'taillee' ? 2 : 3;
  return `<span class="rune-pips" aria-label="${RUNE_GRADE_LABEL[grade]}">${'<i></i>'.repeat(n)}</span>`;
}

/** Ligne compacte « pierre + nom + effet ». */
export function runeLineHtml(key: RuneKey): string {
  return `<span class="rune-line">${runeGemHtml(key, { size: 'sm' })}<span><b>${runeLabel(key)}</b><small>${runeEffectText(key)}</small></span></span>`;
}
