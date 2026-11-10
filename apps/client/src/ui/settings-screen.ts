/**
 * Écran des paramètres (fiche) : son, vibrations, vitesse des combats, accessibilité, tutoriel.
 * Ouvert depuis la roue dentée de la barre du haut ou depuis le menu pause du combat.
 */
import { migrateSave, SaveError } from '@chabfu/engine';
import { openPanel, segmented, bindSegmented, toast, confirmModal } from './components';
import { applySave, currentSave, getSaveStatus, onSaveStatus, pushNow, type SaveStatus } from '../save/sync';
import { icon } from './icons';
import { getSettings, updateSettings, type Settings } from './settings';
import { sfx } from './sfx';

function slider(id: keyof Settings, label: string, ico: string): string {
  const v = Math.round((getSettings()[id] as number) * 100);
  return `<label class="st-row st-slider">
    <span class="st-ico">${icon(ico)}</span>
    <span class="st-label">${label}</span>
    <input type="range" min="0" max="100" step="5" value="${v}" data-range="${id}" style="--v:${v}%" aria-label="${label}">
    <output class="st-val num">${v}</output>
  </label>`;
}

function toggle(id: keyof Settings, label: string, ico: string, hint = ''): string {
  const on = Boolean(getSettings()[id]);
  return `<div class="st-row">
    <span class="st-ico">${icon(ico)}</span>
    <span class="st-label">${label}${hint ? `<small>${hint}</small>` : ''}</span>
    <button type="button" class="st-switch" role="switch" aria-checked="${on}" data-toggle="${id}" aria-label="${label}"><i></i></button>
  </div>`;
}

function choice(id: keyof Settings, label: string, ico: string, options: { value: string; label: string }[]): string {
  return `<div class="st-row st-choice">
    <span class="st-ico">${icon(ico)}</span>
    <span class="st-label">${label}</span>
    ${segmented(`st-${id}`, options, String(getSettings()[id]))}
  </div>`;
}

const SAVE_STATUS: Record<SaveStatus, { label: string; hint: string }> = {
  server: { label: 'Enregistrée', hint: 'Partie enregistrée dans la base de données' },
  pending: { label: 'Envoi…', hint: "Derniers changements en cours d'envoi à la base de données" },
  offline: { label: 'Hors ligne', hint: 'Serveur injoignable : partie gardée sur cet appareil, envoyée dès son retour' },
};

function saveChip(s: SaveStatus): string {
  const st = SAVE_STATUS[s];
  return `<span class="st-save-chip is-${s}" id="st-save-status" title="${st.hint}" aria-label="${st.hint}">${s === 'server' ? icon('check') : ''}${st.label}</span>`;
}

function exportSave(): void {
  const json = JSON.stringify(currentSave(), null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `chabfu-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Sauvegarde exportée', 'success');
}

async function importSave(file: File): Promise<void> {
  let save;
  try {
    save = migrateSave(JSON.parse(await file.text()));
  } catch (e) {
    toast(e instanceof SaveError ? e.message : "Ce fichier n'est pas une sauvegarde Chabfu", 'error');
    return;
  }
  const ok = await confirmModal({
    title: 'Importer la sauvegarde ?',
    text: 'La partie actuelle sera remplacée par celle du fichier. Pense à exporter la partie actuelle avant si tu veux la garder.',
    confirm: 'Importer',
    danger: true,
  });
  if (!ok) return;
  applySave(save, true);
  await pushNow();
  location.reload();
}

export function openSettings(o: { onTutorial?: () => void } = {}): void {
  const html = `<div class="st">
    <div class="st-col">
    <section class="st-group"><h3>Son</h3>
      ${slider('master', 'Volume général', 'sound')}
      ${slider('sfx', 'Effets sonores', 'sparkle')}
      ${toggle('vibrate', 'Vibrations', 'vibrate', 'Sur téléphone, à chaque coup reçu et à la victoire')}
    </section>
    </div>
    <div class="st-col">
    <section class="st-group"><h3>Combat</h3>
      ${choice('speed', 'Vitesse des animations', 'forward', [
        { value: '1', label: '×1' },
        { value: '1.5', label: '×1,5' },
        { value: '2', label: '×2' },
      ])}
    </section>
    <section class="st-group"><h3>Aide</h3>
      <button type="button" class="ui-btn ui-btn--blue ui-btn--block" id="st-tuto">${icon('help')} Revoir le tutoriel</button>
    </section>
    <section class="st-group"><h3 class="st-save-head">Sauvegarde ${saveChip(getSaveStatus())}</h3>
      <div class="st-save-btns">
        <button type="button" class="ui-btn ui-btn--sm" id="st-export">${icon('arrowDown')} Exporter</button>
        <button type="button" class="ui-btn ui-btn--sm" id="st-import">${icon('arrowUp')} Importer</button>
      </div>
      <input type="file" accept="application/json,.json" id="st-import-file" hidden>
    </section>
    </div>
    <div class="st-col">
    <section class="st-group"><h3>Confort</h3>
      ${choice('text', 'Taille du texte', 'info', [
        { value: 'md', label: 'Normal' },
        { value: 'lg', label: 'Grand' },
        { value: 'xl', label: 'Très grand' },
      ])}
      ${choice('motion', 'Animations', 'sparkle', [
        { value: 'auto', label: 'Auto' },
        { value: 'full', label: 'Toutes' },
        { value: 'reduced', label: 'Réduites' },
      ])}
      ${toggle('cvd', 'Couleurs adaptées', 'eye', 'Motifs en plus des couleurs (daltonisme)')}
    </section>
    </div>
    <p class="st-foot">Chabfu · prototype · partie et réglages enregistrés dans la base de données</p>
  </div>`;
  const sheet = openPanel({ title: 'Paramètres', tabs: [{ id: 'all', label: 'Paramètres', html: () => html }], cls: 'st-sheet' });
  const body = sheet.body;

  body.querySelectorAll<HTMLInputElement>('[data-range]').forEach((r) => {
    const out = r.parentElement!.querySelector('output')!;
    r.addEventListener('input', () => {
      r.style.setProperty('--v', `${r.value}%`);
      out.textContent = r.value;
      updateSettings({ [r.dataset.range!]: Number(r.value) / 100 } as Partial<Settings>);
    });
    r.addEventListener('change', () => sfx('select'));
  });
  body.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.toggle as keyof Settings;
      const on = !getSettings()[id];
      updateSettings({ [id]: on } as Partial<Settings>);
      b.setAttribute('aria-checked', String(on));
      if (id === 'vibrate' && on) navigator.vibrate?.(40);
    }),
  );
  bindSegmented(body, 'st-speed', (v) => updateSettings({ speed: Number(v) as Settings['speed'] }));
  bindSegmented(body, 'st-text', (v) => updateSettings({ text: v as Settings['text'] }));
  bindSegmented(body, 'st-motion', (v) => updateSettings({ motion: v as Settings['motion'] }));
  const off = onSaveStatus((st) => {
    const el = body.querySelector<HTMLElement>('#st-save-status');
    if (!el?.isConnected) return off();
    el.outerHTML = saveChip(st);
  });
  body.querySelector('#st-export')!.addEventListener('click', exportSave);
  const fileInput = body.querySelector<HTMLInputElement>('#st-import-file')!;
  body.querySelector('#st-import')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (f) void importSave(f);
  });
  body.querySelector('#st-tuto')!.addEventListener('click', () => {
    updateSettings({ seenTips: [], tutorialDone: false });
    sheet.close();
    toast('Le tutoriel reprendra au prochain combat', 'success');
    o.onTutorial?.();
  });
}
