import {
  BASE_PA,
  BASE_PM,
  MAX_CONCENTRATION,
  MAX_LEVEL,
  PASSIVES,
  PLAYER_HP,
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
import { registerRunEndSection, type RunEndContext } from './run-end';
import { getInventory } from '../stuff/store';
import { deleteCharacter, getCharacter, saveCharacter } from './store';

const ELEMENT_LABEL: Record<Element, string> = { fire: 'Feu', water: 'Eau', earth: 'Terre', air: 'Air', neutral: 'Neutre' };

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
    <div class="setup">
      <header><h1>Chabfu</h1><p>Nouveau personnage</p></header>
      <div class="card create-card">
        <h2>Votre Archer</h2>
        <p class="muted">Votre personnage gagne de l’XP à chaque run, débloque des sorts, des passifs et de nouvelles tranches.
        Il peut ensuite se redéfinir sur une tranche inférieure pour y rejouer avec exactement les options d’un niveau de redéfinition.</p>
        <form id="create-form">
          <label for="char-name">Nom</label>
          <input id="char-name" maxlength="20" autocomplete="off" placeholder="Nom de l’Archer" required />
          <button class="primary" type="submit">Créer le personnage</button>
        </form>
        <p class="muted">Niveau 1 · Sorts de départ : Flèche ardente et Bond arrière.</p>
      </div>
    </div>`;
  const input = app.querySelector('#char-name') as HTMLInputElement;
  input.focus();
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
  return TRANCHES.map((t) => {
    const unlocked = level >= t.minLevel;
    const current = t.id === c.trancheId;
    const dungeons = DUNGEONS.filter((d) => d.tranche === t.id).length;
    const eff = Math.min(level, t.redefinitionLevel);
    return `
      <div class="tranche-row ${current ? 'current' : ''} ${unlocked ? '' : 'locked'}">
        <div class="tranche-name">T${t.id}</div>
        <div class="tranche-info">
          <b>Niveaux ${t.minLevel}–${t.maxLevel}</b>
          <div class="muted">Deck ${t.deckSize} sorts · ${t.passiveSlots} passif${t.passiveSlots > 1 ? 's' : ''} · ${dungeons ? `${dungeons} donjon${dungeons > 1 ? 's' : ''}` : 'aucun donjon pour l’instant'}</div>
          <div class="muted">${unlocked ? `Vous y jouez au niveau ${eff}.` : `Débloquée au niveau ${t.minLevel}.`}</div>
        </div>
        <div>${current ? '<span class="tag">Actuelle</span>' : unlocked ? `<button class="primary small" data-tranche="${t.id}">Se redéfinir</button>` : '<span class="tag muted">🔒</span>'}</div>
      </div>`;
  }).join('');
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

function openOverlay(html: string, cls = ''): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="card ${cls}">${html}</div>`;
  overlay.addEventListener('click', (e) => e.target === overlay && overlay.remove());
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => overlay.remove()));
  return overlay;
}

export function openTranchePicker(onChange: () => void): void {
  const c = getCharacter();
  if (!c) return;
  const overlay = openOverlay(
    `<h2>Choisir une tranche</h2>
     <p class="muted">Vous pouvez vous redéfinir à tout moment sur une tranche débloquée. Votre niveau réel et votre XP ne changent pas :
     seuls les sorts et passifs du niveau de redéfinition sont utilisables, et chaque tranche garde son propre deck.</p>
     <div class="tranches">${trancheRowsHtml(c)}</div>
     <div class="row"><button class="secondary" data-close>Fermer</button></div>`,
    'sheet',
  );
  bindTrancheButtons(overlay, () => {
    overlay.remove();
    onChange();
  });
}

// ---------------------------------------------------------------------------
// Fiche du personnage
// ---------------------------------------------------------------------------

export function openCharacterSheet(onChange: () => void): void {
  const c = getCharacter();
  if (!c) return;
  const level = characterLevel(c);
  const eff = characterEffectiveLevel(c);
  const t = getTranche(c.trancheId);
  const loadout = currentLoadout(c);
  const date = new Date(c.createdAt).toLocaleDateString('fr-FR');
  const eq = equipmentBonus(getInventory(), t.id);
  const plus = (n: number) => (n ? `<small> (+${n})</small>` : '');

  const spellRows = SPELLS.map((s) => {
    const state = s.level > level ? 'locked' : s.level > eff ? 'capped' : 'unlocked';
    return `<tr class="${state}">
      <td>${s.level}</td>
      <td><span class="el el-${s.element}"></span>${s.name}</td>
      <td>${s.pa} PA</td>
      <td class="muted">${s.description}</td>
      <td>${state === 'locked' ? '🔒' : state === 'capped' ? '<span class="muted">hors tranche</span>' : loadout.deck.includes(s.id) ? '<span class="tag">Deck</span>' : ''}</td>
    </tr>`;
  }).join('');

  const passiveRows = PASSIVES.map((p) => {
    const state = p.level > level ? 'locked' : p.level > eff ? 'capped' : 'unlocked';
    return `<tr class="${state}">
      <td>${p.level}</td>
      <td>${p.name}</td>
      <td class="muted">${p.description}</td>
      <td>${state === 'locked' ? '🔒' : state === 'capped' ? '<span class="muted">hors tranche</span>' : loadout.passives.includes(p.id) ? '<span class="tag">Équipé</span>' : ''}</td>
    </tr>`;
  }).join('');

  const slots = Array.from({ length: t.passiveSlots }, (_, i) => {
    const id = loadout.passives[i];
    const p = id ? PASSIVES.find((x) => x.id === id) : undefined;
    return `<div class="slot ${p ? 'filled' : ''}">${p ? p.name : 'Emplacement libre'}</div>`;
  }).join('');

  const overlay = openOverlay(
    `<div class="sheet-head">
       <div class="char-level big"><small>Niv.</small>${level}</div>
       <div class="grow">
         <h2>${escapeHtml(c.name)}</h2>
         <div class="muted">Archer · créé le ${date} · ${c.xp.toLocaleString('fr-FR')} XP au total${level >= MAX_LEVEL ? ' · niveau maximum' : ''}</div>
         ${xpBar(c.xp)}
       </div>
     </div>

     <div class="sheet-grid">
       <section>
         <h3>Caractéristiques <span class="muted">(T${t.id}, niveau ${eff})</span></h3>
         <div class="stats sheet-stats">
           <div class="stat" style="color:var(--hp)"><b>${PLAYER_HP + eq.hp}${plus(eq.hp)}</b>PV</div>
           <div class="stat" style="color:var(--pa)"><b>${BASE_PA + eq.pa}${plus(eq.pa)}</b>PA</div>
           <div class="stat" style="color:var(--pm)"><b>${BASE_PM + eq.pm}${plus(eq.pm)}</b>PM</div>
           <div class="stat" style="color:var(--conc)"><b>${MAX_CONCENTRATION}</b>Conc. max</div>
         </div>
         <div class="masteries">
           ${(['fire', 'water', 'earth', 'air'] as Element[]).map((e) => `<div><span class="el el-${e}"></span>Maîtrise ${ELEMENT_LABEL[e]} <b>${eq.masteries[e] ?? 0} %</b></div>`).join('')}
         </div>
         <p class="muted">Base de l’Archer + équipement porté en T${t.id}.</p>
       </section>
       <section>
         <h3>Statistiques</h3>
         <div class="kv"><span>Runs joués</span><b>${c.stats.runs}</b></div>
         <div class="kv"><span>Donjons terminés</span><b>${c.stats.wins}</b></div>
         <div class="kv"><span>Monstres vaincus</span><b>${c.stats.kills}</b></div>
         <div class="kv"><span>Boss vaincus</span><b>${c.stats.bossKills}</b></div>
       </section>
     </div>

     <section>
       <h3>Passifs <span class="muted">${loadout.passives.length} / ${t.passiveSlots} emplacement${t.passiveSlots > 1 ? 's' : ''} en T${t.id}</span></h3>
       <div class="slots">${slots}</div>
       <table class="sheet-table">${passiveRows}</table>
     </section>

     <section>
       <h3>Sorts <span class="muted">deck de ${t.deckSize} en T${t.id}</span></h3>
       <table class="sheet-table">${spellRows}</table>
     </section>

     <section>
       <h3>Tranches et redéfinition</h3>
       <div class="tranches">${trancheRowsHtml(c)}</div>
     </section>

     <div class="row">
       <button class="primary" data-close>Fermer</button>
       <button class="secondary danger" id="delete-char">Supprimer le personnage</button>
     </div>`,
    'sheet',
  );
  bindTrancheButtons(overlay, () => {
    overlay.remove();
    onChange();
    openCharacterSheet(onChange);
  });
  overlay.querySelector('#delete-char')!.addEventListener('click', () => {
    if (!confirm(`Supprimer définitivement ${c.name} (niveau ${level}) ? Toute sa progression sera perdue.`)) return;
    deleteCharacter();
    overlay.remove();
    onChange();
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
