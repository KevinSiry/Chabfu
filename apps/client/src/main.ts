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
import { slotKeyLabel, slotKeysRange } from './keys';
import { dungeonBannerImg, spellIconImg } from './ui/assets';
import { bindHubTabs, hubBarHtml, type HubTab } from './ui/hub';
import { renderRunEndSections } from './character/run-end';
import { getCharacter, saveCharacter } from './character/store';
import { bindCharacterBanner, renderCharacterCreation } from './character/ui';
// Habillage peint : importé en dernier pour passer devant les styles de base.
import './ui/skin.css';
import './ui/skin-ng.css';

// Aperçu des directions « new gen » : ?skin=nuit|ivoire|bois (mémorisé), ?skin=classique pour revenir.
{
  const q = new URLSearchParams(location.search).get('skin');
  try { if (q) localStorage.setItem('chabfu-skin', q); } catch { /* stockage indisponible */ }
  let skin = q;
  try { skin ??= localStorage.getItem('chabfu-skin'); } catch { /* idem */ }
  if (skin && skin !== 'classique') document.documentElement.dataset.skin = skin;
}

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
            <div class="record ${best ? 'done' : ''}">${best ? `★ Diff. ${best.difficulty} · ${best.turns} tours` : 'Pas encore terminé'}</div>
          </div>
        </button>`;
        })
        .join('')}
    </div>`;
}

const ELEMENT_SIGIL: Record<string, string> = { fire: '🜂', water: '🜄', earth: '🜃', air: '🜁', neutral: '◈' };

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

/** Ajoute la barre du hub au-dessus d'un écran existant (équipement, atelier). */
function withHubBar(active: HubTab): void {
  const c = getCharacter();
  if (!c) return;
  app.insertAdjacentHTML('afterbegin', hubBarHtml(active, c));
  app.classList.add('has-hub');
  bindHubTabs(app, goTab);
  bindCharacterBanner(app, renderSetup);
}

function renderSetup(): void {
  app.classList.remove('has-hub');
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

  const dungeonsTab = `
    <div class="hub-grid">
      <div class="hub-main">
        <section class="card">
          <div class="panel-title">Donjons de la tranche T${tranche.id}</div>
          ${dungeons.length ? dungeonListHtml(dungeons, dungeon) : `<p class="muted">La tranche T${tranche.id} n’a pas encore de donjon. Redéfinissez-vous sur une tranche inférieure pour jouer.</p>`}
        </section>
        ${
          dungeon
            ? `<section class="card dungeon-detail el-theme-${dungeon.dominantElement}">
                <div class="dungeon-detail-head">
                  <span class="dungeon-sigil big">${ELEMENT_SIGIL[dungeon.dominantElement]}${dungeonBannerImg(dungeon.id)}</span>
                  <div><h2>${dungeon.name}</h2>
                  <p class="muted">${dungeon.description}</p></div>
                </div>
                <div class="room-path">
                  ${dungeon.rooms
                    .map((r, i) => {
                      const isBoss = i === dungeon.rooms.length - 1;
                      return `<div class="room-step ${isBoss ? 'boss' : ''}"><b>${isBoss ? '☠' : i + 1}</b><span>${r.name}</span><small>${r.monsters.length} monstre${r.monsters.length > 1 ? 's' : ''}</small></div>`;
                    })
                    .join('<span class="room-link"></span>')}
                </div>
                <p class="muted small">Salles et placements toujours identiques. Boss : <b>${boss?.name ?? '—'}</b>.</p>
              </section>`
            : ''
        }
      </div>
      <aside class="side">
        <section class="card expedition">
          <div class="panel-title">Expédition</div>
          <h3>${dungeon?.name ?? 'Aucun donjon'}</h3>
          <label class="muted small" for="diff">Difficulté</label>
          <div class="difficulty"><input type="range" min="1" max="${MAX_DIFFICULTY}" value="${save.difficulty}" id="diff" /><strong id="diff-v">${save.difficulty}</strong></div>
          <p class="muted small">+15 % de PV, de dégâts et d’XP des monstres par palier.</p>
          ${deckStrip}
          <button class="ghost small-link" id="edit-deck">Modifier le grimoire ›</button>
          <button class="primary launch" id="start">Lancer le donjon</button>
          <p class="muted" id="deck-error"></p>
        </section>
        ${equipmentSummaryHtml(tranche.id)}
        <section class="card">
          <div class="panel-title">Meilleurs runs</div>
          ${
            best.length
              ? `<table class="scores"><tr><th>Diff.</th><th>Tours</th><th>Chrono</th></tr>${best
                  .map((s) => `<tr><td>${s.difficulty}</td><td>${s.turns}</td><td>${formatTime(s.timeMs)}</td></tr>`)
                  .join('')}</table>`
              : '<p class="muted">Aucun run terminé pour l’instant.</p>'
          }
        </section>
      </aside>
    </div>`;

  const grimoireTab = `
    <div class="hub-grid">
      <div class="hub-main">
        <section class="card">
          <div class="panel-title">Sorts <span class="muted" id="deck-count"></span></div>
          <p class="muted small">Choisissez jusqu’à ${tranche.deckSize} sorts. L’ordre du deck suit celui du grimoire et donne les raccourcis (${slotKeysRange(tranche.deckSize)}).</p>
          <div class="spell-list">
            ${spells
              .map((s) => {
                const locked = s.level > effLevel;
                return `
              <button class="spell-card el-theme-${s.element} ${locked ? 'locked' : ''}" data-spell="${s.id}" ${locked ? 'disabled' : ''}>
                <span class="spell-card-icon">${spellIconImg(s.id)}</span>
                <div class="head"><span><span class="el el-${s.element}"></span>${s.name}</span><span class="cost">${locked ? `🔒 Niv. ${s.level}` : `${s.pa} PA`}</span></div>
                <div class="meta">Niv. ${s.level} · ${ELEMENT_LABEL[s.element]} · ${rangeLabel(s.minRange, s.maxRange)}${s.maxPerTurn ? ` · ${s.maxPerTurn}/tour` : ''}</div>
                <div class="desc">${s.description}</div>
              </button>`;
              })
              .join('')}
          </div>
        </section>
        <section class="card">
          <div class="panel-title">Passifs <span class="muted" id="passive-count"></span></div>
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
        </section>
      </div>
      <aside class="side">
        <section class="card">
          <div class="panel-title">Barre de sorts</div>
          ${deckStrip}
          <button class="primary launch" id="start">Lancer le donjon</button>
          <p class="muted" id="deck-error"></p>
        </section>
        <section class="card hint">
          <div class="panel-title">Commandes</div>
          Clic : se déplacer · ${slotKeysRange(tranche.deckSize)} (ou pavé numérique) : choisir un sort · Espace : fin du tour · T : zones de menace · Échap / clic droit : annuler.
          La Concentration monte de 1 si vous n’avez pas bougé au tour précédent, et baisse de 1 par PM dépensé.
        </section>
      </aside>
    </div>`;

  app.innerHTML = `
    ${hubBarHtml(tab, character)}
    <div class="setup hub">${tab === 'dungeons' ? dungeonsTab : grimoireTab}</div>`;

  bindHubTabs(app, goTab);
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
    const dc = app.querySelector('#deck-count');
    if (dc) dc.textContent = `${deck.size} / ${tranche.deckSize}`;
    const pc = app.querySelector('#passive-count');
    if (pc) pc.textContent = `${chosenPassives.size} / ${tranche.passiveSlots}`;
    (app.querySelector('#start') as HTMLButtonElement).disabled = deck.size === 0 || !dungeon;
  };
  // Le grimoire redessine l'écran pour mettre à jour la barre de sorts.
  const rerender = () => renderSetup();
  app.querySelectorAll<HTMLButtonElement>('.spell-card').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.spell!;
      if (deck.has(id)) deck.delete(id);
      else if (deck.size < tranche.deckSize) deck.add(id);
      persist();
      rerender();
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
  const diff = app.querySelector('#diff') as HTMLInputElement | null;
  const keepDifficulty = () => {
    if (!diff) return;
    save.difficulty = Number(diff.value);
    writeSave(save);
  };
  diff?.addEventListener('input', () => {
    app.querySelector('#diff-v')!.textContent = diff.value;
    keepDifficulty();
  });
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

function openEquipment(): void {
  const trancheId = getCharacter()?.trancheId ?? 1;
  const dungeons = DUNGEONS.filter((d) => d.tranche === trancheId);
  const dungeon = dungeons.find((d) => d.id === save.dungeonId) ?? dungeons[0] ?? DUNGEONS[0];
  renderEquipmentScreen(app, { trancheId, dungeonId: dungeon.id, difficulty: save.difficulty, onBack: renderSetup });
  withHubBar('equipment');
}

function openWorkshop(): void {
  const trancheId = getCharacter()?.trancheId ?? 1;
  const dungeons = DUNGEONS.filter((d) => d.tranche === trancheId);
  const dungeon = dungeons.find((d) => d.id === save.dungeonId) ?? dungeons[0] ?? DUNGEONS[0];
  renderWorkshopScreen(app, { trancheId, dungeonId: dungeon.id, onBack: renderSetup });
  withHubBar('workshop');
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
      <div class="end-stats"><span>Difficulté ${v.config.difficulty}</span><span>${v.state.turn} tours</span><span>⏱ ${formatTime(timeMs)}</span></div>
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
