import {
  applyAction,
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
  type RunSummary,
  type ItemInstance,
  dungeonResources,
} from '@chabfu/engine';
import { renderEquipmentScreen } from './stuff/equipment-screen';
import { bindLootPanel, lootPanelHtml } from './stuff/loot-panel';
import { getInventory, withEquipment } from './stuff/store';
import { challengeEndRow } from './challenge-ui';
import { rewardsPanelHtml } from './craft/rewards-panel';
import { grantRunRewards, type RunRewards } from './craft/store';
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
import { coachTour, type CoachStep } from './ui/coach';
import './ui/onboarding.css';
import { bindSegmented, openSheet, segmented, trackInputMode } from './ui/components';
import { pageAll, pagerHtml } from './ui/pager';
import './ui/fit.css';
import { sfx, unlockAudio } from './ui/sfx';
import { applySettings } from './ui/settings';
import { elementIcon, icon } from './ui/icons';
import { grimoireTableHtml, spellGlyph } from './ui/grimoire';
import './ui/grimoire.css';


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
/** Volet du grimoire : sorts ou passifs. */
let grTab: 'spells' | 'passives' = 'spells';

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
  setTimeout(() => hubTips(active), 450);
  return app.querySelector<HTMLElement>('#hub-screen');
}

/** Première visite de chaque écran : courte visite guidée (une seule fois, coupée par « Passer »). */
function hubTips(tab: HubTab): void {
  if (currentTab !== tab || !app.classList.contains('has-hub') || document.querySelector('.ui-sheet.is-open, .overlay, .end-ov')) return;
  const tours: Record<HubTab, CoachStep[]> = {
    dungeons: [
      { target: '.lb-dungeon', title: 'Choisissez un donjon', text: 'Chaque donjon enchaîne plusieurs salles de monstres, puis un boss. Les flèches font défiler les donjons de votre tranche.' },
      { target: '.lb-steps', title: 'Difficulté', text: 'Plus la difficulté monte, plus les monstres sont résistants… et plus ils rapportent d’XP et de butin.' },
      { target: '.lb-deck-panel', title: 'Votre deck', text: 'Les sorts que vous emportez au combat. Touchez-les pour les changer dans le Grimoire ; votre stuff se règle dans l’Équipement.' },
      { target: '#start', title: 'À l’attaque !', text: 'Lancez le run. Un petit guide vous attend dans le premier combat.' },
    ],
    grimoire: [{ target: '.grt', title: 'Le Grimoire', text: 'Une rangée par élément, chacun avec son style de jeu. Touchez un sort pour lire sa fiche et l’ajouter à votre deck ou l’en retirer. De nouveaux sorts arrivent avec les niveaux.' }],
    equipment: [{ target: '.eq-doll', title: 'Équipement', text: 'Touchez un objet pour voir ses stats et l’équiper. La flèche verte signale un objet meilleur que celui porté.' }],
    workshop: [{ target: '[data-seg="ws-mode"]', title: 'L’Atelier', text: 'Fabriquez des objets avec les ressources des donjons, ou recyclez le butin en trop contre des éclats.' }],
  };
  if (document.querySelector(tours[tab][0].target as string)) void coachTour(`hub-${tab}`, tours[tab]);
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
          <div class="lb-deck" id="lb-deck" role="button" tabindex="0" aria-label="Deck : ouvrir le Grimoire">
            ${Array.from({ length: tranche.deckSize }, (_, i) => {
              const sp = loadout.deck[i] ? SPELLS.find((x) => x.id === loadout.deck[i]) : undefined;
              return sp
                ? `<div class="lb-card" title="${sp.name}">${spellIconImg(sp.id)}<span class="lb-cost">${sp.pa}</span></div>`
                : `<div class="lb-card empty"></div>`;
            }).join('')}
          </div>
          <button class="ui-icon-btn ui-icon-btn--sm lb-deck-edit" id="edit-deck" aria-label="Modifier le deck dans le Grimoire">${icon('grimoire')}</button>
        </div>
        <button class="ui-btn ui-btn--primary ui-btn--xl lb-go" id="start">Combattre</button>
        <p class="lb-error" id="deck-error"></p>
      </section>
    </div>`
    : `<div class="ui-empty"><b>Aucun donjon</b><p>La tranche T${tranche.id} n’a pas encore de donjon. Redéfinissez-vous sur une tranche inférieure pour jouer.</p></div>`;

  const inDeck = new Set(loadout.deck);
  const grView = { spells, deck: inDeck, effLevel };
  const grimoireTab = `
    <div class="gr">
      <section class="ui-panel gr-deck-panel">
        <div class="gr-head"><span>Deck</span> <b id="deck-count"></b></div>
        <div class="gr-deck">
          ${Array.from({ length: tranche.deckSize }, (_, i) => {
            const sp = loadout.deck[i] ? SPELLS.find((x) => x.id === loadout.deck[i]) : undefined;
            return sp
              ? `<button class="lb-card gr-slot el-theme-${sp.element}" data-open="${sp.id}" aria-label="${sp.name}"><span class="grx-glyph">${spellGlyph(sp.name)}</span>${spellIconImg(sp.id)}<span class="lb-cost">${sp.pa}</span></button>`
              : `<div class="lb-card empty"></div>`;
          }).join('')}
        </div>
        <button class="ui-btn ui-btn--primary ui-btn--lg gr-go" id="start">Combattre</button>
        <p class="lb-error" id="deck-error"></p>
      </section>
      <section class="gr-main">
        <div class="gr-bar">
          ${segmented('gr-tab', [{ value: 'spells', label: `${icon('grimoire')} Sorts` }, { value: 'passives', label: `${icon('sparkle')} Passifs <b id="passive-count"></b>` }], grTab)}
          <small class="gr-hint">${grTab === 'spells' ? 'Touchez une carte pour sa fiche et l’ajouter au deck.' : `Touchez un passif pour l’équiper (${tranche.passiveSlots} emplacement${tranche.passiveSlots > 1 ? 's' : ''}).`}</small>
          ${grTab === 'passives' ? pagerHtml(`gr-${grTab}-${tranche.id}`) : ''}
        </div>
        ${
          grTab === 'spells'
            ? grimoireTableHtml(grView)
            : `<div class="gr-passives" data-paged="gr-passives-${tranche.id}">
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
        </div>`
        }
      </section>
    </div>`;

  const screen = hubShell(tab)!;
  const header =
    '';
  screen.innerHTML = `<div class="setup hub">${header}${tab === 'dungeons' ? dungeonsTab : grimoireTab}</div>
    <div class="spell-tip grimoire-tip" id="grimoire-tip" hidden></div>`;
  pageAll(screen);
  bindSegmented(screen, 'gr-tab', (v) => {
    grTab = v as 'spells' | 'passives';
    renderSetup();
  });
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
  app.querySelector('#lb-deck')?.addEventListener('click', () => goTab('grimoire'));
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
  // Même chose pour la graine des défis de combat, tirée ici, hors combat : un nouveau tirage à chaque run.
  const config = withEquipment({ ...baseConfig, challengeSeed: Math.floor(Math.random() * 2 ** 32) });
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
  // XP, défis et montée de niveau : recalculés en rejouant le run, comme le fera le serveur.
  const summary = summarizeRun(v.config, v.state.actionLog);
  // Butin : uniquement pour une victoire au replay validé, avec le bonus des défis réussis.
  // Recyclage automatique et ressources du donjon : voir craft/store.ts.
  const rewards = won && check?.valid ? grantRunRewards(v.config, v.state.actionLog, summary.challengeBonus) : null;
  const loot = rewards?.kept ?? [];
  const before = getCharacter();
  let sections: HTMLElement[] = [];
  if (before) {
    const { character, report } = applyRunSummary(before, summary);
    saveCharacter(character);
    sections = renderRunEndSections({ config: v.config, state: v.state, summary, report, character, validated: !!check?.valid });
  }
  showRunEnd({ config, state: { ...state, challenges: summary.challenges }, timeMs, check, loot, rewards, sections });
}

// Salle du boss d'un donjon, après `turns` fins de tour (outils de développement) : window.__devBoss('caldeira_des_cendres', 2).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__devBoss = (dungeonId: string, turns = 1, difficulty = 1) => {
    const c = getCharacter();
    if (!c) return;
    const config = withEquipment(characterRunConfig(c, dungeonId, difficulty));
    let state = createRun(config);
    const last = DUNGEONS.find((d) => d.id === dungeonId)!.rooms.length - 1;
    while (state.roomIndex < last) {
      const s = { ...state, units: state.units.map((u) => (u.team === 'monster' ? { ...u, hp: 0 } : u)) };
      state = applyAction(s, { type: 'endTurn' }).state;
    }
    for (let i = 0; i < turns && state.status === 'playing'; i++) state = applyAction(state, { type: 'endTurn' }).state;
    startCombat(config, state, { onExit: renderSetup, onFinish: finishRun });
  };
}

// Aperçu de l'écran de fin (outils de développement uniquement) : window.__devRunEnd('won' | 'lost').
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__devRunEnd = (status: 'won' | 'lost' = 'won', drops = 3) => {
    const c = getCharacter();
    if (!c) return;
    const dungeon = DUNGEONS.find((d) => d.tranche === c.trancheId)!;
    const config = withEquipment(characterRunConfig(c, dungeon.id, 6));
    const base = { startTurn: 0, turns: 4, pmSpent: 2, hpLost: 0, elements: [], killsThisTurn: 0 };
    const challenges = [
      { ...base, id: 'racines', roomIndex: 0, status: 'success' },
      { ...base, id: 'double', roomIndex: 1, status: 'failed' },
      { ...base, id: 'elan', roomIndex: 2, status: status === 'won' ? 'success' : 'failed', turnLimit: 6 },
    ] as RunState['challenges'];
    const state = { ...createRun(config), status, turn: 14, challenges } as RunState;
    const loot = status === 'won' ? getInventory().items.filter((i) => !Object.values(getInventory().loadouts?.[c.trancheId] ?? {}).includes(i.uid)).slice(-drops) : [];
    const summary = { ...summarizeRun(config, []), status, kills: [{ name: 'Ronceux', xp: 40 }, { name: 'Guêpe', xp: 30 }, { name: 'Gardien racineux', xp: 220 }] } as RunSummary;
    const { character, report } = applyRunSummary(c, { ...summary, xpTotal: 900, xpFromKills: 290, xpVictoryBonus: 610 });
    const sections = renderRunEndSections({ config, state, summary: { ...summary, xpVictoryBonus: 610, challengeBonus: 0.2, xpChallengeBonus: 180 }, report: { ...report, xpGained: 1080 }, character, validated: status === 'won' });
    const rewards: RunRewards | null =
      status === 'won' ? { kept: loot, autoRecycled: [{ uid: 'dev-r', itemId: loot[0]?.itemId ?? 'arc_racineux', rarity: 'common' }], shardsGained: { [c.trancheId]: 6 }, resources: Object.fromEntries(dungeonResources(dungeon.id).map((r, i) => [r.id, 3 - (i % 3)])), runes: ['braise:taillee'], trancheId: c.trancheId } : null;
    showRunEnd({ config, state, timeMs: 83000, check: status === 'won' ? { valid: true } as ReturnType<typeof verifyRun> : null, loot, rewards, sections });
  };
}

/** Écran de fin de run, sur une seule page : titre et résumé en haut, blocs côte à côte, actions en bas. */
function showRunEnd(o: {
  config: RunConfig;
  state: RunState;
  timeMs: number;
  check: ReturnType<typeof verifyRun> | null;
  loot: ItemInstance[];
  rewards: RunRewards | null;
  sections: HTMLElement[];
}): void {
  const v = { config: o.config, state: o.state };
  const { timeMs, check, loot, rewards, sections } = o;
  const won = v.state.status === 'won';
  const abandoned = v.state.status === 'playing';
  const overlay = document.createElement('div');
  overlay.className = `overlay end-ov ${won ? 'won' : 'lost'}`;
  const title = won ? 'Victoire !' : abandoned ? 'Run abandonné' : 'Défaite';
  overlay.innerHTML = `
    <div class="end-rays" aria-hidden="true"></div>
    <div class="end-wrap">
      <div class="end-title"><span>${title}</span></div>
      <div class="end-chips">
        <span class="ui-chip">${icon('skull')} Difficulté ${v.config.difficulty}</span>
        <span class="ui-chip">${icon('turns')} ${v.state.turn} tours</span>
        <span class="ui-chip">${icon('clock')} ${formatTime(timeMs)}</span>
        ${check ? `<span class="ui-chip ${check.valid ? 'end-ok' : 'end-ko'}">${check.valid ? `${icon('check')} Score vérifié` : `${icon('cross')} Non vérifié : ${check.reason}`}</span>` : `<span class="ui-chip">Salle ${v.state.roomIndex + 1} atteinte</span>`}
      </div>
      ${challengeEndRow(v.state.challenges)}
      <div class="end-body">
        ${loot.length ? lootPanelHtml(loot, v.config) : ''}
        ${rewards ? rewardsPanelHtml(rewards) : ''}
      </div>
      <div class="end-foot">
        <div class="end-links">
          <button class="ui-btn ui-btn--ghost ui-btn--sm" id="equipment" aria-label="Équipement">${icon('equipment')}<span>Équipement</span></button>
          <button class="ui-btn ui-btn--ghost ui-btn--sm" id="workshop" aria-label="Atelier">${icon('workshop')}<span>Atelier</span></button>
          <button class="ui-btn ui-btn--ghost ui-btn--sm" id="copy">Copier le replay</button>
        </div>
        <div class="end-actions">
          <button class="ui-btn ui-btn--blue ui-btn--lg" id="back">${icon('home')} Continuer</button>
          <button class="ui-btn ui-btn--primary ui-btn--lg" id="again">${icon('replay')} Rejouer</button>
        </div>
      </div>
    </div>`;
  const body = overlay.querySelector('.end-body')!;
  // XP d'abord, puis le butin du boss et les ressources ; chaque bloc apparaît à son tour.
  sections.reverse().forEach((el) => body.prepend(el));
  [...body.children].forEach((el, i) => (el as HTMLElement).style.setProperty('--i', String(i)));
  document.body.appendChild(overlay);
  pageAll(overlay);
  if (won) loot.forEach((_, i) => setTimeout(() => sfx('coin'), 900 + i * 220));
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
unlockAudio();
// Petit « clic » sur tous les boutons du jeu.
document.addEventListener('pointerdown', (e) => {
  const b = (e.target as HTMLElement).closest('.ui-btn:not(:disabled), .ui-icon-btn, .hub-tab, .chip, .gr-card, .eq-tile:not(.empty), .lb-steps button, .lb-dots button');
  if (b) sfx('tap');
});
if (new URLSearchParams(location.search).get('dev') === 'da') {
  document.getElementById('boot')?.remove();
  void import('./ui/da-mock').then((m) => m.renderDaMock(app));
} else if (new URLSearchParams(location.search).get('dev') === 'ui') {
  document.getElementById('boot')?.remove();
  void import('./ui/gallery').then((m) => m.renderGallery(app));
} else {
  void boot();
}


/** Écran de chargement : polices et images principales, puis le hub (ou la création du personnage). */
async function boot(): Promise<void> {
  const BOOT_TIPS = [
    'Astuce : finir son tour hors de portée des monstres vaut souvent mieux qu’un coup de plus.',
    'Astuce : plus vous tirez de loin, plus vos flèches frappent fort.',
    'Astuce : les objets mythiques donnent beaucoup plus de stats que les communs.',
    'Astuce : l’œil du combat montre les zones de menace ennemies.',
    'Astuce : recyclez le butin en trop à l’Atelier pour fabriquer mieux.',
  ];
  const bar = document.getElementById('boot-bar');
  const tip = document.getElementById('boot-tip');
  if (tip) tip.textContent = BOOT_TIPS[Math.floor(Math.random() * BOOT_TIPS.length)];
  const c = getCharacter();
  const trancheId = c?.trancheId ?? 1;
  const urls = [
    'units/archer.png',
    'ui/hub-bg.webp',
    ...DUNGEONS.filter((d) => d.tranche === trancheId).flatMap((d) => {
      const boss = d.rooms[d.rooms.length - 1].monsters.map((m) => getMonster(m.templateId)).find((m) => m.isBoss);
      return [`dungeons/${d.id}.webp`, ...(boss ? [`units/${boss.id}.png`] : [])];
    }),
  ].map(assetUrl);
  const jobs: Promise<unknown>[] = [document.fonts?.ready ?? Promise.resolve(), ...urls.map((u) => new Promise((r) => { const img = new Image(); img.onload = img.onerror = r; img.src = u; }))];
  let done = 0;
  jobs.forEach((j) => void j.then(() => { done++; if (bar) bar.style.width = `${8 + (92 * done) / jobs.length}%`; }));
  const started = performance.now();
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 4000))]);
  // Assez long pour lire la barre pleine, sans jamais faire attendre pour rien.
  await new Promise((r) => setTimeout(r, Math.max(0, 450 - (performance.now() - started))));
  renderSetup();
  const el = document.getElementById('boot');
  el?.classList.add('is-done');
  setTimeout(() => el?.remove(), 400);
}
