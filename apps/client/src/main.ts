import {
  DUNGEONS,
  MAX_CONCENTRATION,
  PASSIVES,
  SPELLS,
  applyRunSummary,
  characterEffectiveLevel,
  characterRunConfig,
  currentLoadout,
  setLoadout,
  summarizeRun,
  MAX_DIFFICULTY,
  applyAction,
  compareScores,
  createRun,
  getCastError,
  getDungeon,
  getMonster,
  monsterBehavior,
  getPlayer,
  getReachableCells,
  getSpell,
  getSpellRange,
  getSpellZone,
  getTranche,
  key,
  unitAt,
  verifyRun,
  type Action,
  type Element,
  type DungeonDef,
  type GameEvent,
  type MonsterAttack,
  type MonsterBehavior,
  type Pos,
  type RoomState,
  type RunConfig,
  type RunScore,
  type RunState,
} from '@chabfu/engine';
import { equipmentSummaryHtml, renderEquipmentScreen } from './stuff/equipment-screen';
import { bindLootPanel, lootPanelHtml } from './stuff/loot-panel';
import { grantBossLoot, withEquipment } from './stuff/store';
import { CANVAS_H, CANVAS_W, ELEMENT_COLORS, draw, toCell, type DisplayUnit, type FloatingText, type Highlight } from './render';
import { renderRunEndSections } from './character/run-end';
import { getCharacter, saveCharacter } from './character/store';
import { bindCharacterBanner, characterBannerHtml, renderCharacterCreation } from './character/ui';

const app = document.getElementById('app')!;
const ELEMENT_LABEL: Record<Element, string> = { fire: 'Feu', water: 'Eau', earth: 'Terre', air: 'Air', neutral: 'Neutre' };
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
            Clic : se déplacer · 1–${tranche.deckSize} : choisir un sort · Espace : fin du tour · Échap / clic droit : annuler.
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

function rangeLabel(min: number, max: number): string {
  if (max === 0) return 'Soi';
  return min === max ? `Portée ${min}` : `Portée ${min}–${max}`;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

interface RunView {
  config: RunConfig;
  state: RunState;
  displayRoom: RoomState;
  display: Map<string, DisplayUnit>;
  floats: FloatingText[];
  log: string[];
  selectedSpell: string | null;
  hover: Pos | null;
  busy: boolean;
  startedAt: number;
  endedAt: number | null;
  ctx: CanvasRenderingContext2D;
}

let view: RunView | null = null;
let frame = 0;

function buildDisplay(state: RunState): Map<string, DisplayUnit> {
  const map = new Map<string, DisplayUnit>();
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    map.set(u.id, {
      id: u.id,
      name: u.name,
      team: u.team,
      templateId: u.templateId,
      isBoss: !!u.isBoss,
      x: u.pos.x,
      y: u.pos.y,
      hp: u.hp,
      maxHp: u.maxHp,
      alive: true,
      alpha: 1,
      burning: !!u.burn,
    });
  }
  return map;
}

function openEquipment(): void {
  const trancheId = getCharacter()?.trancheId ?? 1;
  const dungeons = DUNGEONS.filter((d) => d.tranche === trancheId);
  const dungeon = dungeons.find((d) => d.id === save.dungeonId) ?? dungeons[0] ?? DUNGEONS[0];
  renderEquipmentScreen(app, { trancheId, dungeonId: dungeon.id, difficulty: save.difficulty, onBack: renderSetup });
}

function startRun(baseConfig: RunConfig): void {
  // L'équipement porté au lancement fait partie de la config : le replay le rejoue à l'identique.
  const config = withEquipment(baseConfig);
  const state = createRun(config);
  app.innerHTML = `
    <div class="run">
      <div>
        <div class="board">
          <canvas id="board" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
          <div class="topbar"><span id="room"></span><span id="turn"></span><span id="clock"></span></div>
        </div>
        <div class="spellbar" id="spellbar"></div>
      </div>
      <div class="side">
        <div class="card" id="hud"></div>
        <button class="primary end-turn" id="end-turn">Fin du tour (Espace)</button>
        <div class="card" id="target"><p class="muted">Survolez un monstre pour voir ses faiblesses.</p></div>
        <div class="card"><h3>Journal</h3><div class="log" id="log"></div></div>
        <button class="secondary" id="abandon">Abandonner</button>
      </div>
    </div>`;

  const canvas = app.querySelector('#board') as HTMLCanvasElement;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  view = {
    config,
    state,
    displayRoom: state.room,
    display: buildDisplay(state),
    floats: [],
    log: [`Entrée : ${state.room.name}`],
    selectedSpell: null,
    hover: null,
    busy: false,
    startedAt: performance.now(),
    endedAt: null,
    ctx,
  };

  canvas.addEventListener('mousemove', (e) => {
    if (!view) return;
    const r = canvas.getBoundingClientRect();
    view.hover = toCell(view.displayRoom, ((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * CANVAS_H);
    renderTarget();
  });
  canvas.addEventListener('mouseleave', () => view && (view.hover = null));
  canvas.addEventListener('click', () => view?.hover && onCellClick(view.hover));
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    selectSpell(null);
  });
  app.querySelector('#end-turn')!.addEventListener('click', () => act({ type: 'endTurn' }));
  app.querySelector('#abandon')!.addEventListener('click', () => {
    if (!view || view.busy) return;
    // Abandonner rapporte quand même l'XP des monstres déjà vaincus.
    if (view.state.actionLog.length === 0) {
      view = null;
      renderSetup();
      return;
    }
    finishRun(view);
  });

  renderHud();
  cancelAnimationFrame(frame);
  const loop = () => {
    if (!view) return;
    drawBoard();
    updateClock();
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

window.addEventListener('keydown', (e) => {
  if (!view) return;
  if (e.code === 'Space') {
    e.preventDefault();
    act({ type: 'endTurn' });
  } else if (e.key === 'Escape') {
    selectSpell(null);
  } else if (/^[1-9]$/.test(e.key)) {
    const id = view.state.player.deck[Number(e.key) - 1];
    if (id) selectSpell(view.selectedSpell === id ? null : id);
  }
});

function selectSpell(id: string | null): void {
  if (!view) return;
  if (id && getSpell(id).target === 'self') {
    if (!getCastError(view.state, id)) act({ type: 'cast', spellId: id, target: getPlayer(view.state).pos });
    return;
  }
  view.selectedSpell = id && !getCastError(view.state, id) ? id : null;
  renderHud();
}

function onCellClick(cell: Pos): void {
  if (!view || view.busy) return;
  if (view.selectedSpell) {
    if (!getCastError(view.state, view.selectedSpell, cell)) act({ type: 'cast', spellId: view.selectedSpell, target: cell });
    return;
  }
  if (getReachableCells(view.state).has(key(cell))) act({ type: 'move', to: cell });
}

function act(action: Action): void {
  if (!view || view.busy || view.state.status !== 'playing') return;
  let result: { state: RunState; events: GameEvent[] };
  try {
    result = applyAction(view.state, action);
  } catch (e) {
    view.log.push(`⚠ ${(e as Error).message}`);
    renderHud();
    return;
  }
  const v = view;
  v.state = result.state;
  v.selectedSpell = null;
  v.busy = true;
  renderHud();
  void animate(v, result.events).then(() => {
    if (view !== v) return;
    v.busy = false;
    v.displayRoom = v.state.room;
    v.display = buildDisplay(v.state);
    renderHud();
    if (v.state.status !== 'playing') finishRun(v);
  });
}

// ---------------------------------------------------------------------------
// Animation des événements
// ---------------------------------------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function slide(u: DisplayUnit, to: Pos, ms: number): Promise<void> {
  const from = { x: u.x, y: u.y };
  const start = performance.now();
  while (true) {
    const t = Math.min(1, (performance.now() - start) / ms);
    u.x = from.x + (to.x - from.x) * t;
    u.y = from.y + (to.y - from.y) * t;
    if (t >= 1) return;
    await new Promise((r) => requestAnimationFrame(r));
  }
}

function unitName(v: RunView, id: string): string {
  return v.display.get(id)?.name ?? v.state.units.find((u) => u.id === id)?.name ?? id;
}

async function animate(v: RunView, events: GameEvent[]): Promise<void> {
  for (const ev of events) {
    if (view !== v) return;
    const u = 'unitId' in ev ? v.display.get(ev.unitId) : undefined;
    switch (ev.type) {
      case 'move':
        if (u) for (const step of ev.path) await slide(u, step, 110);
        break;
      case 'jump':
        if (u) await slide(u, ev.to, 180);
        break;
      case 'push':
        if (u) await slide(u, ev.to, 160);
        break;
      case 'cast':
        v.log.push(`Archer lance ${getSpell(ev.spellId).name}`);
        await wait(120);
        break;
      case 'attack': {
        const atk = getMonster(v.state.units.find((x) => x.id === ev.unitId)?.templateId ?? '').attacks.find((a) => a.id === ev.attackId);
        v.log.push(`${unitName(v, ev.unitId)} utilise ${atk?.name ?? ev.attackId}`);
        await wait(150);
        break;
      }
      case 'damage':
        if (u) {
          u.hp -= ev.amount;
          if (ev.source === 'burn') u.burning = true;
          v.floats.push({ x: u.x, y: u.y, text: `-${ev.amount}`, color: ev.source === 'collision' ? '#ffffff' : ELEMENT_COLORS[ev.element], born: performance.now() });
        }
        v.log.push(`${unitName(v, ev.unitId)} perd ${ev.amount} PV${ev.source === 'burn' ? ' (brûlure)' : ev.source === 'collision' ? ' (collision)' : ''}`);
        await wait(140);
        break;
      case 'status':
        if (u) {
          if (ev.text.startsWith('Brûlure')) u.burning = true;
          v.floats.push({ x: u.x, y: u.y, text: ev.text, color: '#f2c14e', born: performance.now() + 150 });
        }
        break;
      case 'concentration':
        if (u === undefined) {
          const p = v.display.get('archer');
          if (p) v.floats.push({ x: p.x, y: p.y, text: `${ev.delta > 0 ? '+' : ''}${ev.delta} Conc.`, color: '#b67ee8', born: performance.now() + 250 });
        }
        break;
      case 'death':
        v.log.push(`${unitName(v, ev.unitId)} est vaincu`);
        if (u) {
          for (let a = 1; a >= 0; a -= 0.1) {
            u.alpha = a;
            await wait(25);
          }
          u.alive = false;
        }
        break;
      case 'roomCleared':
        await wait(400);
        break;
      case 'roomEnter':
        v.log.push(`Entrée : ${ev.name}`);
        v.displayRoom = v.state.room;
        v.display = buildDisplay(v.state);
        await wait(200);
        break;
      case 'turnStart':
        if (ev.unitId === 'archer') v.log.push(`— Tour ${ev.turn} —`);
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function drawBoard(): void {
  if (!view) return;
  const v = view;
  const highlights: Highlight[] = [];
  let path: Pos[] = [];
  const canPlay = !v.busy && v.state.status === 'playing';

  if (canPlay && v.selectedSpell) {
    for (const c of getSpellRange(v.state, v.selectedSpell)) {
      highlights.push({ pos: c.pos, color: c.los ? 'rgba(74, 163, 223, 0.35)' : 'rgba(120, 120, 140, 0.35)' });
    }
    if (v.hover && !getCastError(v.state, v.selectedSpell, v.hover)) {
      for (const z of getSpellZone(v.state, v.selectedSpell, v.hover)) highlights.push({ pos: z, color: 'rgba(232, 100, 60, 0.6)' });
    }
  } else if (canPlay) {
    const reach = getReachableCells(v.state);
    for (const p of reach.values()) highlights.push({ pos: p[p.length - 1], color: 'rgba(108, 192, 112, 0.22)' });
    if (v.hover) path = reach.get(key(v.hover)) ?? [];
  }

  const now = performance.now();
  v.floats = v.floats.filter((f) => now - f.born < 1300);
  draw(v.ctx, {
    room: v.displayRoom,
    units: [...v.display.values()].filter((u) => u.alive),
    highlights,
    path,
    hover: v.hover,
    floats: v.floats,
    now,
  });
}

function updateClock(): void {
  if (!view) return;
  const el = document.getElementById('clock');
  if (el) el.textContent = `⏱ ${formatTime((view.endedAt ?? performance.now()) - view.startedAt)}`;
}

function renderHud(): void {
  if (!view) return;
  const { state } = view;
  const player = getPlayer(state);
  const p = state.player;
  document.getElementById('room')!.textContent = `Salle ${state.roomIndex + 1}/${getDungeon(state.config.dungeonId).rooms.length} · ${state.room.name}`;
  document.getElementById('turn')!.textContent = `Tour ${state.turn} · Difficulté ${state.config.difficulty}`;

  document.getElementById('hud')!.innerHTML = `
    <div style="display:flex;justify-content:space-between"><b>Archer</b><span>${player.hp} / ${player.maxHp} PV</span></div>
    <div class="bar"><div style="width:${(100 * player.hp) / player.maxHp}%;background:var(--hp)"></div></div>
    <div class="stats">
      <div class="stat" style="color:var(--pa)"><b>${player.pa}</b>PA</div>
      <div class="stat" style="color:var(--pm)"><b>${player.pm}</b>PM</div>
      <div class="stat" style="color:var(--conc)"><b>${p.concentration}</b>Conc.</div>
    </div>
    <div class="conc">${Array.from({ length: MAX_CONCENTRATION }, (_, i) => `<div class="${i < p.concentration ? 'on' : ''}"></div>`).join('')}</div>
    ${p.nextShotDouble ? '<span class="badge">Prochain tir ×2</span>' : ''}`;

  const bar = document.getElementById('spellbar')!;
  bar.innerHTML = p.deck
    .map((id, i) => {
      const s = getSpell(id);
      const err = getCastError(state, id);
      const uses = state.player.spellUses[id] ?? 0;
      return `<button class="spell-btn ${view!.selectedSpell === id ? 'active' : ''}" data-spell="${id}" ${err || view!.busy ? 'disabled' : ''} title="${s.description}${err ? `\n${err}` : ''}">
        <div class="k">${i + 1} · <span class="el el-${s.element}"></span>${ELEMENT_LABEL[s.element]}</div>
        <div class="n">${s.name}</div>
        <div class="c">${s.pa} PA${s.concentrationCost ? ` · ${s.concentrationCost} Conc.` : ''}${s.maxPerTurn ? ` · ${uses}/${s.maxPerTurn}` : ''}</div>
      </button>`;
    })
    .join('');
  bar.querySelectorAll<HTMLButtonElement>('.spell-btn').forEach((b) =>
    b.addEventListener('click', () => selectSpell(view!.selectedSpell === b.dataset.spell ? null : b.dataset.spell!)),
  );
  (document.getElementById('end-turn') as HTMLButtonElement).disabled = view.busy || state.status !== 'playing';
  document.getElementById('log')!.innerHTML = view.log
    .slice(-60)
    .reverse()
    .map((l) => `<div>${l}</div>`)
    .join('');
}

const BEHAVIOR_LABEL: Record<MonsterBehavior, string> = { aggressive: 'Fonce sur vous', kiter: 'Garde ses distances', sentinel: 'Immobile' };

function attackEffects(a: MonsterAttack): string {
  const fx: string[] = [];
  if (!a.los) fx.push('en cloche');
  if (a.burn) fx.push(`brûlure ${a.burn.damage} × ${a.burn.turns}`);
  if (a.pmRemoval) fx.push(`−${a.pmRemoval} PM`);
  if (a.push) fx.push(`pousse de ${a.push}`);
  return fx.length ? ` (${fx.join(', ')})` : '';
}

function renderTarget(): void {
  if (!view) return;
  const el = document.getElementById('target');
  if (!el || !view.hover) return;
  const u = unitAt(view.state.units, view.hover);
  if (!u || u.team !== 'monster') return;
  const t = getMonster(u.templateId);
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between"><b>${u.name}</b><span>${u.hp} / ${u.maxHp} PV</span></div>
    <div class="muted">${BEHAVIOR_LABEL[monsterBehavior(t)]}</div>
    <div class="bar"><div style="width:${(100 * u.hp) / u.maxHp}%;background:var(--hp)"></div></div>
    <div class="muted">Faiblesse : <span class="el el-${t.weakness}"></span>${ELEMENT_LABEL[t.weakness]} (+30 %) · Résistance : <span class="el el-${t.resistance}"></span>${ELEMENT_LABEL[t.resistance]} (−20 %)</div>
    <div class="muted" style="margin-top:6px">${t.attacks.map((a) => `${a.name} : ${a.damage} dégâts, ${rangeLabel(a.minRange, a.maxRange)}${attackEffects(a)}`).join('<br>')}</div>
    ${t.description ? `<div class="muted" style="margin-top:6px"><i>${t.description}</i></div>` : ''}
    <div class="muted" style="margin-top:6px">${u.pm} PM${u.pmMalus ? ` (−${u.pmMalus} au prochain tour)` : ''}${u.burn ? ` · Brûlure ${u.burn.damage} × ${u.burn.turns}` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Fin de run
// ---------------------------------------------------------------------------

function finishRun(v: RunView): void {
  v.busy = true; // plus aucune action possible sous l'écran de fin (abandon compris)
  v.endedAt = performance.now();
  updateClock();
  const won = v.state.status === 'won';
  const abandoned = v.state.status === 'playing';
  const timeMs = Math.round(v.endedAt - v.startedAt);
  // Même vérification que celle que fera le serveur : on rejoue la suite d'actions.
  const check = won ? verifyRun(v.config, v.state.actionLog, v.state.turn) : null;
  if (won && check?.valid) {
    save.scores.push({ dungeonId: v.config.dungeonId, difficulty: v.config.difficulty, turns: v.state.turn, timeMs, date: new Date().toISOString(), deck: v.config.deck });
    save.scores = save.scores.sort(compareScores).slice(0, 50);
    writeSave(save);
  }
  // Butin : uniquement pour une victoire au replay validé.
  const loot = won && check?.valid ? grantBossLoot(v.config) : [];
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
    <div class="card${loot.length ? ' with-loot' : ''}">
      <h2 class="${won ? 'ok' : 'ko'}">${won ? 'Donjon terminé !' : abandoned ? 'Run abandonné' : 'Défaite'}</h2>
      <p>Difficulté ${v.config.difficulty} · ${v.state.turn} tours · ${formatTime(timeMs)}</p>
      ${check ? `<p class="${check.valid ? 'ok' : 'ko'}">${check.valid ? '✓ Replay validé (même moteur que le serveur)' : `✗ Replay invalide : ${check.reason}`}</p>` : `<p class="muted">Salle ${v.state.roomIndex + 1} atteinte.</p>`}
      ${loot.length ? lootPanelHtml(loot, v.config) : ''}
      <div class="row">
        <button class="primary" id="again">Rejouer</button>
        <button class="secondary" id="equipment">Équipement</button>
        <button class="secondary" id="back">Préparation</button>
        <button class="secondary" id="copy">Copier le replay</button>
      </div>
    </div>`;
  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'end-sections';
  sections.forEach((el) => sectionsEl.appendChild(el));
  // XP d'abord, puis le butin du boss.
  overlay.querySelector('.card')!.insertBefore(sectionsEl, overlay.querySelector('.loot') ?? overlay.querySelector('.row'));
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
    view = null;
    openEquipment();
  });
  overlay.querySelector('#back')!.addEventListener('click', () => {
    overlay.remove();
    view = null;
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
