import {
  DUNGEONS,
  MAX_DIFFICULTY,
  availableSpells,
  compareScores,
  createRun,
  getTranche,
  verifyRun,
  type RunConfig,
  type RunScore,
  type RunState,
} from '@chabfu/engine';
import { formatTime, leaveRun, startRun as startCombat } from './combat';
import { ELEMENT_LABEL, rangeLabel } from './info';
import { equipmentSummaryHtml, renderEquipmentScreen } from './stuff/equipment-screen';
import { bindLootPanel, lootPanelHtml } from './stuff/loot-panel';
import { grantBossLoot, withEquipment } from './stuff/store';

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
  deck: string[];
  difficulty: number;
  scores: SavedScore[];
}

function loadSave(): Save {
  const fallback: Save = { deck: ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'fleche_givree', 'tir_concentre'], difficulty: 1, scores: [] };
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
const dungeon = DUNGEONS[0];
const tranche = getTranche(dungeon.tranche);

// ---------------------------------------------------------------------------
// Écran de préparation
// ---------------------------------------------------------------------------

function renderSetup(): void {
  const spells = availableSpells(tranche.redefinitionLevel);
  const best = save.scores.filter((s) => s.dungeonId === dungeon.id).sort(compareScores).slice(0, 8);
  app.innerHTML = `
    <div class="setup">
      <header><h1>Chabfu</h1><p>Prototype · Tranche T${tranche.id} (niveau ${tranche.redefinitionLevel})</p></header>
      <div class="setup-grid">
        <div class="card">
          <h2>${dungeon.name}</h2>
          <p class="muted">${dungeon.description} 2 salles + boss, toujours identiques.</p>
          <h3 style="margin-top:16px">Deck <span class="muted" id="deck-count"></span></h3>
          <div class="spell-list">
            ${spells
              .map(
                (s) => `
              <button class="spell-card" data-spell="${s.id}">
                <div class="head"><span><span class="el el-${s.element}"></span>${s.name}</span><span>${s.pa} PA</span></div>
                <div class="meta">Niv. ${s.level} · ${ELEMENT_LABEL[s.element]} · ${rangeLabel(s.minRange, s.maxRange)}${s.maxPerTurn ? ` · ${s.maxPerTurn}/tour` : ''}</div>
                <div class="desc">${s.description}</div>
              </button>`,
              )
              .join('')}
          </div>
        </div>
        <div class="side">
          <div class="card">
            <h3>Difficulté</h3>
            <div class="difficulty"><input type="range" min="1" max="${MAX_DIFFICULTY}" value="${save.difficulty}" id="diff" /><strong id="diff-v">${save.difficulty}</strong></div>
            <p class="muted">+15 % de PV et de dégâts monstres par palier. Salles et placements identiques.</p>
            <button class="primary" id="start" style="width:100%">Lancer le donjon</button>
            <p class="muted" id="deck-error"></p>
          </div>
          ${equipmentSummaryHtml(tranche.id)}
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
            Clic : se déplacer · 1–${tranche.deckSize} : choisir un sort · Espace : fin du tour · T : zones de menace · Échap / clic droit : annuler.
            Survolez un monstre pour voir sa fiche et ce qu’il fera, un sort pour voir sa portée, une case pour voir ce qu’elle vous coûtera.
            La Concentration monte de 1 si vous n’avez pas bougé au tour précédent, et baisse de 1 par PM dépensé.
          </div>
        </div>
      </div>
    </div>`;

  const deck = new Set(save.deck.filter((id) => spells.some((s) => s.id === id)));
  const refresh = () => {
    app.querySelectorAll<HTMLButtonElement>('.spell-card').forEach((b) => b.classList.toggle('selected', deck.has(b.dataset.spell!)));
    app.querySelector('#deck-count')!.textContent = `${deck.size} / ${tranche.deckSize}`;
    (app.querySelector('#start') as HTMLButtonElement).disabled = deck.size === 0;
  };
  app.querySelectorAll<HTMLButtonElement>('.spell-card').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.spell!;
      if (deck.has(id)) deck.delete(id);
      else if (deck.size < tranche.deckSize) deck.add(id);
      refresh();
    }),
  );
  const diff = app.querySelector('#diff') as HTMLInputElement;
  diff.addEventListener('input', () => (app.querySelector('#diff-v')!.textContent = diff.value));
  app.querySelector('#open-equipment')!.addEventListener('click', () => {
    save.difficulty = Number(diff.value);
    writeSave(save);
    openEquipment();
  });
  app.querySelector('#start')!.addEventListener('click', () => {
    // Ordre du deck = ordre du catalogue, pour des raccourcis stables.
    save.deck = spells.map((s) => s.id).filter((id) => deck.has(id));
    save.difficulty = Number(diff.value);
    writeSave(save);
    startRun({ dungeonId: dungeon.id, difficulty: save.difficulty, deck: save.deck });
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function openEquipment(): void {
  renderEquipmentScreen(app, { trancheId: tranche.id, dungeonId: dungeon.id, difficulty: save.difficulty, onBack: renderSetup });
}

function startRun(baseConfig: RunConfig): void {
  // L'équipement porté au lancement fait partie de la config : le replay le rejoue à l'identique.
  const config = withEquipment(baseConfig);
  startCombat(config, createRun(config), {
    onExit: renderSetup,
    onFinish: finishRun,
  });
}

// ---------------------------------------------------------------------------
// Fin de run
// ---------------------------------------------------------------------------

function finishRun(config: RunConfig, state: RunState, timeMs: number): void {
  const v = { config, state };
  const won = v.state.status === 'won';
  // Même vérification que celle que fera le serveur : on rejoue la suite d'actions.
  const check = won ? verifyRun(v.config, v.state.actionLog, v.state.turn) : null;
  if (won && check?.valid) {
    save.scores.push({ dungeonId: v.config.dungeonId, difficulty: v.config.difficulty, turns: v.state.turn, timeMs, date: new Date().toISOString(), deck: v.config.deck });
    save.scores = save.scores.sort(compareScores).slice(0, 50);
    writeSave(save);
  }
  // Butin : uniquement pour une victoire au replay validé.
  const loot = won && check?.valid ? grantBossLoot(v.config) : [];
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="card${loot.length ? ' with-loot' : ''}">
      <h2 class="${won ? 'ok' : 'ko'}">${won ? 'Donjon terminé !' : 'Défaite'}</h2>
      <p>Difficulté ${v.config.difficulty} · ${v.state.turn} tours · ${formatTime(timeMs)}</p>
      ${check ? `<p class="${check.valid ? 'ok' : 'ko'}">${check.valid ? '✓ Replay validé (même moteur que le serveur)' : `✗ Replay invalide : ${check.reason}`}</p>` : `<p class="muted">Salle ${v.state.roomIndex + 1} atteinte.</p>`}
      ${loot.length ? lootPanelHtml(loot, v.config) : ''}
      <div class="row">
        <button class="primary" id="again">Rejouer</button>
        <button class="secondary" id="equipment">Équipement</button>
        <button class="secondary" id="back">Changer de deck</button>
        <button class="secondary" id="copy">Copier le replay</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#again')!.addEventListener('click', () => {
    overlay.remove();
    startRun(v.config);
  });
  bindLootPanel(overlay, loot, v.config);
  overlay.querySelector('#equipment')!.addEventListener('click', () => {
    overlay.remove();
    leaveRun();
    openEquipment();
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
