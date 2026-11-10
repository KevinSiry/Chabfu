import {
  difficultyMultiplier,
  DUNGEONS,
  PASSIVES,
  SPELLS,
  applyRunSummary,
  characterEffectiveLevel,
  characterRunConfig,
  currentLoadout,
  setLoadout,
  summarizeRun,
  MAX_DIFFICULTY,
  compareScores,
  createRun,
  getMonster,
  getTranche,
  verifyRun,
  type DungeonDef,
  type RunConfig,
  type RunScore,
  type RunState,
} from '@chabfu/engine';
import { renderEquipmentScreen } from './stuff/equipment-screen';
import { bindLootPanel, lootPanelHtml } from './stuff/loot-panel';
import { withEquipment } from './stuff/store';
import { rewardsPanelHtml } from './craft/rewards-panel';
import { grantRunRewards } from './craft/store';
import { renderWorkshopScreen } from './craft/workshop-screen';
import { formatTime, leaveRun, startRun as startCombat } from './combat';
import { ELEMENT_LABEL, rangeLabel } from './info';
import { spellSheet } from './spell-info';
import { slotKeyLabel, slotKeysRange } from './keys';
import { assetUrl, dungeonBannerImg, spellIconImg } from './ui/assets';
import './ui/lobby.css';
import { bindHubTabs, hubBarHtml, type HubTab } from './ui/hub';
import { renderRunEndSections } from './character/run-end';
import { getCharacter, saveCharacter } from './character/store';
import { bindCharacterBanner, renderCharacterCreation } from './character/ui';
// Habillage « Verre nocturne » (actif par html[data-skin="nuit"]), jetons dans ui/tokens.css.
import './ui/legacy.css';
import './ui/skin-ng.css';
import './ui/components.css';
import { openSheet, trackInputMode } from './ui/components';
import { applySettings } from './ui/settings';
import { elementIcon, icon } from './ui/icons';


const app = document.getElementById('app')!;
const STORAGE_KEY = 'chabfu.v1';

// ---------------------------------------------------------------------------
// Sauvegarde locale (deck, difficulté, meilleurs scores)
// ---------------------------------------------------------------------------

interface SavedScore extends RunScore {
  date: string;
  deck: string[];
}
interface Save {
  /** Ancien deck unique, remplacé par le deck de chaque tranche du personnage. */
  deck: string[];
  difficulty: number;
  /** Dernier donjon choisi. */
  dungeonId?: string;
  scores: SavedScore[];
}

function loadSave(): Save {
  const fallback: Save = { dungeonId: DUNGEONS[0].id, deck: ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'fleche_givree', 'tir_concentre'], difficulty: 1, scores: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function writeSave(save: Save): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    /* stockage indisponible : on continue sans */
  }
}

let save = loadSave();

let tab: 'dungeons' | 'grimoire' = 'dungeons';

function dungeonListHtml(dungeons: DungeonDef[], selected: DungeonDef | undefined): string {
  return `
    <div class="dungeon-list">
      ${dungeons
        .map((d) => {
          const best = save.scores.filter((s) => s.dungeonId === d.id).sort(compareScores)[0];
          const boss = d.rooms[d.rooms.length - 1].monsters.map((m) => getMonster(m.templateId)).find((m) => m.isBoss);
          return `
        <button class="dungeon-card el-theme-${d.dominantElement}${d.id === selected?.id ? ' selected' : ''}" data-dungeon="${d.id}">
          <div class="dungeon-art"><span class="dungeon-sigil">${ELEMENT_SIGIL[d.dominantElement]}</span>${dungeonBannerImg(d.id)}</div>
          <div class="dungeon-body">
            <div class="head">${d.name}</div>
            <div class="meta"><span class="el el-${d.dominantElement}"></span>${ELEMENT_LABEL[d.dominantElement]} · craint ${ELEMENT_LABEL[d.weakElement]} <span class="el el-${d.weakElement}"></span></div>
            <div class="meta">${d.rooms.length - 1} salle${d.rooms.length > 2 ? 's' : ''} + ${boss?.name ?? 'boss'}</div>
            <div class="record ${best ? 'done' : ''}">${best ? `${icon('trophy')} Diff. ${best.difficulty} · ${best.turns} tours` : 'Pas encore terminé'}</div>
          </div>
        </button>`;
        })
        .join('')}
    </div>`;
}

const ELEMENT_SIGIL: Record<string, string> = { fire: elementIcon('fire'), water: elementIcon('water'), earth: elementIcon('earth'), air: elementIcon('air'), neutral: elementIcon('neutral') };

// ---------------------------------------------------------------------------
// Hub (personnage, donjons, grimoire)
// ---------------------------------------------------------------------------

function goTab(t: HubTab): void {
  if (t === 'equipment') openEquipment();
  else if (t === 'workshop') openWorkshop();
  else {
    tab = t;
    renderSetup();
  }
}

/** Onglet affiché, pour revenir au même écran après un changement de tranche ou de personnage. */
let currentTab: HubTab = 'dungeons';

/**
 * Coquille commune des écrans hors combat : barre de navigation fixe et zone d'écran.
 * Les écrans (et leurs re-rendus internes) n'écrivent que dans la zone renvoyée,
 * si bien que la barre ne disparaît jamais.
 */
function hubShell(active: HubTab): HTMLElement | null {
  const c = getCharacter();
  if (!c) return null;
  // Petite transition seulement quand on change d'écran, pas à chaque re-rendu du même onglet.
  const entering = active !== currentTab || !app.classList.contains('has-hub');
  currentTab = active;
  app.innerHTML = `${hubBarHtml(active, c)}<main class="hub-screen${entering ? ' entering' : ''}" id="hub-screen"></main>`;
  app.classList.add('has-hub');
  bindHubTabs(app, goTab);
  bindCharacterBanner(app, refreshCurrent);
  window.scrollTo(0, 0);
  return app.querySelector<HTMLElement>('#hub-screen');
}

function refreshCurrent(): void {
  if (!getCharacter()) renderSetup();
  else goTab(currentTab);
}

function renderSetup(): void {
  app.classList.remove('has-hub');
  const character = getCharacter();
  if (!character) {
    renderCharacterCreation(app, () => {
      tab = 'dungeons';
      renderSetup();
    });
    return;
  }
  const tranche = getTranche(character.trancheId);
  const effLevel = characterEffectiveLevel(character);
  const dungeons = DUNGEONS.filter((d) => d.tranche === tranche.id);
  const dungeon = dungeons.find((d) => d.id === save.dungeonId) ?? dungeons[0];
  const spells = SPELLS.filter((s) => s.level <= tranche.redefinitionLevel);
  const passives = PASSIVES.filter((p) => p.level <= tranche.redefinitionLevel);
  const loadout = currentLoadout(character);
  const best = dungeon ? save.scores.filter((s) => s.dungeonId === dungeon.id).sort(compareScores).slice(0, 8) : [];
  const boss = dungeon?.rooms[dungeon.rooms.length - 1].monsters.map((m) => getMonster(m.templateId)).find((m) => m.isBoss);

  const deckStrip = `
    <div class="deck-strip">
      ${Array.from({ length: tranche.deckSize }, (_, i) => {
        const s = loadout.deck[i] ? SPELLS.find((x) => x.id === loadout.deck[i]) : undefined;
        return s
          ? `<div class="deck-slot el-theme-${s.element}" title="${s.name}">${spellIconImg(s.id)}<kbd>${slotKeyLabel(i)}</kbd><span>${s.name}</span></div>`
          : `<div class="deck-slot empty"><kbd>${slotKeyLabel(i)}</kbd><span>Libre</span></div>`;
      }).join('')}
    </div>`;

  const di = dungeon ? dungeons.indexOf(dungeon) : -1;
  const prev = di > 0 ? dungeons[di - 1] : undefined;
  const next = di >= 0 && di < dungeons.length - 1 ? dungeons[di + 1] : undefined;
  const record = dungeon ? best[0] : undefined;
  const multLabel = (d: number) => `Monstres : PV, dégâts et XP ×${difficultyMultiplier(d).toFixed(2).replace('.', ',')}`;
  const dungeonsTab = dungeon
    ? `
    <div class="lobby">
      <section class="lb-stage">
        <article class="lb-dungeon el-theme-${dungeon.dominantElement}">
          <div class="lb-art">${dungeonBannerImg(dungeon.id)}
            ${boss ? `<img class="lb-boss" src="${assetUrl(`units/${boss.id}.png`)}" alt="" draggable="false">` : ''}
            <span class="lb-ribbon">${record ? `${icon('trophy')} Record : diff. ${record.difficulty} · ${record.turns} tours` : 'Pas encore terminé'}</span>
            ${prev ? `<button class="ui-icon-btn lb-nav prev" data-dungeon="${prev.id}" aria-label="Donjon précédent : ${prev.name}">${icon('back')}</button>` : ''}
            ${next ? `<button class="ui-icon-btn lb-nav next" data-dungeon="${next.id}" aria-label="Donjon suivant : ${next.name}">${icon('chevronRight')}</button>` : ''}
          </div>
          <div class="lb-body">
            <h2 class="lb-name">${dungeon.name}</h2>
            <div class="lb-tags">
              <span class="ui-chip">${elementIcon(dungeon.dominantElement)} ${ELEMENT_LABEL[dungeon.dominantElement]}</span>
              <span class="ui-chip lb-weak">Craint ${elementIcon(dungeon.weakElement)} ${ELEMENT_LABEL[dungeon.weakElement]}</span>
            </div>
            <div class="lb-rooms">
              ${dungeon.rooms
                .map((r, i) => {
                  const isBoss = i === dungeon.rooms.length - 1;
                  return `<span class="lb-room ${isBoss ? 'boss' : ''}" title="${r.name} · ${r.monsters.length} monstre${r.monsters.length > 1 ? 's' : ''}">${isBoss ? icon('skull') : i + 1}</span>`;
                })
                .join('<i></i>')}
              <small>${boss ? `Boss : ${boss.name}` : ''}</small>
            </div>
          </div>
        </article>
        <div class="lb-dots">${dungeons.map((d) => `<button class="${d.id === dungeon.id ? 'on' : ''}" data-dungeon="${d.id}" aria-label="${d.name}"></button>`).join('')}</div>
      </section>
      <section class="lb-side">
        <div class="ui-panel lb-panel">
          <div class="lb-panel-head">Difficulté <b id="diff-v">${save.difficulty}</b></div>
          <div class="lb-steps" role="radiogroup" aria-label="Difficulté">
            ${Array.from({ length: MAX_DIFFICULTY }, (_, i) => i + 1)
              .map((d) => `<button role="radio" aria-checked="${d === save.difficulty}" class="${d === save.difficulty ? 'on' : ''} ${record && d <= record.difficulty ? 'done' : ''}" data-diff="${d}">${d}</button>`)
              .join('')}
          </div>
          <p class="lb-note" id="diff-mult">${multLabel(save.difficulty)}</p>
        </div>
        <div class="ui-panel lb-panel lb-deck-panel">
          <div class="lb-deck">
            ${Array.from({ length: tranche.deckSize }, (_, i) => {
              const sp = loadout.deck[i] ? SPELLS.find((x) => x.id === loadout.deck[i]) : undefined;
              return sp
                ? `<div class="lb-card" title="${sp.name}">${spellIconImg(sp.id)}<span class="lb-cost">${sp.pa}</span></div>`
                : `<div class="lb-card empty"></div>`;
            }).join('')}
          </div>
          <div class="lb-deck-actions">
            <button class="ui-btn ui-btn--blue ui-btn--sm" id="edit-deck">${icon('grimoire')} Grimoire</button>
            <button class="ui-btn ui-btn--blue ui-btn--sm" id="open-equipment">${icon('equipment')} Équipement </button>
          </div>
        </div>
        <button class="ui-btn ui-btn--primary ui-btn--xl lb-go" id="start">Combattre</button>
        <p class="lb-error" id="deck-error"></p>
      </section>
    </div>`
    : `<div class="ui-empty"><b>Aucun donjon</b><p>La tranche T${tranche.id} n’a pas encore de donjon. Redéfinissez-vous sur une tranche inférieure pour jouer.</p></div>`;

  const inDeck = new Set(loadout.deck);
  const grimoireTab = `
    <div class="gr">
      <section class="ui-panel gr-deck-panel">
        <div class="gr-head"><span>Deck</span> <b id="deck-count"></b></div>
        <div class="gr-deck">
          ${Array.from({ length: tranche.deckSize }, (_, i) => {
            const sp = loadout.deck[i] ? SPELLS.find((x) => x.id === loadout.deck[i]) : undefined;
            return sp
              ? `<button class="lb-card gr-slot" data-open="${sp.id}" aria-label="${sp.name}">${spellIconImg(sp.id)}<span class="lb-cost">${sp.pa}</span></button>`
              : `<div class="lb-card empty"></div>`;
          }).join('')}
        </div>
        <button class="ui-btn ui-btn--primary ui-btn--lg gr-go" id="start">Combattre</button>
        <p class="lb-error" id="deck-error"></p>
      </section>
      <section class="gr-section">
        <div class="gr-title">Sorts <small>Touchez une carte pour la voir en détail et l’ajouter au deck.</small></div>
        <div class="gr-grid">
          ${spells
            .map((sp) => {
              const locked = sp.level > effLevel;
              return `
            <button class="gr-card el-theme-${sp.element} ${locked ? 'locked' : ''} ${inDeck.has(sp.id) ? 'in' : ''}" data-open="${sp.id}">
              <span class="gr-art">${spellIconImg(sp.id)}${locked ? `<span class="gr-lock">${icon('lock')}<b>Niv. ${sp.level}</b></span>` : `<span class="lb-cost">${sp.pa}</span>`}${inDeck.has(sp.id) ? `<span class="gr-check">${icon('check')}</span>` : ''}</span>
              <span class="gr-name">${sp.name}</span>
            </button>`;
            })
            .join('')}
        </div>
      </section>
      <section class="gr-section">
        <div class="gr-title">Passifs <b id="passive-count"></b></div>
        <div class="gr-passives">
          ${passives
            .map((pa) => {
              const locked = pa.level > effLevel;
              return `
            <button class="passive-card gr-passive ${locked ? 'locked' : ''}" data-passive="${pa.id}" ${locked ? 'disabled' : ''}>
              <span class="gr-passive-head"><b>${pa.name}</b><span class="ui-chip">${locked ? icon('lock') + ' ' : ''}Niv. ${pa.level}</span></span>
              <span class="gr-passive-desc">${pa.description}</span>
            </button>`;
            })
            .join('')}
        </div>
      </section>
    </div>`;

  const keepScroll = currentTab === tab && app.classList.contains('has-hub') ? window.scrollY : 0;
  const screen = hubShell(tab)!;
  const header =
    '';
  screen.innerHTML = `<div class="setup hub">${header}${tab === 'dungeons' ? dungeonsTab : grimoireTab}</div>
    <div class="spell-tip grimoire-tip" id="grimoire-tip" hidden></div>`;
  // Le grimoire se redessine à chaque clic : on garde la position de défilement.
  window.scrollTo(0, keepScroll);
  const deck = new Set(loadout.deck);
  const chosenPassives = new Set(loadout.passives);
  const persist = () => {
    // Ordre du deck = ordre du catalogue, pour des raccourcis stables.
    const c = getCharacter();
    if (!c) return;
    saveCharacter(
      setLoadout(c, {
        deck: spells.map((s) => s.id).filter((id) => deck.has(id)),
        passives: passives.map((p) => p.id).filter((id) => chosenPassives.has(id)),
      }),
    );
  };
  const refresh = () => {
    app.querySelectorAll<HTMLButtonElement>('.passive-card').forEach((b) => b.classList.toggle('selected', chosenPassives.has(b.dataset.passive!)));
    const dc = app.querySelector('#deck-count');
    if (dc) dc.textContent = `${deck.size} / ${tranche.deckSize}`;
    const pc = app.querySelector('#passive-count');
    if (pc) pc.textContent = `${chosenPassives.size} / ${tranche.passiveSlots}`;
    (app.querySelector('#start') as HTMLButtonElement).disabled = deck.size === 0 || !dungeon;
  };
  // Le grimoire redessine l'écran pour mettre à jour la barre de sorts.
  const rerender = () => renderSetup();
  app.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.open!;
      const sp = SPELLS.find((x) => x.id === id)!;
      const locked = sp.level > effLevel;
      const has = deck.has(id);
      const full = deck.size >= tranche.deckSize;
      const st = dungeon ? grimoireState(characterRunConfig(character, dungeon.id, save.difficulty), loadout.deck) : null;
      const action = locked
        ? `<button class="ui-btn ui-btn--block" disabled>${icon('lock')} Débloqué au niveau ${sp.level}</button>`
        : has
          ? `<button class="ui-btn ui-btn--danger ui-btn--block" id="gr-toggle">Retirer du deck</button>`
          : `<button class="ui-btn ui-btn--primary ui-btn--block" id="gr-toggle" ${full ? 'disabled' : ''}>${full ? `Deck plein (${tranche.deckSize} sorts)` : 'Ajouter au deck'}</button>`;
      const sheet = openSheet({
        title: 'Fiche du sort',
        html: `<div class="gr-sheet">${st ? spellSheet(st, id, { outOfCombat: true }) : `<p>${sp.description}</p>`}</div><div class="gr-sheet-action">${action}</div>`,
      });
      sheet.el.querySelector('#gr-toggle')?.addEventListener('click', () => {
        if (deck.has(id)) deck.delete(id);
        else if (deck.size < tranche.deckSize) deck.add(id);
        persist();
        sheet.close();
        rerender();
      });
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('.passive-card').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.passive!;
      if (chosenPassives.has(id)) chosenPassives.delete(id);
      else if (tranche.passiveSlots === 1) {
        chosenPassives.clear();
        chosenPassives.add(id);
      } else if (chosenPassives.size < tranche.passiveSlots) chosenPassives.add(id);
      persist();
      rerender();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-dungeon]').forEach((b) =>
    b.addEventListener('click', () => {
      save.dungeonId = b.dataset.dungeon;
      writeSave(save);
      renderSetup();
    }),
  );
  const keepDifficulty = () => writeSave(save);
  app.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
    b.addEventListener('click', () => {
      save.difficulty = Number(b.dataset.diff);
      keepDifficulty();
      app.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((x) => {
        const on = x === b;
        x.classList.toggle('on', on);
        x.setAttribute('aria-checked', String(on));
      });
      app.querySelector('#diff-v')!.textContent = String(save.difficulty);
      const mult = app.querySelector('#diff-mult');
      if (mult) mult.textContent = multLabel(save.difficulty);
    }),
  );
  app.querySelector('#edit-deck')?.addEventListener('click', () => goTab('grimoire'));
  app.querySelector('#open-equipment')?.addEventListener('click', () => {
    keepDifficulty();
    openEquipment();
  });
  app.querySelector('#start')!.addEventListener('click', () => {
    const c = getCharacter();
    if (!c || !dungeon) return;
    persist();
    keepDifficulty();
    save.dungeonId = dungeon.id;
    writeSave(save);
    try {
      startRun(characterRunConfig(getCharacter()!, dungeon.id, save.difficulty));
    } catch (e) {
      app.querySelector('#deck-error')!.textContent = (e as Error).message;
    }
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/** Run fictif du donjon choisi, pour afficher les chiffres réels des sorts (équipement, passifs) hors combat. */
function grimoireState(baseConfig: RunConfig, deck: string[]): RunState | null {
  try {
    const config = withEquipment(baseConfig);
    const state = createRun(config.deck.length ? config : { ...config, deck: [SPELLS[0].id] });
    state.player.deck = [...deck];
    return state;
  } catch {
    return null;
  }
}

function openEquipment(): void {
  const trancheId = getCharacter()?.trancheId ?? 1;
  const dungeons = DUNGEONS.filter((d) => d.tranche === trancheId);
  const dungeon = dungeons.find((d) => d.id === save.dungeonId) ?? dungeons[0] ?? DUNGEONS[0];
  const screen = hubShell('equipment');
  if (!screen) return renderSetup();
  renderEquipmentScreen(screen, { trancheId, dungeonId: dungeon.id, difficulty: save.difficulty, onBack: renderSetup });
}

function openWorkshop(): void {
  const trancheId = getCharacter()?.trancheId ?? 1;
  const dungeons = DUNGEONS.filter((d) => d.tranche === trancheId);
  const dungeon = dungeons.find((d) => d.id === save.dungeonId) ?? dungeons[0] ?? DUNGEONS[0];
  const screen = hubShell('workshop');
  if (!screen) return renderSetup();
  renderWorkshopScreen(screen, { trancheId, dungeonId: dungeon.id, onBack: renderSetup });
}

function startRun(baseConfig: RunConfig): void {
  // L'équipement porté au lancement fait partie de la config : le replay le rejoue à l'identique.
  const config = withEquipment(baseConfig);
  startCombat(config, createRun(config), {
    onExit: renderSetup,
    // Fin du run, ou abandon après au moins une action (l'XP des monstres vaincus est gagnée).
    onFinish: finishRun,
  });
}

// ---------------------------------------------------------------------------
// Fin de run
// ---------------------------------------------------------------------------

function finishRun(config: RunConfig, state: RunState, timeMs: number): void {
  const v = { config, state };
  const won = v.state.status === 'won';
  const abandoned = v.state.status === 'playing';
  // Même vérification que celle que fera le serveur : on rejoue la suite d'actions.
  const check = won ? verifyRun(v.config, v.state.actionLog, v.state.turn) : null;
  if (won && check?.valid) {
    save.scores.push({ dungeonId: v.config.dungeonId, difficulty: v.config.difficulty, turns: v.state.turn, timeMs, date: new Date().toISOString(), deck: v.config.deck });
    save.scores = save.scores.sort(compareScores).slice(0, 50);
    writeSave(save);
  }
  // Butin : uniquement pour une victoire au replay validé.
  // Recyclage automatique et ressources du donjon : voir craft/store.ts.
  const rewards = won && check?.valid ? grantRunRewards(v.config, v.state.actionLog) : null;
  const loot = rewards?.kept ?? [];
  // XP et montée de niveau : recalculées en rejouant le run, comme le fera le serveur.
  const summary = summarizeRun(v.config, v.state.actionLog);
  const before = getCharacter();
  let sections: HTMLElement[] = [];
  if (before) {
    const { character, report } = applyRunSummary(before, summary);
    saveCharacter(character);
    sections = renderRunEndSections({ config: v.config, state: v.state, summary, report, character, validated: !!check?.valid });
  }
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="card${rewards ? ' with-loot' : ''}">
      <div class="end-banner ${won ? 'ok' : 'ko'}"><h2>${won ? 'Victoire !' : abandoned ? 'Run abandonné' : 'Défaite'}</h2></div>
      <div class="end-stats"><span>Difficulté ${v.config.difficulty}</span><span>${v.state.turn} tours</span><span>${icon('clock')} ${formatTime(timeMs)}</span></div>
      ${check ? `<p class="${check.valid ? 'ok' : 'ko'}">${check.valid ? `${icon('check')} Score vérifié` : `${icon('cross')} Score non vérifié : ${check.reason}`}</p>` : `<p class="muted">Salle ${v.state.roomIndex + 1} atteinte.</p>`}
      ${loot.length ? lootPanelHtml(loot, v.config) : ''}
      ${rewards ? rewardsPanelHtml(rewards) : ''}
      <div class="row">
        <button class="primary" id="again">Rejouer</button>
        <button class="secondary" id="equipment">Équipement</button>
        <button class="secondary" id="workshop">Atelier</button>
        <button class="secondary" id="back">Préparation</button>
        <button class="secondary" id="copy">Copier le replay</button>
      </div>
    </div>`;
  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'end-sections';
  sections.forEach((el) => sectionsEl.appendChild(el));
  // XP d'abord, puis le butin du boss.
  overlay.querySelector('.card')!.insertBefore(sectionsEl, overlay.querySelector('.loot') ?? overlay.querySelector('.rewards') ?? overlay.querySelector('.row'));
  document.body.appendChild(overlay);
  overlay.querySelector('#again')!.addEventListener('click', () => {
    overlay.remove();
    // Le personnage a pu gagner des niveaux : on reprend sa configuration à jour (même deck, même donjon).
    const c = getCharacter();
    startRun(c ? characterRunConfig(c, v.config.dungeonId, v.config.difficulty) : v.config);
  });
  bindLootPanel(overlay, loot, v.config);
  overlay.querySelector('#equipment')!.addEventListener('click', () => {
    overlay.remove();
    leaveRun();
    openEquipment();
  });
  overlay.querySelector('#workshop')!.addEventListener('click', () => {
    overlay.remove();
    leaveRun();
    openWorkshop();
  });
  overlay.querySelector('#back')!.addEventListener('click', () => {
    overlay.remove();
    leaveRun();
    renderSetup();
  });
  overlay.querySelector('#copy')!.addEventListener('click', async () => {
    const payload = JSON.stringify({ config: v.config, actions: v.state.actionLog, turns: v.state.turn });
    try {
      await navigator.clipboard.writeText(payload);
      (overlay.querySelector('#copy') as HTMLButtonElement).innerHTML = `Copié ${icon('check')}`;
    } catch {
      console.log(payload);
    }
  });
}

// Échap ferme la fenêtre ouverte (fiche, tranches…), sauf l'écran de fin de run qui attend un choix.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const overlays = document.querySelectorAll<HTMLElement>('.overlay');
  const top = overlays[overlays.length - 1];
  if (top && top.querySelector('[data-close]')) top.remove();
});

applySettings();
trackInputMode();
if (new URLSearchParams(location.search).get('dev') === 'da') {
  void import('./ui/da-mock').then((m) => m.renderDaMock(app));
} else if (new URLSearchParams(location.search).get('dev') === 'ui') {
  void import('./ui/gallery').then((m) => m.renderGallery(app));
} else {
  renderSetup();
}
