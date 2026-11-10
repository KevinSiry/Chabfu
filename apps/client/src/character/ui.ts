import { characterStatsHtml } from '../stuff/stat-view';
import {
  MAX_LEVEL,
  PASSIVES,
  SPELLS,
  TRANCHES,
  DUNGEONS,
  characterEffectiveLevel,
  equipmentBonus,
  characterLevel,
  createCharacter,
  currentLoadout,
  getTranche,
  levelProgress,
  redefine,
  type Character,
  type Element,
} from '@chabfu/engine';
import './character.css';
import { assetUrl, spellIconImg } from '../ui/assets';
import { icon } from '../ui/icons';
import { confirmModal, openPanel } from '../ui/components';
import { pageAll, pagerHtml } from '../ui/pager';
import { registerRunEndSection, type RunEndContext } from './run-end';
import { getInventory } from '../stuff/store';
import { deleteCharacter, getCharacter, saveCharacter } from './store';


export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function xpBar(xp: number, cls = ''): string {
  const p = levelProgress(xp);
  const pct = p.needed ? (100 * p.into) / p.needed : 100;
  const label = p.needed ? `${p.into.toLocaleString('fr-FR')} / ${p.needed.toLocaleString('fr-FR')} XP` : 'Niveau maximum';
  return `<div class="xpbar ${cls}"><div style="width:${pct}%"></div><span>${label}</span></div>`;
}

// ---------------------------------------------------------------------------
// Création du personnage
// ---------------------------------------------------------------------------

export function renderCharacterCreation(app: HTMLElement, onDone: () => void): void {
  app.innerHTML = `
    <div class="welcome">
      <div class="wl-wrap">
        <div class="wl-hero">
          <h1 class="wl-logo">Chabfu</h1>
          <span class="wl-tag">Donjons tactiques au tour par tour</span>
          <div class="wl-archer"><img src="${assetUrl('units/archer.png')}" alt="" draggable="false"></div>
        </div>
        <div class="wl-card">
          <h2>Votre Archer</h2>
          <p>Traversez des donjons de salle en salle jusqu’au boss. Chaque run rapporte de l’XP et du butin pour devenir plus fort.</p>
          <ul class="wl-perks">
            <li>${icon('levelUp')}Niveaux et sorts</li>
            <li>${icon('bag')}Butin et stuff</li>
            <li>${icon('trophy')}Records</li>
          </ul>
          <form class="wl-form" id="create-form">
            <label for="char-name">Son nom</label>
            <input id="char-name" maxlength="20" autocomplete="off" placeholder="Nom de l’Archer" required />
            <button class="ui-btn ui-btn--primary ui-btn--block" type="submit">Jouer</button>
          </form>
          <div class="wl-spells" aria-label="Sorts de départ : Flèche ardente et Bond arrière">${spellIconImg('fleche_ardente')}${spellIconImg('bond_arriere')}</div>
        </div>
      </div>
    </div>`;
  const input = app.querySelector('#char-name') as HTMLInputElement;
  if (matchMedia('(pointer: fine)').matches) input.focus();
  app.querySelector('#create-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    saveCharacter(createCharacter(input.value, new Date().toISOString()));
    onDone();
  });
}

// ---------------------------------------------------------------------------
// Bandeau du personnage (écran de préparation)
// ---------------------------------------------------------------------------

export function characterBannerHtml(c: Character): string {
  const level = characterLevel(c);
  const eff = characterEffectiveLevel(c);
  const t = getTranche(c.trancheId);
  return `
    <div class="card char-banner">
      <div class="char-id">
        <div class="char-level"><small>Niv.</small>${level}</div>
        <div>
          <b>${escapeHtml(c.name)}</b>
          <div class="muted">Archer · Tranche T${t.id}${eff < level ? ` · redéfini au niveau ${eff}` : ''}</div>
        </div>
      </div>
      <div class="char-xp">${xpBar(c.xp)}</div>
      <div class="char-actions">
        <button class="secondary" id="open-sheet">Fiche du personnage</button>
        <button class="secondary" id="open-tranches">Tranche T${t.id} ▾</button>
      </div>
    </div>`;
}

/** Plaque compacte du personnage pour la barre du hub (mêmes boutons que le bandeau). */
export function characterPlateHtml(c: Character): string {
  const level = characterLevel(c);
  const eff = characterEffectiveLevel(c);
  const t = getTranche(c.trancheId);
  return `
    <div class="char-plate">
      <button class="char-level" id="open-sheet" title="Fiche du personnage"><small>Niv.</small>${level}</button>
      <div class="char-plate-info">
        <div class="char-plate-name"><b>${escapeHtml(c.name)}</b><span class="muted">Archer${eff < level ? ` · redéfini niv. ${eff}` : ''}</span></div>
        ${xpBar(c.xp)}
      </div>
      <button class="tranche-btn" id="open-tranches" title="Changer de tranche">T${t.id}<small>▾</small></button>
    </div>`;
}

/** Branche les boutons du bandeau. `onChange` est appelé quand le personnage change (redéfinition, suppression). */
export function bindCharacterBanner(root: HTMLElement, onChange: () => void): void {
  root.querySelector('#open-sheet')?.addEventListener('click', () => openCharacterSheet(onChange));
  root.querySelector('#open-tranches')?.addEventListener('click', () => openTranchePicker(onChange));
}

// ---------------------------------------------------------------------------
// Choix de tranche et redéfinition
// ---------------------------------------------------------------------------

function trancheRowsHtml(c: Character): string {
  const level = characterLevel(c);
  return `<div class="tr-grid">${TRANCHES.map((t) => {
    const unlocked = level >= t.minLevel;
    const current = t.id === c.trancheId;
    const dungeons = DUNGEONS.filter((d) => d.tranche === t.id).length;
    const eff = Math.min(level, t.redefinitionLevel);
    return `
      <div class="tr-card ${current ? 'current' : ''} ${unlocked ? '' : 'locked'}">
        <div class="tr-badge">T${t.id}</div>
        <b class="tr-levels">Niv. ${t.minLevel}–${t.maxLevel}</b>
        <ul class="tr-facts">
          <li>${icon('grimoire')} Deck de ${t.deckSize} sorts</li>
          <li>${icon('sparkle')} ${t.passiveSlots} passif${t.passiveSlots > 1 ? 's' : ''}</li>
          <li>${icon('dungeons')} ${dungeons ? `${dungeons} donjon${dungeons > 1 ? 's' : ''}` : 'Aucun donjon'}</li>
        </ul>
        <small class="tr-note">${unlocked ? `Joué au niveau ${eff}` : `Débloquée au niveau ${t.minLevel}`}</small>
        ${
          current
            ? `<span class="ui-btn ui-btn--sm ui-btn--block tr-current">${icon('check')} Actuelle</span>`
            : unlocked
              ? `<button class="ui-btn ui-btn--primary ui-btn--sm ui-btn--block" data-tranche="${t.id}">Se redéfinir</button>`
              : `<span class="ui-btn ui-btn--sm ui-btn--block tr-locked">${icon('lock')} Verrouillée</span>`
        }
      </div>`;
  }).join('')}</div>`;
}

function bindTrancheButtons(root: HTMLElement, after: () => void): void {
  root.querySelectorAll<HTMLButtonElement>('[data-tranche]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = getCharacter();
      if (!c) return;
      saveCharacter(redefine(c, Number(b.dataset.tranche)));
      after();
    }),
  );
}

const TRANCHE_INTRO =
  'Redéfinissez-vous à tout moment sur une tranche débloquée. Votre niveau et votre XP ne changent pas : seuls les sorts et passifs du niveau de redéfinition comptent, et chaque tranche garde son propre deck.';

export function openTranchePicker(onChange: () => void): void {
  const c = getCharacter();
  if (!c) return;
  const panel = openPanel({
    title: 'Choisir une tranche',
    cls: 'tr-panel',
    tabs: [
      {
        id: 'tranches',
        label: 'Tranches',
        html: () => `<p class="tr-intro">${TRANCHE_INTRO}</p>${trancheRowsHtml(c)}`,
        bind: (body) =>
          bindTrancheButtons(body, () => {
            panel.close();
            onChange();
          }),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Fiche du personnage : quatre volets (profil, sorts, passifs, tranches), sans défilement.
// ---------------------------------------------------------------------------

let sheetTab = 'profile';

export function openCharacterSheet(onChange: () => void, tab = sheetTab): void {
  const c = getCharacter();
  if (!c) return;
  const level = characterLevel(c);
  const eff = characterEffectiveLevel(c);
  const t = getTranche(c.trancheId);
  const loadout = currentLoadout(c);
  const date = new Date(c.createdAt).toLocaleDateString('fr-FR');
  const eq = equipmentBonus(getInventory(), t.id);
  const stateOf = (lvl: number) => (lvl > level ? 'locked' : lvl > eff ? 'capped' : 'unlocked');
  const stateTag = (state: string, active: boolean, activeLabel: string) =>
    state === 'locked' ? `<span class="ui-chip">${icon('lock')}</span>` : state === 'capped' ? '<span class="ui-chip cs-muted">Hors tranche</span>' : active ? `<span class="ui-chip cs-on">${activeLabel}</span>` : '';

  const profile = () => `
    <div class="cs-profile">
      <section class="cs-id ui-panel">
        <div class="cs-id-head">
          <div class="char-level big"><small>Niv.</small>${level}</div>
          <div class="grow">
            <h3>${escapeHtml(c.name)}</h3>
            <div class="cs-sub">Archer · T${t.id}${eff < level ? ` · redéfini niv. ${eff}` : ''}</div>
          </div>
        </div>
        ${xpBar(c.xp)}
        <div class="cs-sub">Créé le ${date} · ${c.xp.toLocaleString('fr-FR')} XP au total${level >= MAX_LEVEL ? ' · niveau maximum' : ''}</div>
        <div class="cs-kv">
          <div><b>${c.stats.runs}</b><span>Runs</span></div>
          <div><b>${c.stats.wins}</b><span>Victoires</span></div>
          <div><b>${c.stats.kills}</b><span>Monstres</span></div>
          <div><b>${c.stats.bossKills}</b><span>Boss</span></div>
        </div>
        <button class="ui-btn ui-btn--danger ui-btn--sm cs-delete" id="delete-char">${icon('close')} Supprimer le personnage</button>
      </section>
      <section class="cs-stats ui-panel">
        <h3>Caractéristiques <small>T${t.id}, niveau ${eff}</small></h3>
        ${characterStatsHtml(eq)}
      </section>
    </div>`;

  const spells = () => `
    <div class="cs-list-wrap" data-pager-scope>
      <div class="cs-list-bar"><span>Deck de ${t.deckSize} sorts en T${t.id}</span>${pagerHtml('cs-spells')}</div>
      <div class="cs-list" data-paged="cs-spells">${SPELLS.map((s) => {
        const st = stateOf(s.level);
        return `<div class="cs-item ${st}">
          <span class="cs-icon el-theme-${s.element}">${spellIconImg(s.id)}</span>
          <div class="cs-item-body">
            <div class="cs-item-head"><b>${s.name}</b><span class="cs-lvl">Niv. ${s.level} · ${s.pa} PA</span>${stateTag(st, loadout.deck.includes(s.id), 'Deck')}</div>
            <p>${s.description}</p>
          </div>
        </div>`;
      }).join('')}</div>
    </div>`;

  const passives = () => `
    <div class="cs-list-wrap" data-pager-scope>
      <div class="cs-list-bar"><span>${loadout.passives.length} / ${t.passiveSlots} emplacement${t.passiveSlots > 1 ? 's' : ''} en T${t.id}</span>${pagerHtml('cs-passives')}</div>
      <div class="cs-list" data-paged="cs-passives">${PASSIVES.map((p) => {
        const st = stateOf(p.level);
        return `<div class="cs-item ${st}">
          <span class="cs-icon cs-icon--passive">${icon('sparkle')}</span>
          <div class="cs-item-body">
            <div class="cs-item-head"><b>${p.name}</b><span class="cs-lvl">Niv. ${p.level}</span>${stateTag(st, loadout.passives.includes(p.id), 'Équipé')}</div>
            <p>${p.description}</p>
          </div>
        </div>`;
      }).join('')}</div>
    </div>`;

  const refresh = (next: string) => {
    panel.close();
    onChange();
    openCharacterSheet(onChange, next);
  };
  const panel = openPanel({
    title: 'Fiche du personnage',
    cls: 'cs-panel',
    tab,
    onClose: () => undefined,
    tabs: [
      {
        id: 'profile',
        label: 'Profil',
        html: profile,
        bind: (body) =>
          body.querySelector('#delete-char')!.addEventListener('click', async () => {
            const ok = await confirmModal({
              title: 'Supprimer le personnage ?',
              text: `${c.name} (niveau ${level}) et toute sa progression seront définitivement perdus.`,
              confirm: 'Supprimer',
              danger: true,
            });
            if (!ok) return;
            deleteCharacter();
            panel.close();
            onChange();
          }),
      },
      { id: 'spells', label: 'Sorts', html: spells, bind: (body) => void pageAll(body) },
      { id: 'passives', label: 'Passifs', html: passives, bind: (body) => void pageAll(body) },
      {
        id: 'tranches',
        label: 'Tranches',
        html: () => `<p class="tr-intro">${TRANCHE_INTRO}</p>${trancheRowsHtml(c)}`,
        bind: (body) => bindTrancheButtons(body, () => refresh('tranches')),
      },
    ],
  });
  // Mémorise le volet ouvert pour la prochaine ouverture.
  panel.el.querySelector('[data-seg="pmodal-tab"]')?.addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]')?.dataset.value;
    if (v) sheetTab = v;
  });
}

// ---------------------------------------------------------------------------
// Écran de fin de run : XP et montée de niveau
// ---------------------------------------------------------------------------

function renderXpSection(ctx: RunEndContext): HTMLElement {
  const { summary, report } = ctx;
  const el = document.createElement('div');
  el.className = 'run-xp';
  const before = ctx.character.xp - report.xpGained;
  const killsByName = new Map<string, { n: number; xp: number }>();
  for (const k of summary.kills) {
    const e = killsByName.get(k.name) ?? { n: 0, xp: 0 };
    e.n += 1;
    e.xp += k.xp;
    killsByName.set(k.name, e);
  }
  const up = report.levelAfter > report.levelBefore;
  const unlocks = [
    ...report.unlockedSpells.map((s) => `<li><span class="el el-${s.element}"></span>Nouveau sort : <b>${s.name}</b> <span class="muted">(niv. ${s.level})</span></li>`),
    ...report.unlockedPassives.map((p) => `<li>✦ Nouveau passif : <b>${p.name}</b> <span class="muted">(niv. ${p.level})</span></li>`),
    ...report.unlockedTranches.map((t) => `<li>⬆ Nouvelle tranche : <b>T${t.id}</b> <span class="muted">(niveaux ${t.minLevel}–${t.maxLevel})</span></li>`),
  ];
  el.innerHTML = `
    <div class="xp-gain">+${report.xpGained.toLocaleString('fr-FR')} XP</div>
    ${
      summary.kills.length
        ? `<ul class="xp-detail">${[...killsByName].map(([name, e]) => `<li><span>${name} × ${e.n}</span><span>+${e.xp}</span></li>`).join('')}
           ${summary.xpVictoryBonus ? `<li class="bonus"><span>Bonus de victoire</span><span>+${summary.xpVictoryBonus}</span></li>` : ''}</ul>`
        : '<p class="muted">Aucun monstre vaincu.</p>'
    }
    <div class="xp-level"><span>Niv. <b id="xp-lvl">${report.levelBefore}</b></span>${xpBar(before, 'animated')}</div>
    ${up ? `<div class="level-up">Niveau supérieur ! ${report.levelBefore} → ${report.levelAfter}</div>` : ''}
    ${unlocks.length ? `<ul class="unlocks">${unlocks.join('')}</ul>` : ''}`;
  // Animation de la barre jusqu'à la nouvelle valeur, niveau par niveau.
  animateXp(el, before, ctx.character.xp);
  return el;
}

function animateXp(root: HTMLElement, from: number, to: number): void {
  if (to <= from) return;
  const start = performance.now();
  const duration = Math.min(2200, 700 + (to - from) / 2);
  const step = () => {
    const bar = root.querySelector('.xpbar');
    const lvl = root.querySelector('#xp-lvl');
    if (!root.isConnected || !bar || !lvl) return;
    const t = Math.min(1, (performance.now() - start) / duration);
    const xp = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    bar.outerHTML = xpBar(xp, 'animated');
    lvl.textContent = String(levelProgress(xp).level);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

registerRunEndSection({ id: 'xp', order: 0, render: renderXpSection });
