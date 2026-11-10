/**
 * Écran des paramètres (fiche) : son, vibrations, vitesse des combats, accessibilité, tutoriel.
 * Ouvert depuis la roue dentée de la barre du haut ou depuis le menu pause du combat.
 */
import { openPanel, segmented, bindSegmented, toast } from './components';
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
    <p class="st-foot">Chabfu · prototype · réglages enregistrés sur cet appareil</p>
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
  body.querySelector('#st-tuto')!.addEventListener('click', () => {
    updateSettings({ seenTips: [], tutorialDone: false });
    sheet.close();
    toast('Le tutoriel reprendra au prochain combat', 'success');
    o.onTutorial?.();
  });
}
