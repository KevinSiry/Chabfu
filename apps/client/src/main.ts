import {
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
import { equipmentSummaryHtml, renderEquipmentScreen } from './stuff/equipment-screen';
import { bindLootPanel, lootPanelHtml } from './stuff/loot-panel';
import { withEquipment } from './stuff/store';
import { rewardsPanelHtml } from './craft/rewards-panel';
import { grantRunRewards } from './craft/store';
import { renderWorkshopScreen } from './craft/workshop-screen';
import { formatTime, leaveRun, startRun as startCombat } from './combat';
import { ELEMENT_LABEL, rangeLabel } from './info';
import { slotKeysRange } from './keys';
import { renderRunEndSections } from './character/run-end';
import { getCharacter, saveCharacter } from './character/store';
import { bindCharacterBanner, characterBannerHtml, renderCharacterCreation } from './character/ui';

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

function dungeonListHtml(dungeons: DungeonDef[], selected: DungeonDef): string {
  return `
    <div class="dungeon-list">
      ${dungeons
        .map((d) => {
          const best = save.scores.filter((s) => s.dungeonId === d.id).sort(compareScores)[0];
          const boss = d.rooms[d.rooms.length - 1].monsters.map((m) => getMonster(m.templateId)).find((m) => m.isBoss);
          return `
        <button class="dungeon-card${d.id === selected.id ? ' selected' : ''}" data-dungeon="${d.id}">
          <div class="head"><span class="el el-${d.dominantElement}"></span>${d.name}</div>
          <div class="meta">${ELEMENT_LABEL[d.dominantElement]} · craint ${ELEMENT_LABEL[d.weakElement]} <span class="el el-${d.weakElement}"></span></div>
          <div class="meta">${d.rooms.length - 1} salle${d.rooms.length > 2 ? 's' : ''} + ${boss?.name ?? 'boss'}</div>
          <div class="meta">${best ? `Record : diff. ${best.difficulty} · ${best.turns} tours` : 'Pas encore terminé'}</div>
        </button>`;
        })
        .join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Écran de préparation (personnage, tranche, donjon, deck, passifs)
// ---------------------------------------------------------------------------

function renderSetup(): void {
  const character = getCharacter();
  if (!character) {
    renderCharacterCreation(app, renderSetup);
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

  app.innerHTML = `
    <div class="setup">
      <header><h1>Chabfu</h1><p>Prototype · Tranche T${tranche.id} (niveaux ${tranche.minLevel}–${tranche.maxLevel})</p></header>
      ${characterBannerHtml(character)}
      <div class="setup-grid">
        <div class="card">
          ${
            dungeon
              ? `${dungeons.length > 1 ? dungeonListHtml(dungeons, dungeon) : ''}
                 <h2>${dungeon.name}</h2>
                 <p class="muted">${dungeon.description} ${dungeon.rooms.length - 1} salle${dungeon.rooms.length > 2 ? 's' : ''} + boss, toujours identiques.</p>`
              : `<h2>Aucun donjon</h2><p class="muted">La tranche T${tranche.id} n’a pas encore de donjon. Redéfinissez-vous sur une tranche inférieure pour jouer.</p>`
          }
          <h3 style="margin-top:16px">Deck <span class="muted" id="deck-count"></span></h3>
          <div class="spell-list">
            ${spells
              .map((s) => {
                const locked = s.level > effLevel;
                return `
              <button class="spell-card ${locked ? 'locked' : ''}" data-spell="${s.id}" ${locked ? 'disabled' : ''}>
                <div class="head"><span><span class="el el-${s.element}"></span>${s.name}</span><span>${locked ? `🔒 Niv. ${s.level}` : `${s.pa} PA`}</span></div>
                <div class="meta">Niv. ${s.level} · ${ELEMENT_LABEL[s.element]} · ${rangeLabel(s.minRange, s.maxRange)}${s.maxPerTurn ? ` · ${s.maxPerTurn}/tour` : ''}</div>
                <div class="desc">${s.description}</div>
              </button>`;
              })
              .join('')}
          </div>
          <h3 style="margin-top:16px">Passifs <span class="muted" id="passive-count"></span></h3>
          <div class="passive-list">
            ${passives
              .map((p) => {
                const locked = p.level > effLevel;
                return `
              <button class="passive-card ${locked ? 'locked' : ''}" data-passive="${p.id}" ${locked ? 'disabled' : ''}>
                <div class="head"><span>${p.name}</span><span class="muted">${locked ? '🔒 ' : ''}Niv. ${p.level}</span></div>
                <div class="desc">${p.description}</div>
              </button>`;
              })
              .join('')}
          </div>
        </div>
        <div class="side">
          <div class="card">
            <h3>Difficulté</h3>
            <div class="difficulty"><input type="range" min="1" max="${MAX_DIFFICULTY}" value="${save.difficulty}" id="diff" /><strong id="diff-v">${save.difficulty}</strong></div>
            <p class="muted">+15 % de PV, de dégâts et d’XP des monstres par palier. Salles et placements identiques.</p>
            <button class="primary" id="start" style="width:100%">Lancer le donjon</button>
            <p class="muted" id="deck-error"></p>
          </div>
          ${equipmentSummaryHtml(tranche.id)}
          <div class="card">
            <h3>Atelier</h3>
            <p class="muted">Ressources du donjon, craft à rareté fixe et recyclage en éclats.</p>
            <button class="secondary" id="open-workshop" style="width:100%">Craft et recyclage</button>
          </div>
          <div class="card">
            <h3>Meilleurs runs</h3>
            ${
              best.length
                ? `<table class="scores"><tr><th>Diff.</th><th>Tours</th><th>Chrono</th></tr>${best
                    .map((s) => `<tr><td>${s.difficulty}</td><td>${s.turns}</td><td>${formatTime(s.timeMs)}</td></tr>`)
                    .join('')}</table>`
                : '<p class="muted">Aucun run terminé pour l’instant.</p>'
            }
          </div>
          <div class="card hint">
            Clic : se déplacer · ${slotKeysRange(tranche.deckSize)} (ou pavé numérique) : choisir un sort · Espace : fin du tour · T : zones de menace · Échap / clic droit : annuler.
            La Concentration monte de 1 si vous n’avez pas bougé au tour précédent, et baisse de 1 par PM dépensé.
          </div>
        </div>
      </div>
    </div>`;

  bindCharacterBanner(app, renderSetup);
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
    app.querySelectorAll<HTMLButtonElement>('.spell-card').forEach((b) => b.classList.toggle('selected', deck.has(b.dataset.spell!)));
    app.querySelectorAll<HTMLButtonElement>('.passive-card').forEach((b) => b.classList.toggle('selected', chosenPassives.has(b.dataset.passive!)));
    app.querySelector('#deck-count')!.textContent = `${deck.size} / ${tranche.deckSize}`;
    app.querySelector('#passive-count')!.textContent = `${chosenPassives.size} / ${tranche.passiveSlots}`;
    (app.querySelector('#start') as HTMLButtonElement).disabled = deck.size === 0 || !dungeon;
  };
  app.querySelectorAll<HTMLButtonElement>('.spell-card').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.spell!;
      if (deck.has(id)) deck.delete(id);
      else if (deck.size < tranche.deckSize) deck.add(id);
      persist();
      refresh();
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
      refresh();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-dungeon]').forEach((b) =>
    b.addEventListener('click', () => {
      save.dungeonId = b.dataset.dungeon;
      writeSave(save);
      renderSetup();
    }),
  );
  const diff = app.querySelector('#diff') as HTMLInputElement;
  diff.addEventListener('input', () => (app.querySelector('#diff-v')!.textContent = diff.value));
  app.querySelector('#open-equipment')!.addEventListener('click', () => {
    save.difficulty = Number(diff.value);
    writeSave(save);
    openEquipment();
  });
  app.querySelector('#open-workshop')!.addEventListener('click', () => {
    save.difficulty = Number(diff.value);
    writeSave(save);
    openWorkshop();
  });
  app.querySelector('#start')!.addEventListener('click', () => {
    const c = getCharacter();
    if (!c || !dungeon) return;
    persist();
    save.difficulty = Number(diff.value);
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

function openEquipment(): void {
  const trancheId = getCharacter()?.trancheId ?? 1;
  const dungeons = DUNGEONS.filter((d) => d.tranche === trancheId);
  const dungeon = dungeons.find((d) => d.id === save.dungeonId) ?? dungeons[0] ?? DUNGEONS[0];
  renderEquipmentScreen(app, { trancheId, dungeonId: dungeon.id, difficulty: save.difficulty, onBack: renderSetup });
}

function openWorkshop(): void {
  const trancheId = getCharacter()?.trancheId ?? 1;
  const dungeons = DUNGEONS.filter((d) => d.tranche === trancheId);
  const dungeon = dungeons.find((d) => d.id === save.dungeonId) ?? dungeons[0] ?? DUNGEONS[0];
  renderWorkshopScreen(app, { trancheId, dungeonId: dungeon.id, onBack: renderSetup });
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
      <h2 class="${won ? 'ok' : 'ko'}">${won ? 'Donjon terminé !' : abandoned ? 'Run abandonné' : 'Défaite'}</h2>
      <p>Difficulté ${v.config.difficulty} · ${v.state.turn} tours · ${formatTime(timeMs)}</p>
      ${check ? `<p class="${check.valid ? 'ok' : 'ko'}">${check.valid ? '✓ Replay validé (même moteur que le serveur)' : `✗ Replay invalide : ${check.reason}`}</p>` : `<p class="muted">Salle ${v.state.roomIndex + 1} atteinte.</p>`}
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
      (overlay.querySelector('#copy') as HTMLButtonElement).textContent = 'Copié ✓';
    } catch {
      console.log(payload);
    }
  });
}

renderSetup();
