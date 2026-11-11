/**
 * Galerie du système de design (?dev=ui) : jetons, typographie, icônes et composants dans tous leurs états.
 */
import { ICON_NAMES, elementIcon, icon } from './icons';
import { banner, bindSegmented, confirmModal, emptyState, openSheet, segmented, toast } from './components';

const swatch = (name: string, label = name) =>
  `<div class="g-sw"><i style="background:var(${name})"></i><span>${label}</span><code>${name}</code></div>`;

export function renderGallery(app: HTMLElement): void {
  document.title = 'Chabfu · système de design';
  app.innerHTML = `
  <div class="g-page">
    <header class="g-head"><h1>Système de design</h1><p>Verre nocturne · jetons dans <code>src/ui/tokens.css</code></p></header>

    <section class="ui-panel"><h2 class="ui-section-title">Couleurs</h2>
      <div class="g-grid">
        ${['--c-bg', '--c-surface-solid', '--c-surface-raised', '--c-fill-strong', '--c-text', '--c-text-2', '--c-text-3'].map((n) => swatch(n)).join('')}
      </div>
      <div class="g-grid">
        ${['--c-accent', '--c-cta-b', '--c-danger', '--c-success', '--c-warning', '--c-hp', '--c-pa', '--c-pm', '--c-conc'].map((n) => swatch(n)).join('')}
      </div>
      <h3 class="g-h3">Éléments</h3>
      <div class="g-grid">
        ${['fire:Feu', 'water:Eau', 'earth:Terre', 'air:Air', 'neutral:Neutre'].map((p) => { const [k, l] = p.split(':'); return `<div class="g-sw"><i style="background:var(--c-${k})"></i><span>${elementIcon(k)} ${l}</span><code>--c-${k}</code></div>`; }).join('')}
      </div>
      <h3 class="g-h3">Raretés</h3>
      <div class="g-grid">
        ${['common:Commune', 'uncommon:Inhabituelle', 'rare:Rare', 'mythic:Mythique', 'legendary:Ultime'].map((p) => { const [k, l] = p.split(':'); return `<div class="g-rar" style="--r:var(--c-r-${k})"><b>${l}</b></div>`; }).join('')}
      </div>
    </section>

    <section class="ui-panel"><h2 class="ui-section-title">Typographie</h2>
      ${[['4xl', 'Victoire'], ['3xl', 'Bosquet des Ronces'], ['2xl', 'Titre d’écran'], ['xl', 'Titre de fiche'], ['lg', 'Sous-titre'], ['md', 'Texte courant : vos tirs frappent plus fort de loin.'], ['sm', 'Texte secondaire et détails de sort.'], ['xs', 'LÉGENDE · PASTILLE'], ['2xs', 'Micro-texte de badge']]
        .map(([k, t]) => `<div class="g-type"><code>--fs-${k}</code><span style="font-size:var(--fs-${k});font-weight:${k.includes('xl') ? 'var(--fw-bold)' : 'var(--fw-medium)'}">${t}</span></div>`).join('')}
      <div class="g-type"><code>chiffres</code><span class="num" style="font-size:var(--fs-xl);font-weight:700">150 / 150 · 0:36.2 · −24</span></div>
    </section>

    <section class="ui-panel"><h2 class="ui-section-title">Icônes (${ICON_NAMES.length})</h2>
      <div class="g-icons">${ICON_NAMES.map((n) => `<div title="${n}">${icon(n)}<small>${n}</small></div>`).join('')}</div>
    </section>

    <section class="ui-panel"><h2 class="ui-section-title">Boutons</h2>
      <div class="g-row">
        <button class="ui-btn ui-btn--primary ui-btn--lg">Lancer le donjon</button>
        <button class="ui-btn ui-btn--primary">Rejouer</button>
        <button class="ui-btn ui-btn--primary is-pressed">Pressé</button>
        <button class="ui-btn ui-btn--primary" disabled>Désactivé</button>
        <button class="ui-btn ui-btn--primary is-loading">Chargement</button>
      </div>
      <div class="g-row">
        <button class="ui-btn">${icon('home')} Retour au hub</button>
        <button class="ui-btn ui-btn--accent">${icon('check')} Équiper</button>
        <button class="ui-btn ui-btn--ghost">Passer</button>
        <button class="ui-btn ui-btn--danger">Abandonner</button>
        <button class="ui-btn ui-btn--sm">Petit</button>
        <button class="ui-btn" disabled>Désactivé</button>
      </div>
      <div class="g-row">
        <button class="ui-icon-btn" aria-label="Pause">${icon('pause')}</button>
        <button class="ui-icon-btn is-on" aria-label="Menace">${icon('eye')}</button>
        <button class="ui-icon-btn" aria-label="Accélérer">${icon('forward')}</button>
        <button class="ui-icon-btn" aria-label="Journal">${icon('logbook')}<span class="ui-badge">3</span></button>
        <button class="ui-icon-btn ui-icon-btn--sm" aria-label="Aide">${icon('help')}</button>
        <button class="ui-icon-btn ui-icon-btn--flat" aria-label="Fermer">${icon('close')}</button>
      </div>
    </section>

    <section class="ui-panel"><h2 class="ui-section-title">Pastilles et jauges</h2>
      <div class="g-row">
        <span class="ui-chip">${icon('turns')} 7 tours</span>
        <span class="ui-chip">${icon('clock')} 0:36.2</span>
        <span class="ui-chip ui-chip--accent">${icon('sparkle')} Nouveau</span>
        <span class="ui-chip ui-chip--danger">${icon('skull')} Fatal</span>
        <span class="ui-chip ui-chip--success">${icon('arrowUp')} Faiblesse</span>
        <span class="ui-chip ui-chip--gold">${icon('trophy')} Record</span>
      </div>
      <div class="g-bars">
        <div class="ui-bar ui-bar--hp ui-bar--lg" style="--v:72%;--ghost:72%"><b style="--ghost:72%"></b><i style="--v:52%"></i><span class="ui-bar__label num">78 / 150 PV</span></div>
        <div class="ui-bar ui-bar--xp ui-bar--lg" style="--v:40%"><i></i><span class="ui-bar__label num">24 / 60 XP</span></div>
        <div class="ui-segments" style="--n:10"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on lose"></i><i class="gain"></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>
    </section>

    <section class="ui-panel"><h2 class="ui-section-title">Sélecteurs</h2>
      <div class="g-row">${segmented('demo', [{ value: 'all', label: 'Toutes' }, { value: 'c', label: 'Commune' }, { value: 'u', label: 'Inhabituelle' }, { value: 'r', label: 'Rare' }, { value: 'm', label: 'Mythique' }], 'all')}</div>
      <div class="ui-steps" style="--n:10;margin-top:12px">${Array.from({ length: 10 }, (_, i) => `<button class="${i < 3 ? 'below' : ''} ${i < 2 ? 'done' : ''}" aria-pressed="${i === 3}">${i + 1}</button>`).join('')}</div>
    </section>

    <section class="ui-panel"><h2 class="ui-section-title">Fenêtres et retours</h2>
      <div class="g-row">
        <button class="ui-btn" id="g-sheet">Feuille du bas</button>
        <button class="ui-btn" id="g-modal">Confirmation</button>
        <button class="ui-btn" id="g-toast">Toast</button>
        <button class="ui-btn" id="g-banner">Bannière</button>
      </div>
    </section>

    <section class="ui-panel"><h2 class="ui-section-title">États vides et chargement</h2>
      <div class="g-cols">
        <div>${emptyState({ icon: 'bag', title: 'Aucun objet pour l’instant', text: 'Terminez un donjon pour gagner votre premier objet.', action: { id: 'g-go', label: 'Aller aux donjons' } })}</div>
        <div class="g-skel"><div class="ui-skeleton" style="height:120px"></div><div class="ui-skeleton" style="height:16px;width:70%"></div><div class="ui-skeleton" style="height:16px;width:45%"></div></div>
      </div>
    </section>
  </div>`;

  bindSegmented(app, 'demo', (v) => toast(`Filtre : ${v}`));
  app.querySelector('#g-sheet')!.addEventListener('click', () =>
    openSheet({ title: 'Flèche ardente', html: `<p class="g-p">Inflige des dégâts de Feu et brûle la cible pendant 2 tours.</p><button class="ui-btn ui-btn--primary ui-btn--block">Lancer</button>` }),
  );
  app.querySelector('#g-modal')!.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Abandonner le run ?', text: 'Vous gardez l’XP des monstres déjà vaincus.', confirm: 'Abandonner', danger: true });
    toast(ok ? 'Run abandonné' : 'On continue', ok ? 'error' : 'success');
  });
  app.querySelector('#g-toast')!.addEventListener('click', () => toast('Arc racineux (Rare) ajouté au sac', 'gold'));
  app.querySelector('#g-banner')!.addEventListener('click', () => void banner('Lisière', 'Salle 1 / 3'));
}
