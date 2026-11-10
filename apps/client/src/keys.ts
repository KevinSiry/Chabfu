/**
 * Raccourcis des emplacements de la barre de sorts.
 * On lit `KeyboardEvent.code` (position physique de la touche) : la rangée du haut répond quelle
 * que soit la disposition (AZERTY : & é " ' ( - è _ ç à ; QWERTY : 1 2 3…), et le pavé numérique
 * reste actif en plus.
 */
const SLOT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
/** Libellés AZERTY par défaut, remplacés par ceux du clavier réel quand le navigateur les donne. */
const labels = ['&', 'é', '"', "'", '(', '-', 'è', '_', 'ç', 'à'];

interface KeyboardLayoutMap {
  get(code: string): string | undefined;
}
const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<KeyboardLayoutMap> } }).keyboard;
kb?.getLayoutMap?.()
  .then((map) => SLOT_CODES.forEach((code, i) => (labels[i] = map.get(code) ?? labels[i])))
  .catch(() => {
    /* API indisponible : on garde les libellés AZERTY */
  });

/** Index (0-based) de l'emplacement visé par la touche, ou -1. */
export function slotFromKey(e: KeyboardEvent): number {
  const i = SLOT_CODES.indexOf(e.code);
  if (i >= 0) return i;
  const m = /^Numpad([0-9])$/.exec(e.code);
  if (m) return m[1] === '0' ? 9 : Number(m[1]) - 1;
  return -1;
}

/** Touche affichée pour l'emplacement `i` (0-based). */
export function slotKeyLabel(i: number): string {
  return labels[i] ?? '';
}

/** Libellé de plage pour l'aide : « & à ( » pour 5 emplacements. */
export function slotKeysRange(n: number): string {
  return n <= 1 ? slotKeyLabel(0) : `${slotKeyLabel(0)} à ${slotKeyLabel(n - 1)}`;
}
