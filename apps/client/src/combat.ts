/**
 * Écran de combat : plateau, barre de sorts, informations et aperçus.
 * Toutes les informations viennent du moteur (fonctions de lecture de `preview.ts`) : l'écran ne
 * réimplémente aucune règle.
 */
import {
  MAX_CONCENTRATION,
  PLAYER_ID,
  applyAction,
  combinePassives,
  combinedThreat,
  spellConcentrationCost,
  spellConcentrationLoss,
  spellMaxRange,
  equipmentRange,
  getCastError,
  getDungeon,
  getMonster,
  getPlayer,
  getReachableCells,
  getSpell,
  getSpellRange,
  getTranche,
  key,
  monsterThreatZone,
  previewCastDetailed,
  previewEnemyTurn,
  samePos,
  turnOrder,
  unitAt,
  willGainConcentrationNextTurn,
  type Action,
  type EnemyTurnPreview,
  type GameEvent,
  type Pos,
  type RoomState,
  type RunConfig,
  type RunState,
  type ThreatZone,
  type Unit,
} from '@chabfu/engine';
import { slotFromKey, slotKeyLabel } from './keys';
import { getCharacter } from './character/store';
import { assetUrl, spellIconImg, unitPortraitImg } from './ui/assets';
import { ELEMENT_LABEL, el, esc, monsterCard } from './info';
import { castTargetCard, spellSheet } from './spell-info';
import {
  CANVAS_H,
  CANVAS_W,
  ELEMENT_COLORS,
  draw,
  toCell,
  unitColor,
  type Arrow,
  type DisplayUnit,
  type FloatingText,
  type Ghost,
  type Highlight,
  type HpPreview,
  type Marker,
  type Projectile,
  type Scene,
} from './render';
import { icon } from './ui/icons';
import { confirmModal, openSheet, toast, type SheetHandle } from './ui/components';
import { getSettings } from './ui/settings';
import { sfx } from './ui/sfx';
import { banner } from './ui/components';
import './combat.css';

export interface RunHooks {
  onExit(): void;
  onFinish(config: RunConfig, state: RunState, timeMs: number): void;
}

interface LogEntry {
  cls: string;
  html: string;
}

interface Overlay {
  highlights: Highlight[];
  path: Pos[];
  markers: Marker[];
  arrows: Arrow[];
  ghosts: Ghost[];
  focus: { id: string; color: string }[];
  intents: Map<string, { text: string; color: string }>;
  tooltip: string | null;
  inspector: string;
  /** Concentration prévue après l'action survolée. */
  concPreview: number | null;
  concReason: string | null;
  /** PV prévus après le sort visé, par unité (barres de vie du plateau). */
  hpPreview: Map<string, HpPreview>;
}

interface Analysis {
  enemy: EnemyTurnPreview | null;
  zones: Map<string, ThreatZone>;
  combined: ReturnType<typeof combinedThreat> | null;
  reach: Map<string, Pos[]>;
}

interface RunView {
  config: RunConfig;
  hooks: RunHooks;
  state: RunState;
  stateId: number;
  analysis: Analysis;
  displayRoom: RoomState;
  display: Map<string, DisplayUnit>;
  floats: FloatingText[];
  projectiles: Projectile[];
  log: LogEntry[];
  selectedSpell: string | null;
  hoverSpell: string | null;
  hover: Pos | null;
  mouse: { x: number; y: number } | null;
  pinned: string | null;
  focusUnit: string | null;
  showThreat: boolean;
  hoverEndTurn: boolean;
  /** Toucher : case visée en attente de confirmation (second toucher ou bouton Confirmer). */
  pending: Pos | null;
  /** Fiche ouverte au toucher sur le joueur. */
  showPlayer: boolean;
  acting: string | null;
  busy: boolean;
  startedAt: number;
  endedAt: number | null;
  board: BoardRenderer | null;
  overlayKey: string;
  layoutKey: string;
  overlay: Overlay | null;
}

const app = document.getElementById('app')!;
let view: RunView | null = null;
let frame = 0;

const COLORS = {
  move: 'rgba(111, 191, 79, 0.32)',
  range: 'rgba(74, 163, 223, 0.35)',
  rangeNoLos: 'rgba(110, 110, 130, 0.35)',
  zone: 'rgba(232, 100, 60, 0.6)',
  enemyMove: 'rgba(242, 160, 60, 0.28)',
  threat: '#d8453c',
  pinned: '#d6a956',
  focus: '#ffffff',
};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

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
      pmMalus: u.pmMalus,
    });
  }
  return map;
}

function analyse(state: RunState): Analysis {
  const playing = state.status === 'playing';
  return {
    enemy: playing ? previewEnemyTurn(state) : null,
    zones: new Map(),
    combined: null,
    reach: playing ? getReachableCells(state) : new Map(),
  };
}

function zoneOf(v: RunView, id: string): ThreatZone {
  let z = v.analysis.zones.get(id);
  if (!z) {
    z = monsterThreatZone(v.state, id);
    v.analysis.zones.set(id, z);
  }
  return z;
}

interface BoardRenderer {
  canvas: HTMLCanvasElement;
  /** Coordonnées en px CSS relatives au conteneur du plateau. */
  screenToScene(x: number, y: number): { x: number; y: number };
  render(scene: Scene): void;
  destroy(): void;
  setInsets?(i: { top: number; right: number; bottom: number; left: number }): void;
  zoomAt?(factor: number, cx: number, cy: number): void;
  panBy?(dx: number, dy: number): void;
  resetView?(): void;
  readonly zoomed?: boolean;
  shake?(amp: number, ms?: number): void;
  burst?(cell: Pos, color: string, count?: number, power?: number): void;
}

let currentBoard: BoardRenderer | null = null;

/** Plateau PixiJS (WebGL) ; repli sur le rendu canvas 2D si WebGL est indisponible. */
async function createBoard(wrap: HTMLElement): Promise<BoardRenderer> {
  const placeholder = wrap.querySelector('#board') as HTMLCanvasElement;
  try {
    const { PixiBoard } = await import('./board/pixi-board');
    placeholder.remove();
    return await PixiBoard.create(wrap);
  } catch (e) {
    console.warn('PixiJS indisponible, rendu canvas 2D', e);
    if (!placeholder.isConnected) wrap.prepend(placeholder);
    const dpr = window.devicePixelRatio || 1;
    placeholder.width = CANVAS_W * dpr;
    placeholder.height = CANVAS_H * dpr;
    placeholder.classList.add('cb-fallback');
    const ctx = placeholder.getContext('2d')!;
    ctx.scale(dpr, dpr);
    toast('Affichage simplifié : WebGL indisponible sur cet appareil.', 'info', 4000);
    const toScene = (x: number, y: number) => {
      const r = placeholder.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      return { x: ((x - (r.left - wr.left)) / r.width) * CANVAS_W, y: ((y - (r.top - wr.top)) / r.height) * CANVAS_H };
    };
    return { canvas: placeholder, render: (scene) => draw(ctx, scene), destroy: () => undefined, screenToScene: toScene };
  }
}

/** Quitte l'écran de combat (arrête la boucle d'affichage). */
export function leaveRun(): void {
  view = null;
  cancelAnimationFrame(frame);
  currentBoard?.destroy();
  currentBoard = null;
}

export function startRun(config: RunConfig, state: RunState, hooks: RunHooks): void {
  app.innerHTML = `
    <div class="cb" style="--scene-art: url('${assetUrl(`dungeons/${config.dungeonId}.webp`)}')">
      <div class="cb-stage" id="board-wrap">
        <canvas id="board" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
        <div class="cursor-tip" id="cursor-tip" hidden></div>
      </div>
      <header class="cb-top">
        <div class="cb-where"><span class="cb-pill" id="room"></span><span class="cb-pill" id="turn"></span></div>
        <div class="cb-order turn-order" id="turn-order" aria-label="Ordre des tours"></div>
        <div class="cb-tr">
          <span class="cb-pill num" id="clock"></span>
          <button class="ui-icon-btn" id="open-log" aria-label="Journal du combat">${icon('logbook')}</button>
          <button class="ui-icon-btn" id="open-menu" aria-label="Pause">${icon('pause')}</button>
        </div>
      </header>
      <div class="cb-tools">
        <button class="ui-icon-btn" id="toggle-threat" aria-pressed="false" aria-label="Zones de menace : cases où les ennemis peuvent vous toucher à leur prochain tour">${icon('eye')}<kbd>T</kbd></button>
        <button class="ui-icon-btn" id="reset-view" aria-label="Recadrer le plateau" hidden>${icon('target')}</button>
      </div>
      <aside class="cb-info" id="info-panel" hidden aria-live="polite">
        <button class="ui-icon-btn ui-icon-btn--sm cb-info-close" id="info-close" aria-label="Fermer la fiche">${icon('close')}</button>
        <div class="inspector" id="inspector"></div>
      </aside>
      <div class="cb-confirm" id="confirm-bar" hidden>
        <button class="ui-btn ui-btn--danger ui-btn--sm" id="confirm-cancel" aria-label="Annuler">${icon('close')}</button>
        <button class="ui-btn ui-btn--primary" id="confirm-go"></button>
      </div>
      <footer class="cb-dock">
        <div class="cb-player" id="hud"></div>
        <div class="cb-spells">
          <div class="spellbar" id="spellbar"></div>
          <div class="spell-tip" id="spell-tip" hidden></div>
        </div>
        <div class="cb-end">
          <div class="end-preview" id="end-preview"></div>
          <button class="ui-btn ui-btn--primary cb-endturn" id="end-turn"><span>Fin du tour</span><kbd>Espace</kbd></button>
        </div>
      </footer>
    </div>`;

  cancelAnimationFrame(frame);
  currentBoard?.destroy();
  currentBoard = null;

  view = {
    config,
    hooks,
    state,
    stateId: 0,
    analysis: analyse(state),
    displayRoom: state.room,
    display: buildDisplay(state),
    floats: [],
    projectiles: [],
    log: [
      { cls: 'turn', html: `Tour ${state.turn}` },
      { cls: 'room', html: `Entrée : ${esc(state.room.name)}` },
    ],
    selectedSpell: null,
    hoverSpell: null,
    hover: null,
    mouse: null,
    pinned: null,
    focusUnit: null,
    showThreat: false,
    hoverEndTurn: false,
    pending: null,
    showPlayer: false,
    acting: null,
    busy: false,
    startedAt: performance.now(),
    endedAt: null,
    board: null,
    overlayKey: '',
    layoutKey: '',
    overlay: null,
  };

  const wrap = app.querySelector('#board-wrap') as HTMLElement;
  const v0 = view;
  void createBoard(wrap).then((board) => {
    if (view !== v0) {
      board.destroy();
      return;
    }
    currentBoard = board;
    v0.board = board;
    bindBoardEvents(board.canvas, wrap);
    if (v0.state.roomIndex === 0) void roomBanner(v0.state);
  });

    if (!view) return;
  const endBtn = app.querySelector('#end-turn') as HTMLButtonElement;
  // Appui long sur « Fin du tour » (ou survol à la souris) : montre ce que feront les ennemis, sans finir le tour.
  let endHold = 0;
  let endHeld = false;
  endBtn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    endHeld = false;
    endHold = window.setTimeout(() => {
      endHeld = true;
      if (view) view.hoverEndTurn = true;
      vibrate(12);
    }, 380);
  });
  const endRelease = () => {
    clearTimeout(endHold);
    if (view && endHeld) setTimeout(() => view && (view.hoverEndTurn = false), 50);
  };
  endBtn.addEventListener('pointerup', endRelease);
  endBtn.addEventListener('pointercancel', endRelease);
  endBtn.addEventListener('click', (e) => {
    if (endHeld) {
      endHeld = false;
      e.preventDefault();
      return;
    }
    act({ type: 'endTurn' });
  });
  endBtn.addEventListener('mouseenter', () => view && (view.hoverEndTurn = true));
  endBtn.addEventListener('mouseleave', () => view && (view.hoverEndTurn = false));
  app.querySelector('#toggle-threat')!.addEventListener('click', toggleThreat);
  app.querySelector('#reset-view')!.addEventListener('click', () => {
    view?.board?.resetView?.();
    updateResetButton();
  });
  app.querySelector('#open-menu')!.addEventListener('click', openPauseMenu);
  app.querySelector('#open-log')!.addEventListener('click', openLog);
  app.querySelector('#info-close')!.addEventListener('click', clearSelection);
  app.querySelector('#confirm-cancel')!.addEventListener('click', clearSelection);
  app.querySelector('#confirm-go')!.addEventListener('click', () => {
    if (view?.pending) commitCell(view.pending);
  });

  // Infobulles de la barre de sorts (délégation : la barre est reconstruite à chaque changement).
  const bar = app.querySelector('#spellbar') as HTMLElement;
  bar.addEventListener('mouseover', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.spell-btn');
    if (!view || !b) return;
    view.hoverSpell = b.dataset.spell!;
    showSpellTip(b);
  });
  bar.addEventListener('mouseleave', () => {
    if (!view) return;
    view.hoverSpell = null;
    (document.getElementById('spell-tip') as HTMLElement).hidden = true;
  });
  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.spell-btn');
    if (!view || !b || b.disabled || view.busy) return;
    const id = b.dataset.spell!;
    const err = getCastError(view.state, id);
    if (err) {
      toast(esc(err), 'error', 1800);
      vibrate(8);
      return;
    }
    view.pending = null;
    selectSpell(view.selectedSpell === id ? null : id);
  });

  const order = app.querySelector('#turn-order') as HTMLElement;
  order.addEventListener('mouseover', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.to-chip');
    if (view) view.focusUnit = c?.dataset.unit ?? null;
  });
  order.addEventListener('mouseleave', () => view && (view.focusUnit = null));
  order.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.to-chip');
    if (!view || !c) return;
    if (c.dataset.unit === PLAYER_ID) {
      view.showPlayer = !view.showPlayer;
      view.pinned = null;
    } else view.pinned = view.pinned === c.dataset.unit ? null : c.dataset.unit!;
    view.pending = null;
    renderSelection();
  });

  renderHud();
  const loop = () => {
    if (!view) return;
    refreshOverlay();
    drawBoard();
    updateClock();
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}


function bindBoardEvents(canvas: HTMLCanvasElement, wrap: HTMLElement): void {
  const local = (e: { clientX: number; clientY: number }) => {
    const wr = wrap.getBoundingClientRect();
    return { x: e.clientX - wr.left, y: e.clientY - wr.top };
  };
  const cellAt = (e: { clientX: number; clientY: number }): Pos | null => {
    if (!view?.board) return null;
    const l = local(e);
    const sp = view.board.screenToScene(l.x, l.y);
    return toCell(view.displayRoom, sp.x, sp.y);
  };
  canvas.style.touchAction = 'none';

  // --- Souris : survol = aperçu, clic = action directe ---
  canvas.addEventListener('pointermove', (e) => {
    if (!view || e.pointerType !== 'mouse') return;
    view.hover = cellAt(e);
    view.mouse = local(e);
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (!view || e.pointerType !== 'mouse') return;
    view.hover = null;
    view.mouse = null;
  });
  canvas.addEventListener('wheel', (e) => {
    if (!view?.board?.zoomAt) return;
    e.preventDefault();
    const l = local(e);
    view.board.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, l.x, l.y);
    updateResetButton();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearSelection();
  });

  // --- Toucher : toucher = viser / aperçu, second toucher ou « Confirmer » = action ; appui long = fiche ; pincer = zoom ---
  const pts = new Map<number, { x: number; y: number }>();
  let tap: { x: number; y: number; t: number; moved: boolean } | null = null;
  let hold = 0;
  let pinch: { d: number; mx: number; my: number } | null = null;
  const dist = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!view) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      const c = cellAt(e);
      if (c) onCellClick(c);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    clearTimeout(hold);
    if (pts.size === 2) {
      tap = null;
      pinch = dist();
      return;
    }
    tap = { ...local(e), t: performance.now(), moved: false };
    const start = e;
    hold = window.setTimeout(() => {
      if (!view || !tap || tap.moved) return;
      tap = null;
      const c = cellAt(start);
      if (c) inspectCell(c);
    }, 420);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!view || e.pointerType === 'mouse' || !pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId)!;
    const now = local(e);
    pts.set(e.pointerId, now);
    if (pinch && pts.size >= 2) {
      const d = dist();
      view.board?.zoomAt?.(d.d / pinch.d, d.mx, d.my);
      view.board?.panBy?.(d.mx - pinch.mx, d.my - pinch.my);
      pinch = d;
      updateResetButton();
      return;
    }
    if (tap && Math.hypot(now.x - tap.x, now.y - tap.y) > 10) {
      tap.moved = true;
      clearTimeout(hold);
    }
    // Un doigt qui glisse déplace le plateau quand il est zoomé.
    if (tap?.moved && view.board?.zoomed) view.board.panBy?.(now.x - prev.x, now.y - prev.y);
  });
  const up = (e: PointerEvent) => {
    if (!view || e.pointerType === 'mouse') return;
    pts.delete(e.pointerId);
    clearTimeout(hold);
    if (pts.size < 2) pinch = null;
    if (e.type === 'pointerup' && tap && !tap.moved && pts.size === 0) {
      const c = cellAt(e);
      if (c) onCellTap(c);
      else clearSelection();
    }
    if (pts.size === 0) tap = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}

window.addEventListener('keydown', (e) => {
  if (!view) return;
  if (e.code === 'Space') {
    e.preventDefault();
    act({ type: 'endTurn' });
  } else if (e.key === 'Escape') {
    if (document.querySelector('.ui-sheet.is-open, .ui-modal-scrim')) return;
    clearSelection();
  } else if (e.key === 't' || e.key === 'T') {
    toggleThreat();
  } else if (slotFromKey(e) >= 0) {
    const id = view.state.player.deck[slotFromKey(e)];
    if (id) {
      e.preventDefault();
      selectSpell(view.selectedSpell === id ? null : id);
    }
  }
});

function toggleThreat(): void {
  if (!view) return;
  view.showThreat = !view.showThreat;
  const b = document.getElementById('toggle-threat');
  b?.classList.toggle('is-on', view.showThreat);
  b?.setAttribute('aria-pressed', String(view.showThreat));
}

// ---------------------------------------------------------------------------
// Menu pause et journal
// ---------------------------------------------------------------------------

let logSheet: SheetHandle | null = null;

function openLog(): void {
  if (!view) return;
  logSheet = openSheet({ title: 'Journal du combat', html: '<div class="log" id="log"></div>', cls: 'cb-log-sheet', modeless: true, onClose: () => (logSheet = null) });
  renderLog();
}

function openPauseMenu(): void {
  if (!view) return;
  const v = view;
  const speed = getSettings().speed;
  const sheet = openSheet({
    title: 'Pause',
    html: `<div class="cb-menu">
      <button class="ui-btn ui-btn--primary ui-btn--block" data-m="resume">${icon('forward')} Reprendre</button>
      <button class="ui-btn ui-btn--blue ui-btn--block" data-m="legend">${icon('help')} Lire le plateau</button>
      <p class="cb-menu-note">Vitesse des animations : ×${speed} · réglable dans les paramètres</p>
      <button class="ui-btn ui-btn--danger ui-btn--block" data-m="quit">${icon('flag')} Abandonner le run</button>
    </div>`,
  });
  sheet.body.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (!b) return;
    if (b.dataset.m === 'resume') sheet.close();
    else if (b.dataset.m === 'legend') sheet.setContent(legendHtml(), 'Lire le plateau');
    else if (b.dataset.m === 'quit') {
      sheet.close();
      if (view !== v || v.busy) return;
      if (v.state.actionLog.length === 0) {
        leaveRun();
        v.hooks.onExit();
        return;
      }
      const ok = await confirmModal({ title: 'Abandonner le run ?', text: 'Vous gardez l’XP des monstres déjà vaincus. Le run ne compte pas au classement.', confirm: 'Abandonner', danger: true });
      if (!ok || view !== v || v.busy) return;
      v.busy = true;
      v.endedAt = performance.now();
      updateClock();
      v.hooks.onFinish(v.config, v.state, Math.round(v.endedAt - v.startedAt));
    }
  });
}

function legendHtml(): string {
  const row = (cls: string, title: string, text: string) => `<li><i class="lg-sw ${cls}"></i><span><b>${title}</b>${text}</span></li>`;
  return `<ul class="cb-legend">
    ${row('move', 'Déplacement', 'Cases atteignables avec vos PM. Chaque PM dépensé fait perdre 1 de Concentration.')}
    ${row('range', 'Portée du sort', 'Cases où vous pouvez lancer le sort choisi.')}
    ${row('nolos', 'Sans ligne de vue', 'À portée, mais un obstacle ou une unité bloque le tir (hachures).')}
    ${row('zone', 'Zone d’effet', 'Cases touchées par le sort sur la cible visée.')}
    ${row('enemy', 'Déplacement ennemi', 'Où le monstre choisi peut aller à son tour.')}
    ${row('threat', 'Menace', 'Cases où les ennemis peuvent vous toucher au prochain tour (bouton œil).')}
  </ul>
  <p class="cb-menu-note">Au doigt : touchez une case pour voir l’aperçu, touchez-la encore (ou « Confirmer ») pour agir. Appui long sur une unité : sa fiche. Pincez pour zoomer.</p>`;
}

function selectSpell(id: string | null): void {
  if (!view || view.busy) return;
  if (id && getSpell(id).target === 'self') {
    if (!getCastError(view.state, id)) act({ type: 'cast', spellId: id, target: getPlayer(view.state).pos });
    return;
  }
  view.selectedSpell = id && !getCastError(view.state, id) ? id : null;
  sfx(view.selectedSpell ? 'select' : 'cancel');
  if (!view.selectedSpell) view.pending = null;
  renderHud();
  renderSelection();
}

/** Clic souris : action directe (le survol a déjà montré l'aperçu). */
function onCellClick(cell: Pos): void {
  if (!view || view.busy) return;
  view.showPlayer = false;
  commitCell(cell);
}

/** Exécute l'action sur la case : lancer le sort armé, épingler un monstre ou se déplacer. */
function commitCell(cell: Pos): void {
  if (!view || view.busy) return;
  view.pending = null;
  if (view.selectedSpell) {
    const err = getCastError(view.state, view.selectedSpell, cell);
    if (!err) act({ type: 'cast', spellId: view.selectedSpell, target: cell });
    else {
      toast(esc(err), 'error', 1600);
      vibrate(8);
    }
    return;
  }
  const u = unitAt(view.state.units, cell);
  if (u && u.team === 'monster') {
    view.pinned = view.pinned === u.id ? null : u.id;
    renderSelection();
    return;
  }
  if (view.analysis.reach.has(key(cell))) act({ type: 'move', to: cell });
}

/** Toucher : premier toucher = aperçu (et bouton Confirmer), second toucher sur la même case = action. */
function onCellTap(cell: Pos): void {
  if (!view || view.busy) return;
  const v = view;
  const same = v.pending && samePos(v.pending, cell);
  const u = unitAt(v.state.units, cell);
  if (v.selectedSpell) {
    if (same) return commitCell(cell);
    v.pending = cell;
    v.hover = cell;
    vibrate(6);
    renderSelection();
    return;
  }
  if (u && u.team === 'monster') {
    v.pending = null;
    v.hover = null;
    v.showPlayer = false;
    v.pinned = v.pinned === u.id ? null : u.id;
    vibrate(6);
    renderSelection();
    return;
  }
  if (u && u.id === PLAYER_ID) {
    v.pending = null;
    v.hover = null;
    v.pinned = null;
    v.showPlayer = !v.showPlayer;
    renderSelection();
    return;
  }
  if (v.analysis.reach.has(key(cell))) {
    if (same) return commitCell(cell);
    v.pending = cell;
    v.hover = cell;
    v.pinned = null;
    v.showPlayer = false;
    vibrate(6);
    renderSelection();
    return;
  }
  clearSelection();
}

/** Appui long : fiche de l'unité, sans rien jouer. */
function inspectCell(cell: Pos): void {
  if (!view) return;
  const u = unitAt(view.state.units, cell);
  if (!u) return;
  vibrate(15);
  view.pending = null;
  if (u.id === PLAYER_ID) {
    view.showPlayer = true;
    view.pinned = null;
  } else view.pinned = u.id;
  view.hover = null;
  renderSelection();
}

function clearSelection(): void {
  if (!view) return;
  view.pending = null;
  view.pinned = null;
  view.showPlayer = false;
  if (!view.mouse) view.hover = null;
  if (view.selectedSpell) selectSpell(null);
  else renderSelection();
}

/** Bannière d'entrée de salle (le boss a la sienne). */
function roomBanner(state: RunState): Promise<void> {
  const rooms = getDungeon(state.config.dungeonId).rooms.length;
  const boss = state.roomIndex === rooms - 1;
  sfx(boss ? 'boss' : 'room');
  return banner(boss ? 'Boss !' : state.room.name, boss ? state.room.name : `Salle ${state.roomIndex + 1} / ${rooms}`, boss ? 1400 : 1000);
}

/** Signal bref « À vous ! » au début de chaque tour du joueur. */
function yourTurn(): void {
  const host = document.querySelector('.cb');
  if (!host) return;
  host.querySelector('.cb-yourturn')?.remove();
  const el = document.createElement('div');
  el.className = 'cb-yourturn';
  el.textContent = 'À vous !';
  host.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function vibrate(ms: number): void {
  if (getSettings().vibrate) navigator.vibrate?.(ms);
}

function updateResetButton(): void {
  const b = document.getElementById('reset-view');
  if (b) b.hidden = !view?.board?.zoomed;
}

/** Barre de confirmation (toucher) : libellé de l'action en attente. */
function renderSelection(): void {
  if (!view) return;
  const v = view;
  const bar = document.getElementById('confirm-bar');
  const go = document.getElementById('confirm-go') as HTMLButtonElement | null;
  if (!bar || !go) return;
  let label = '';
  let ok = false;
  if (v.pending) {
    if (v.selectedSpell) {
      const err = getCastError(v.state, v.selectedSpell, v.pending);
      ok = !err;
      label = ok ? `Lancer ${getSpell(v.selectedSpell).name}` : (err ?? '');
    } else {
      const path = v.analysis.reach.get(key(v.pending));
      ok = !!path;
      label = path ? `Aller ici (${path.length} PM)` : '';
    }
  }
  bar.hidden = !v.pending && !v.selectedSpell;
  go.hidden = !v.pending;
  go.disabled = !ok;
  go.textContent = label;
  v.overlayKey = '';
}

function act(action: Action): void {
  if (!view || view.busy || view.state.status !== 'playing') return;
  let result: { state: RunState; events: GameEvent[] };
  try {
    result = applyAction(view.state, action);
  } catch (e) {
    view.log.push({ cls: 'warn', html: `${icon('info')} ${esc((e as Error).message)}` });
    renderHud();
    return;
  }
  const v = view;
  v.pending = null;
  v.showPlayer = false;
  renderSelection();
  const before = v.state;
  v.state = result.state;
  v.stateId += 1;
  v.analysis = analyse(v.state);
  v.selectedSpell = null;
  if (v.pinned && !v.state.units.some((u) => u.id === v.pinned && u.hp > 0)) v.pinned = null;
  v.busy = true;
  renderHud();
  void animate(v, before, result.events).then(() => {
    if (view !== v) return;
    v.busy = false;
    v.acting = null;
    v.displayRoom = v.state.room;
    v.display = buildDisplay(v.state);
    renderHud();
    if (v.state.status !== 'playing') {
      v.endedAt = performance.now();
      updateClock();
      v.hooks.onFinish(v.config, v.state, Math.round(v.endedAt - v.startedAt));
    }
  });
}

// ---------------------------------------------------------------------------
// Animation des événements et journal
// ---------------------------------------------------------------------------

/** Vitesse des animations : réglage du joueur, et tours ennemis accélérés pour ne pas faire attendre. */
function animScale(): number {
  const enemy = !!view && view.acting !== null && view.acting !== PLAYER_ID;
  return getSettings().speed * (enemy ? 1.4 : 1);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms / animScale()));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

async function slide(u: DisplayUnit, to: Pos, ms: number): Promise<void> {
  ms /= animScale();
  const from = { x: u.x, y: u.y };
  const start = performance.now();
  while (true) {
    const t = Math.min(1, (performance.now() - start) / ms);
    u.x = from.x + (to.x - from.x) * t;
    u.y = from.y + (to.y - from.y) * t;
    if (t >= 1) return;
    await nextFrame();
  }
}

async function lunge(u: DisplayUnit, target: DisplayUnit | undefined): Promise<void> {
  if (!target) return;
  // Direction écran approximative (iso) vers la cible.
  const sx = (target.x - target.y - (u.x - u.y)) * 32;
  const sy = (target.x + target.y - (u.x + u.y)) * 16;
  const len = Math.hypot(sx, sy) || 1;
  const start = performance.now();
  while (true) {
    const t = Math.min(1, (performance.now() - start) / 220);
    const k = Math.sin(Math.PI * t) * 12;
    u.dx = (sx / len) * k;
    u.dy = (sy / len) * k;
    if (t >= 1) break;
    await nextFrame();
  }
  u.dx = 0;
  u.dy = 0;
}

async function shoot(v: RunView, from: Pos, to: Pos, color: string): Promise<void> {
  const duration = (120 + Math.hypot(to.x - from.x, to.y - from.y) * 40) / animScale();
  v.projectiles.push({ from: { ...from }, to: { ...to }, color, born: performance.now(), duration });
  await wait(duration);
}

function unitName(v: RunView, before: RunState, id: string): string {
  return v.display.get(id)?.name ?? before.units.find((u) => u.id === id)?.name ?? v.state.units.find((u) => u.id === id)?.name ?? id;
}

async function animate(v: RunView, before: RunState, events: GameEvent[]): Promise<void> {
  const log = (cls: string, html: string) => {
    v.log.push({ cls, html });
    renderLog();
  };
  let lastCause = '';
  let lastTarget: Pos | null = null;
  let lastKill = false;
  const findUnit = (id: string): Unit | undefined => before.units.find((x) => x.id === id) ?? v.state.units.find((x) => x.id === id);
  for (const ev of events) {
    if (view !== v) return;
    const u = 'unitId' in ev ? v.display.get(ev.unitId) : undefined;
    switch (ev.type) {
      case 'turnStart':
        v.acting = ev.unitId;
        renderTurnOrder();
        if (ev.unitId === PLAYER_ID) {
          log('turn', `Tour ${ev.turn}`);
          sfx('turn');
          yourTurn();
          lastCause = 'immobile au tour précédent';
        } else {
          if (u) u.pmMalus = 0;
          log('actor', `Tour de ${esc(unitName(v, before, ev.unitId))}`);
          await wait(120);
        }
        break;
      case 'move':
        if (ev.unitId === PLAYER_ID) {
          log('', `Archer se déplace de ${ev.path.length} case${ev.path.length > 1 ? 's' : ''}`);
          lastCause = 'déplacement';
        }
        if (u)
          for (const step of ev.path) {
            if (ev.unitId === PLAYER_ID) sfx('step');
            await slide(u, step, 110);
          }
        break;
      case 'jump':
        log('', `Archer bondit`);
        if (u) await slide(u, ev.to, 180);
        break;
      case 'push': {
        const n = Math.abs(ev.to.x - ev.from.x) + Math.abs(ev.to.y - ev.from.y);
        log('sub', `${esc(unitName(v, before, ev.unitId))} est poussé de ${n} case${n > 1 ? 's' : ''}`);
        if (u) await slide(u, ev.to, 160);
        break;
      }
      case 'cast': {
        const s = getSpell(ev.spellId);
        lastCause = s.name;
        lastTarget = ev.target;
        log('cast', `Archer lance ${el(s.element)} <b>${s.name}</b>`);
        sfx('cast');
        const p = v.display.get(PLAYER_ID);
        if (p && s.target !== 'self' && !s.jump) await shoot(v, p, ev.target, ELEMENT_COLORS[s.element]);
        else await wait(120);
        break;
      }
      case 'attack': {
        const m = findUnit(ev.unitId);
        const atk = m ? getMonster(m.templateId).attacks.find((a) => a.id === ev.attackId) : undefined;
        log('attack', `${esc(unitName(v, before, ev.unitId))} utilise ${atk ? el(atk.element) : ''} <b>${atk?.name ?? ev.attackId}</b>`);
        const target = v.display.get(ev.targetId);
        if (u) v.floats.push({ x: u.x, y: u.y, text: atk?.name ?? '', color: '#ffffff', born: performance.now(), size: 13 });
        if (u && target) {
          const dist = Math.abs(target.x - u.x) + Math.abs(target.y - u.y);
          if (dist > 1.01) await shoot(v, u, target, atk ? ELEMENT_COLORS[atk.element] : '#fff');
          else await lunge(u, target);
        }
        break;
      }
      case 'damage': {
        if (u) {
          u.hp -= ev.amount;
          u.hitAt = performance.now();
          if (ev.source === 'burn') u.burning = true;
          const col = ev.source === 'collision' ? '#ffffff' : ELEMENT_COLORS[ev.element];
          const big = ev.amount >= 20;
          v.floats.push({ x: u.x, y: u.y, text: `-${ev.amount}`, color: col, born: performance.now(), size: big ? 26 : undefined });
          v.board?.burst?.(u, col, big ? 22 : 12, big ? 1.3 : 1);
          if (ev.unitId === PLAYER_ID) {
            sfx('hurt');
            v.board?.shake?.(big ? 10 : 6);
            vibrate(big ? 60 : 35);
          } else {
            sfx('hit');
            if (big) v.board?.shake?.(4, 180);
            vibrate(10);
          }
        }
        const src = { spell: ELEMENT_LABEL[ev.element], attack: ELEMENT_LABEL[ev.element], burn: 'brûlure', collision: 'collision' }[ev.source];
        const who = ev.unitId === PLAYER_ID ? 'player' : 'enemy';
        log(`sub dmg ${who}`, `${esc(unitName(v, before, ev.unitId))} <b style="color:${ev.source === 'collision' ? '#fff' : ELEMENT_COLORS[ev.element]}">−${ev.amount} PV</b> <span class="muted">(${src})</span>`);
        await wait(140);
        break;
      }
      case 'status': {
        if (u) {
          if (ev.text.startsWith('Brûlure')) u.burning = true;
          const pm = /^-(\d+) PM$/.exec(ev.text);
          if (pm) u.pmMalus += Number(pm[1]);
          v.floats.push({ x: u.x, y: u.y, text: ev.text, color: '#f2c14e', born: performance.now() + 150, size: 14 });
        }
        log('sub', `${esc(unitName(v, before, ev.unitId))} : ${esc(ev.text)}`);
        break;
      }
      case 'concentration': {
        const p = v.display.get(PLAYER_ID);
        if (p) v.floats.push({ x: p.x, y: p.y, text: `${ev.delta > 0 ? '+' : ''}${ev.delta} Conc.`, color: '#b67ee8', born: performance.now() + 250, size: 14 });
        const cause = lastKill ? 'ennemi vaincu' : lastCause === 'Flèche ardente' && ev.delta > 0 && lastTarget ? 'tir à 5 cases ou plus' : lastCause;
        lastKill = false;
        log('sub concl', `Concentration <b>${ev.value - ev.delta} → ${ev.value}</b> <span class="muted">(${esc(cause)})</span>`);
        break;
      }
      case 'death':
        lastKill = true;
        log('death', `${esc(unitName(v, before, ev.unitId))} est vaincu`);
        if (u && ev.unitId !== PLAYER_ID) {
          sfx('kill');
          v.board?.burst?.(u, '#ffe866', 26, 1.5);
          vibrate(20);
          await wait(90); // arrêt sur image : le coup de grâce se sent
        }
        if (u) {
          for (let a = 1; a >= 0; a -= 0.1) {
            u.alpha = a;
            await wait(25);
          }
          u.alive = false;
        }
        break;
      case 'roomCleared':
        log('room', 'Salle vidée');
        await wait(400);
        break;
      case 'roomEnter':
        log('room', `Entrée : ${esc(ev.name)}`);
        v.displayRoom = v.state.room;
        v.display = buildDisplay(v.state);
        await roomBanner(v.state);
        break;
      case 'won':
        log('room', 'Victoire !');
        sfx('victory');
        vibrate(80);
        break;
      case 'lost':
        log('death', 'Défaite');
        sfx('defeat');
        vibrate(120);
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Aperçus et informations (recalculés seulement quand le contexte change)
// ---------------------------------------------------------------------------

function overlayKey(v: RunView): string {
  const h = v.hover ? key(v.hover) : '-';
  return [v.stateId, h, v.selectedSpell, v.hoverSpell, v.pinned, v.focusUnit, v.showThreat, v.hoverEndTurn, v.busy, v.acting, v.pending ? key(v.pending) : '-', v.showPlayer].join('|');
}

function refreshOverlay(): void {
  if (!view) return;
  const k = overlayKey(view);
  if (k !== view.overlayKey) {
    view.overlayKey = k;
    view.overlay = computeOverlay(view);
    renderInspector();
    renderConcentration();
  }
  positionCursorTip();
}

function intentBadges(v: RunView): Map<string, { text: string; color: string }> {
  const out = new Map<string, { text: string; color: string }>();
  if (v.busy || !v.analysis.enemy) return out;
  for (const i of v.analysis.enemy.intents) {
    if (i.diesFromBurn) out.set(i.unitId, { text: 'Brûlure fatale', color: '#f2c14e' });
    else if (i.damageToPlayer) out.set(i.unitId, { text: `−${i.damageToPlayer}`, color: '#ff8a80' });
  }
  return out;
}

function intentArrows(v: RunView, ids: string[], o: Overlay): void {
  for (const i of v.analysis.enemy?.intents ?? []) {
    if (!ids.includes(i.unitId) || !i.path.length || i.diesFromBurn) continue;
    const u = v.state.units.find((x) => x.id === i.unitId)!;
    o.arrows.push({ points: [u.pos, ...i.path], color: 'rgba(255, 170, 90, 0.9)', dashed: true });
    const end = i.path[i.path.length - 1];
    o.ghosts.push({ x: end.x, y: end.y, templateId: u.templateId, team: u.team, isBoss: !!u.isBoss, name: u.name });
  }
}

function playerCard(v: RunView): string {
  const p = getPlayer(v.state);
  const st: string[] = [];
  if (p.burn) st.push(`<span class="chip fire">Brûlure ${p.burn.damage} × ${p.burn.turns}</span>`);
  if (v.state.player.nextShotDouble) st.push('<span class="chip conc">Prochain tir ×2</span>');
  return `<div class="card-head"><b>Archer</b></div>
    <div class="hp-line"><span>${p.hp} / ${p.maxHp} PV</span></div>
    <div class="bar"><div style="width:${(100 * p.hp) / p.maxHp}%;background:var(--hp)"></div></div>
    ${st.length ? `<div class="states">${st.join('')}</div>` : '<p class="muted">Aucun état.</p>'}`;
}

function defaultInspector(): string {
  return `<p class="muted">Survolez un monstre pour voir sa fiche, ses déplacements et ce qu’il fera à son tour. Cliquez dessus pour l’épingler.</p>
    <p class="muted">Survolez un sort pour voir exactement ce qu’il fait. Sort sélectionné, survolez un ennemi pour voir les dégâts, les PV restants et les effets.</p>`;
}

function computeOverlay(v: RunView): Overlay {
  const o: Overlay = {
    highlights: [],
    path: [],
    markers: [],
    arrows: [],
    ghosts: [],
    focus: [],
    intents: intentBadges(v),
    tooltip: null,
    inspector: defaultInspector(),
    concPreview: null,
    concReason: null,
    hpPreview: new Map(),
  };
  const s = v.state;
  if (v.busy || s.status !== 'playing') {
    if (v.acting) o.focus.push({ id: v.acting, color: COLORS.focus });
    o.inspector = '<p class="muted">…</p>';
    return o;
  }
  const player = getPlayer(s);
  const hovered = v.hover ? unitAt(s.units, v.hover) : undefined;
  const hoveredMonster = hovered && hovered.team === 'monster' ? hovered : undefined;
  const intentOf = (id: string) => v.analysis.enemy?.intents.find((i) => i.unitId === id);

  if (v.showThreat) {
    v.analysis.combined ??= combinedThreat(s);
    for (const c of v.analysis.combined.values()) o.highlights.push({ pos: c.pos, color: `rgba(224, 84, 79, ${Math.min(0.5, 0.16 * c.count)})` });
  }

  // Monstre « sujet » : épinglé, survolé (hors visée), ou survolé dans l'ordre des tours.
  const focusMonster = v.focusUnit && v.focusUnit !== PLAYER_ID ? v.focusUnit : null;
  const subjectId = v.pinned ?? (!v.selectedSpell && hoveredMonster ? hoveredMonster.id : null) ?? focusMonster;
  if (v.focusUnit) o.focus.push({ id: v.focusUnit, color: COLORS.focus });
  if (v.pinned) o.focus.push({ id: v.pinned, color: COLORS.pinned });

  const spellId = v.selectedSpell ?? v.hoverSpell;
  if (spellId && getSpell(spellId).target !== 'self') {
    for (const c of getSpellRange(s, spellId)) {
      o.highlights.push(c.los ? { pos: c.pos, color: COLORS.range } : { pos: c.pos, color: COLORS.rangeNoLos, hatch: 'rgba(20, 20, 30, 0.55)' });
    }
  } else if (!v.selectedSpell) {
    for (const p of v.analysis.reach.values()) o.highlights.push({ pos: p[p.length - 1], color: COLORS.move });
  }

  if (subjectId && !v.selectedSpell) {
    const zone = zoneOf(v, subjectId);
    for (const c of zone.move) o.highlights.push({ pos: c, color: COLORS.enemyMove });
    for (const c of zone.threat) o.highlights.push({ pos: c, outline: COLORS.threat });
    intentArrows(v, [subjectId], o);
    const u = s.units.find((x) => x.id === subjectId)!;
    o.inspector = monsterCard(s, u, intentOf(subjectId), v.pinned === subjectId);
  }

  if (v.hoverEndTurn) {
    intentArrows(v, s.units.filter((u) => u.team === 'monster' && u.hp > 0).map((u) => u.id), o);
  }

  if (v.selectedSpell && v.hover) {
    const spell = getSpell(v.selectedSpell);
    const preview = previewCastDetailed(s, v.selectedSpell, v.hover);
    o.tooltip = castTargetCard(s, preview, hovered);
    if (preview.valid) {
      for (const z of preview.zone) o.highlights.push({ pos: z, color: COLORS.zone });
      for (const t of preview.targets) {
        const u = s.units.find((x) => x.id === t.unitId)!;
        o.hpPreview.set(u.id, { hpAfter: t.hpAfter, burn: t.killed || !t.burn ? 0 : t.burn.damage * t.burn.turns, killed: t.killed });
        if (t.killed) o.markers.push({ x: u.pos.x, y: u.pos.y, text: 'Vaincu', color: '#ff6b62', row: 0 });
        else if (t.burnKillsIn) o.markers.push({ x: u.pos.x, y: u.pos.y, text: 'Brûlure fatale', color: '#ff9b4a', row: 0 });
        if (t.push && t.push.cells) {
          o.arrows.push({ points: [t.push.from, t.push.to], color: 'rgba(255, 255, 255, 0.9)' });
          o.ghosts.push({ x: t.push.to.x, y: t.push.to.y, templateId: u.templateId, team: u.team, isBoss: !!u.isBoss, name: u.name });
        }
      }
      if (preview.playerMovedTo) {
        o.ghosts.push({ x: preview.playerMovedTo.x, y: preview.playerMovedTo.y, templateId: player.templateId, team: player.team, isBoss: false, name: player.name });
        o.arrows.push({ points: [player.pos, preview.playerMovedTo], color: 'rgba(216, 255, 216, 0.9)' });
      }
      o.concPreview = preview.concentrationAfter;
      o.concReason = spell.name;
    } else if (preview.error === 'Pas de ligne de vue.') {
      o.arrows.push({ points: [player.pos, v.hover], color: 'rgba(224, 84, 79, 0.9)', dashed: true, head: false, width: 2 });
    }
    o.inspector = hoveredMonster ? monsterCard(s, hoveredMonster, intentOf(hoveredMonster.id), false) : spellSheet(s, v.selectedSpell, { slot: s.player.deck.indexOf(v.selectedSpell) });
  } else if (v.selectedSpell) {
    o.inspector = spellSheet(s, v.selectedSpell, { slot: s.player.deck.indexOf(v.selectedSpell) });
  } else if (v.hover) {
    const path = v.analysis.reach.get(key(v.hover));
    if (path) {
      o.path = path;
      const concAfter = Math.max(0, s.player.concentration - path.length);
      o.concPreview = concAfter;
      o.concReason = `déplacement de ${path.length} PM`;
      o.tooltip = `<b>${path.length} PM</b>${concAfter !== s.player.concentration ? ` · Concentration ${s.player.concentration} → <span class="neg">${concAfter}</span>` : ''}`;
    } else if (hovered?.id === PLAYER_ID && !subjectId) {
      o.inspector = playerCard(v);
    }
  }
  if (v.showPlayer && !v.selectedSpell && !subjectId) o.inspector = playerCard(v);
  if (!o.tooltip && hoveredMonster && !v.selectedSpell) {
    o.tooltip = `<b>${esc(hoveredMonster.name)}</b> · ${hoveredMonster.hp}/${hoveredMonster.maxHp} PV`;
  }
  return o;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function drawBoard(): void {
  if (!view) return;
  const v = view;
  const o = v.overlay;
  const now = performance.now();
  v.floats = v.floats.filter((f) => now - f.born < 1300);
  v.projectiles = v.projectiles.filter((p) => now - p.born < p.duration);
  if (!v.board) return;
  syncInsets();
  v.board.render({
    room: v.displayRoom,
    theme: v.config.dungeonId,
    units: [...v.display.values()].filter((u) => u.alive),
    highlights: o?.highlights ?? [],
    path: o?.path ?? [],
    hover: v.hover,
    floats: v.floats,
    markers: o?.markers ?? [],
    arrows: o?.arrows ?? [],
    ghosts: o?.ghosts ?? [],
    projectiles: v.projectiles,
    focus: o?.focus ?? [],
    intents: o?.intents ?? new Map(),
    hpPreview: o?.hpPreview,
    now,
  });
}

function positionCursorTip(): void {
  if (!view) return;
  const tip = document.getElementById('cursor-tip');
  if (!tip) return;
  const html = view.overlay?.tooltip;
  if (!html || !view.mouse) {
    tip.hidden = true;
    return;
  }
  if (tip.dataset.html !== html) {
    tip.innerHTML = html;
    tip.dataset.html = html;
  }
  tip.hidden = false;
  const wrap = tip.parentElement!.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x: number;
  let y: number;
  if (tip.querySelector('.tp')) {
    // Carte de visée : à côté du curseur, sous la tête de l'unité visée, pour laisser voir sa barre de vie.
    x = view.mouse.x + 28 + w <= wrap.width - 8 ? view.mouse.x + 28 : view.mouse.x - w - 28;
    y = Math.min(Math.max(8, view.mouse.y - 12), wrap.height - h - 8);
  } else {
    x = Math.min(view.mouse.x + 16, wrap.width - w - 8);
    const above = view.mouse.y - h - 14;
    y = above >= 8 ? above : Math.min(view.mouse.y + 22, wrap.height - h - 8);
  }
  tip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
}

function showSpellTip(btn: HTMLElement): void {
  if (!view) return;
  const tip = document.getElementById('spell-tip') as HTMLElement;
  const id = btn.dataset.spell!;
  tip.innerHTML = spellSheet(view.state, id, { slot: view.state.player.deck.indexOf(id) });
  tip.hidden = false;
  const parent = tip.parentElement!.getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  const left = Math.min(Math.max(0, r.left - parent.left), parent.width - tip.offsetWidth);
  tip.style.left = `${left}px`;
  tip.style.top = `${r.top - parent.top - tip.offsetHeight - 8}px`;
}

function updateClock(): void {
  if (!view) return;
  const el = document.getElementById('clock');
  if (el) el.innerHTML = `${icon('clock')} ${formatTime((view.endedAt ?? performance.now()) - view.startedAt)}`;
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
}

function renderHud(): void {
  if (!view) return;
  const v = view;
  const { state } = v;
  const player = getPlayer(state);
  document.getElementById('room')!.textContent = `Salle ${state.roomIndex + 1}/${getDungeon(state.config.dungeonId).rooms.length} · ${state.room.name}`;
  document.getElementById('turn')!.textContent = `Tour ${state.turn} · Difficulté ${state.config.difficulty}`;

  const hpPct = (100 * player.hp) / player.maxHp;
  document.getElementById('hud')!.innerHTML = `
    <div class="cb-hp ${hpPct <= 30 ? 'low' : ''}" role="meter" aria-label="Points de vie" aria-valuenow="${player.hp}" aria-valuemax="${player.maxHp}">
      <i style="width:${hpPct}%"></i><b class="num">${player.hp} / ${player.maxHp}</b>
    </div>
    <div class="cb-res">
      <span class="cb-gem pa" title="Points d'action">${icon('pa')}<b>${player.pa}</b><small>PA</small></span>
      <span class="cb-gem pm" title="Points de mouvement">${icon('pm')}<b>${player.pm}</b><small>PM</small></span>
      <span class="cb-gem conc" title="Concentration">${icon('conc')}<b id="conc-value">${state.player.concentration}</b><small>Conc.</small></span>
    </div>
    <div class="conc-wrap" id="conc"></div>
    <div class="dock-states">
      ${player.burn ? `<span class="ui-chip ui-chip--danger">${icon('burn')} Brûlure ${player.burn.damage} × ${player.burn.turns}</span>` : ''}
      ${state.player.nextShotDouble ? `<span class="ui-chip ui-chip--gold">${icon('conc')} Prochain tir ×2</span>` : ''}
    </div>`;

  const bar = document.getElementById('spellbar')!;
  bar.innerHTML = state.player.deck
    .map((id, i) => {
      const s = getSpell(id);
      const err = getCastError(state, id);
      const uses = state.player.spellUses[id] ?? 0;
      const disabled = !!err || v.busy;
      const cc = spellConcentrationCost(s, state.player.passives ?? []);
      const mr = spellMaxRange(s, state.player.passives ?? [], equipmentRange(state));
      const range = mr === 0 ? 'soi' : s.minRange === mr ? `${s.minRange}` : `${s.minRange}–${mr}`;
      return `<button class="spell-btn el-${s.element} ${v.selectedSpell === id ? 'active' : ''} ${disabled ? 'off' : ''}" data-spell="${id}" ${disabled ? 'aria-disabled="true"' : ''} aria-label="${esc(s.name)}">
        <span class="slot-icon">${spellGlyph(s.name)}${spellIconImg(id)}</span>
        <kbd class="slot-key">${esc(slotKeyLabel(i))}</kbd>
        <span class="slot-pa">${s.pa}</span>
        ${cc ? `<span class="slot-conc">${cc}</span>` : ''}
        ${s.maxPerTurn ? `<span class="slot-uses">${uses}/${s.maxPerTurn}</span>` : ''}
        <span class="slot-name">${s.name}</span>
        <span class="slot-range">${icon('range')}${range}</span>
        ${err && !v.busy ? `<span class="why">${esc(err)}</span>` : ''}
      </button>`;
    })
    .join('') +
    // Emplacements vides jusqu'à la taille du deck de la tranche, comme une barre de raccourcis.
    Array.from({ length: Math.max(0, deckSlots() - state.player.deck.length) }, (_, j) => `<div class="spell-empty" aria-hidden="true"><kbd class="slot-key">${esc(slotKeyLabel(state.player.deck.length + j))}</kbd></div>`).join('');
  if (v.hoverSpell) {
    const b = bar.querySelector<HTMLElement>(`[data-spell="${v.hoverSpell}"]`);
    if (b) showSpellTip(b);
  }

  (document.getElementById('end-turn') as HTMLButtonElement).disabled = v.busy || state.status !== 'playing';
  renderEndPreview();
  renderTurnOrder();
  renderLog();
  renderConcentration();
  renderSelection();
}

function deckSlots(): number {
  const c = getCharacter();
  return c ? getTranche(c.trancheId).deckSize : 0;
}

/** Monogramme du sort (remplacé par une icône quand les visuels seront prêts). */
function spellGlyph(name: string): string {
  const words = name.split(/[\s’'-]+/).filter((w) => w.length > 2);
  return esc((words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2)).toUpperCase());
}

function renderEndPreview(): void {
  if (!view) return;
  const el = document.getElementById('end-preview')!;
  const p = view.analysis.enemy;
  if (view.busy || !p) {
    el.innerHTML = '';
    return;
  }
  const attackers = p.intents.filter((i) => i.damageToPlayer).map((i) => `${esc(i.name)} −${i.damageToPlayer}`);
  el.innerHTML = p.damageToPlayer
    ? `Tour ennemi : <b class="neg">−${p.damageToPlayer} PV</b>${p.playerDies ? ' <span class="kill">mortel</span>' : ''} <span class="muted">(${attackers.join(', ')})</span>`
    : '<span class="pos">Aucun ennemi ne peut vous toucher ce tour-ci.</span>';
  if (p.playerBurnNextTurn) el.innerHTML += `<br><span class="neg">Brûlure : −${p.playerBurnNextTurn} PV</span>`;
}

function renderTurnOrder(): void {
  if (!view) return;
  const el = document.getElementById('turn-order');
  if (!el) return;
  const v = view;
  // Pendant l'animation, l'ordre affiché reste celui du début de l'action.
  const units = turnOrder(v.state).filter((u) => v.display.has(u.id) || u.id === PLAYER_ID);
  const intents = v.analysis.enemy;
  el.innerHTML =
    '<span class="to-label">Ordre</span>' +
    units
      .map((u, i) => {
        const d = v.display.get(u.id);
        const hp = d ? Math.max(0, d.hp) : u.hp;
        const intent = intents?.intents.find((x) => x.unitId === u.id);
        const now = v.acting ? v.acting === u.id : i === 0;
        return `<div class="to-chip ${now ? 'now' : ''} ${v.pinned === u.id ? 'pinned' : ''}" data-unit="${u.id}" title="${esc(u.name)}">
          <span class="to-dot" style="background:${unitColor(u.templateId)}">${u.id === PLAYER_ID ? 'A' : esc(u.name[0])}${unitPortraitImg(u.id === PLAYER_ID ? 'archer' : u.templateId)}</span>
          <span class="to-info"><span class="to-name">${esc(u.name)}</span><span class="to-hp"><i style="width:${(100 * hp) / u.maxHp}%"></i></span></span>
          ${!v.busy && intent?.damageToPlayer ? `<span class="to-intent">${icon('sword')}${intent.damageToPlayer}</span>` : ''}
        </div>`;
      })
      .join('<span class="to-sep">›</span>');
}

function renderConcentration(): void {
  if (!view) return;
  const v = view;
  const el = document.getElementById('conc');
  if (!el) return;
  const now = v.state.player.concentration;
  const preview = v.busy ? null : (v.overlay?.concPreview ?? null);
  const passives = v.state.player.passives ?? [];
  const mods = combinePassives(passives);
  const costs = v.state.player.deck
    .map(getSpell)
    .map((s) => ({ name: s.name, cost: spellConcentrationCost(s, passives) }))
    .filter((s) => s.cost);
  const segs = Array.from({ length: MAX_CONCENTRATION }, (_, i) => {
    let cls = i < now ? 'on' : '';
    if (preview !== null && preview < now && i >= preview && i < now) cls = 'on lose';
    if (preview !== null && preview > now && i >= now && i < preview) cls = 'gain';
    const mark = costs.some((s) => s.cost === i + 1) ? 'mark' : '';
    return `<div class="${cls} ${mark}"></div>`;
  }).join('');
  const lines: string[] = [];
  if (preview !== null && preview !== now) lines.push(`<b class="${preview > now ? 'pos' : 'neg'}">${now} → ${preview}</b> (${esc(v.overlay?.concReason ?? '')})`);
  if (v.state.player.nextShotDouble) lines.push('<span class="pos">Prochain tir doublé.</span>');
  lines.push(
    willGainConcentrationNextTurn(v.state)
      ? `<span class="pos">+${1 + mods.stillConcentrationBonus}</span> au début du prochain tour si vous ne bougez pas.`
      : `Vous avez bougé ce tour : pas de <span class="pos">+${1 + mods.stillConcentrationBonus}</span> au prochain tour.`,
  );
  const gains = v.state.player.deck
    .map(getSpell)
    .filter((s) => s.concentrationGain || spellConcentrationLoss(s, passives))
    .map((s) => (s.concentrationGain ? `${s.name} <span class="pos">+${s.concentrationGain}</span>${s.concentrationGainMinDistance ? ` (cible à ${s.concentrationGainMinDistance}+ cases)` : ''}` : `${s.name} <span class="neg">−${spellConcentrationLoss(s, passives)}</span>`));
  const rules = [
    `Chaque PM dépensé <span class="neg">−1</span>`,
    ...gains,
    ...(mods.killConcentration ? [`Chaque ennemi vaincu <span class="pos">+${mods.killConcentration}</span>`] : []),
    ...costs.map((s) => `${s.name} coûte ${s.cost}`),
  ];
  el.innerHTML = `<div class="conc">${segs}</div><div class="conc-info">${lines.map((l) => `<div>${l}</div>`).join('')}<div class="muted">${rules.join(' · ')}</div></div>`;
  const val = document.getElementById('conc-value');
  if (val) val.textContent = String(now);
}

function renderInspector(): void {
  if (!view) return;
  const v = view;
  const el = document.getElementById('inspector');
  const panel = document.getElementById('info-panel');
  if (!el || !panel || !v.overlay) return;
  const o = v.overlay;
  const idle = o.inspector === defaultInspector() || o.inspector === '<p class="muted">…</p>';
  // Au toucher, pas d'infobulle qui suit le curseur : la carte de visée va en tête de la fiche.
  const tip = !v.mouse && v.pending && o.tooltip && o.tooltip.includes('class="tp') ? o.tooltip : '';
  const html = idle ? tip : tip + o.inspector;
  const show = !!html && !v.busy;
  if (panel.hidden === show) {
    panel.hidden = !show;
    v.layoutKey = '';
  }
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
}

/** Marges du HUD à laisser libres pour cadrer la salle (recalculées quand la mise en page change). */
function syncInsets(): void {
  const v = view;
  if (!v?.board?.setInsets) return;
  const k = `${innerWidth}x${innerHeight}|${document.getElementById('info-panel')?.hidden}`;
  if (k === v.layoutKey) return;
  v.layoutKey = k;
  const stage = document.getElementById('board-wrap')!.getBoundingClientRect();
  // Le plateau iso est un losange : seuls les éléments centrés (ordre des tours, sorts) le gênent,
  // les coins (PV, fin du tour) tombent à côté de ses pointes.
  const portrait = innerWidth < 700 && innerHeight > innerWidth;
  const top = document.querySelector(portrait ? '.cb-top' : '.cb-order')!.getBoundingClientRect();
  const dock = document.querySelector(portrait ? '.cb-dock' : '.cb-spells')!.getBoundingClientRect();
  const panel = document.getElementById('info-panel')!;
  const cb = document.querySelector('.cb') as HTMLElement;
  const dockFull = document.querySelector('.cb-dock')!.getBoundingClientRect();
  cb.style.setProperty('--dock-h', `${Math.round(dockFull.height)}px`);
  let bottom = Math.max(0, stage.bottom - dock.top) + 4;
  let right = 8;
  // À la souris la fiche suit le survol : elle passe par-dessus sans faire sauter le plateau.
  if (!panel.hidden && !v.mouse) {
    // En portrait la fiche monte du bas : le plateau se cale au-dessus. Ailleurs elle occupe la droite.
    const r = panel.getBoundingClientRect();
    if (portrait) bottom = Math.max(bottom, stage.bottom - r.top + 4);
    else right = r.width + 16;
  }
  v.board.setInsets({ top: Math.max(0, top.bottom - stage.top) + 4, bottom, left: innerWidth < 700 ? 8 : 56, right });
}

function renderLog(): void {
  if (!view) return;
  const el = document.getElementById('log');
  if (!el) return;
  el.innerHTML = view.log
    .slice(-120)
    .reverse()
    .map((l) => `<div class="${l.cls}">${l.html}</div>`)
    .join('');
}
