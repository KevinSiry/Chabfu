import type { Element, Pos, RoomState } from '@chabfu/engine';

export const TILE_W = 64;
export const TILE_H = 32;
export const CANVAS_W = 900;
export const CANVAS_H = 600;

export interface DisplayUnit {
  id: string;
  name: string;
  team: 'player' | 'monster';
  templateId: string;
  isBoss: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  alpha: number;
  burning: boolean;
  /** PM retirés pour le prochain tour. */
  pmMalus: number;
  /** Décalage d'animation (élan d'attaque), en pixels écran. */
  dx?: number;
  dy?: number;
  /** Clignotement quand l'unité est touchée (horodatage). */
  hitAt?: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
  size?: number;
}

export interface Highlight {
  pos: Pos;
  /** Remplissage de la case. */
  color?: string;
  /** Contour de la case. */
  outline?: string;
  /** Hachures (cases hors ligne de vue). */
  hatch?: string;
}

/** Étiquette affichée au-dessus d'une unité ou d'une case (dégâts prévus, intention…). */
export interface Marker {
  x: number;
  y: number;
  text: string;
  color: string;
  background?: string;
  /** Rang vertical, pour empiler plusieurs étiquettes. */
  row?: number;
}

export interface Arrow {
  points: Pos[];
  color: string;
  dashed?: boolean;
  width?: number;
  /** Pointe de flèche au bout. */
  head?: boolean;
}

/** Silhouette translucide d'une unité à sa position future. */
export interface Ghost {
  x: number;
  y: number;
  templateId: string;
  team: 'player' | 'monster';
  isBoss: boolean;
  name: string;
}

export interface Projectile {
  from: Pos;
  to: Pos;
  color: string;
  born: number;
  duration: number;
}

export interface Scene {
  room: RoomState;
  units: DisplayUnit[];
  highlights: Highlight[];
  path: Pos[];
  hover: Pos | null;
  floats: FloatingText[];
  markers: Marker[];
  arrows: Arrow[];
  ghosts: Ghost[];
  projectiles: Projectile[];
  /** Unités mises en avant (anneau). */
  focus: { id: string; color: string }[];
  /** Badges d'intention au-dessus des monstres, par id d'unité. */
  intents: Map<string, { text: string; color: string }>;
  now: number;
}

export const ELEMENT_COLORS: Record<Element, string> = {
  fire: '#e8643c',
  water: '#3c9be8',
  earth: '#b0844a',
  air: '#7fd08a',
  neutral: '#e6e6e6',
};

export const UNIT_COLORS: Record<string, string> = {
  archer: '#5fbf6a',
  ronceau: '#8a5a2b',
  guepe: '#e8c23c',
  gardien_racineux: '#7a2f2f',
};

export function unitColor(templateId: string): string {
  return UNIT_COLORS[templateId] ?? '#999';
}

export function origin(room: RoomState): Pos {
  const w = (room.width + room.height) * (TILE_W / 2);
  const h = (room.width + room.height) * (TILE_H / 2);
  return {
    x: (CANVAS_W - w) / 2 + room.height * (TILE_W / 2),
    y: (CANVAS_H - h) / 2 + TILE_H / 2 + 20,
  };
}

export function toScreen(room: RoomState, x: number, y: number): Pos {
  const o = origin(room);
  return { x: o.x + (x - y) * (TILE_W / 2), y: o.y + (x + y) * (TILE_H / 2) };
}

export function toCell(room: RoomState, sx: number, sy: number): Pos | null {
  const o = origin(room);
  const rx = (sx - o.x) / (TILE_W / 2);
  const ry = (sy - o.y) / (TILE_H / 2);
  const x = Math.round((rx + ry) / 2);
  const y = Math.round((ry - rx) / 2);
  if (x < 0 || y < 0 || x >= room.width || y >= room.height) return null;
  return { x, y };
}

function diamond(ctx: CanvasRenderingContext2D, c: Pos, lift = 0, inset = 0): void {
  const w = TILE_W / 2 - inset * 2;
  const h = TILE_H / 2 - inset;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - h - lift);
  ctx.lineTo(c.x + w, c.y - lift);
  ctx.lineTo(c.x, c.y + h - lift);
  ctx.lineTo(c.x - w, c.y - lift);
  ctx.closePath();
}

let hatchPattern: CanvasPattern | null = null;
function hatch(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | string {
  if (!hatchPattern) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const g = c.getContext('2d')!;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(8, 0);
    g.stroke();
    hatchPattern = ctx.createPattern(c, 'repeat');
  }
  return hatchPattern ?? color;
}

export function draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { room } = scene;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const highlights = new Map<string, Highlight[]>();
  for (const h of scene.highlights) {
    const k = `${h.pos.x},${h.pos.y}`;
    const list = highlights.get(k);
    if (list) list.push(h);
    else highlights.set(k, [h]);
  }
  const pathSet = new Set(scene.path.map((p) => `${p.x},${p.y}`));

  // Sol
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const c = toScreen(room, x, y);
      diamond(ctx, c);
      ctx.fillStyle = (x + y) % 2 === 0 ? '#3d5a3a' : '#42623f';
      ctx.fill();
      const k = `${x},${y}`;
      for (const h of highlights.get(k) ?? []) {
        if (h.color) {
          diamond(ctx, c);
          ctx.fillStyle = h.color;
          ctx.fill();
        }
        if (h.hatch) {
          diamond(ctx, c);
          ctx.fillStyle = hatch(ctx, h.hatch);
          ctx.fill();
        }
      }
      if (pathSet.has(k)) {
        diamond(ctx, c);
        ctx.fillStyle = 'rgba(108, 192, 112, 0.55)';
        ctx.fill();
      }
      diamond(ctx, c);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      for (const h of highlights.get(k) ?? []) {
        if (!h.outline) continue;
        diamond(ctx, c, 0, 2);
        ctx.strokeStyle = h.outline;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (scene.hover && scene.hover.x === x && scene.hover.y === y) {
        diamond(ctx, c);
        ctx.strokeStyle = '#f2c14e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // Flèches au sol (chemins prévus, poussées, ligne de vue)
  for (const a of scene.arrows) drawArrow(ctx, room, a);

  // Objets triés par profondeur
  type Drawable = { depth: number; draw: () => void };
  const items: Drawable[] = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (room.tiles[y][x] === '#') items.push({ depth: x + y, draw: () => drawRock(ctx, toScreen(room, x, y)) });
    }
  }
  for (const g of scene.ghosts) {
    items.push({ depth: g.x + g.y + 0.05, draw: () => drawGhost(ctx, toScreen(room, g.x, g.y), g) });
  }
  const focus = new Map(scene.focus.map((f) => [f.id, f.color]));
  for (const u of scene.units) {
    if (u.alpha <= 0) continue;
    items.push({
      depth: u.x + u.y + 0.1,
      draw: () => drawUnit(ctx, toScreen(room, u.x, u.y), u, focus.get(u.id), scene.intents.get(u.id), scene.now),
    });
  }
  items.sort((a, b) => a.depth - b.depth).forEach((i) => i.draw());

  // Projectiles
  for (const p of scene.projectiles) {
    const t = (scene.now - p.born) / p.duration;
    if (t < 0 || t > 1) continue;
    const a = toScreen(room, p.from.x, p.from.y);
    const b = toScreen(room, p.to.x, p.to.y);
    const x = a.x + (b.x - a.x) * t;
    const arc = Math.sin(Math.PI * t) * 30;
    const y = a.y + (b.y - a.y) * t - 26 - arc;
    const tx = a.x + (b.x - a.x) * Math.max(0, t - 0.08);
    const ty = a.y + (b.y - a.y) * Math.max(0, t - 0.08) - 26 - Math.sin(Math.PI * Math.max(0, t - 0.08)) * 30;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // Étiquettes (dégâts prévus, etc.)
  for (const m of scene.markers) drawMarker(ctx, toScreen(room, m.x, m.y), m);

  // Textes flottants
  for (const f of scene.floats) {
    const age = (scene.now - f.born) / 1000;
    if (age < 0 || age > 1.2) continue;
    const c = toScreen(room, f.x, f.y);
    ctx.globalAlpha = Math.max(0, 1 - age / 1.2);
    ctx.font = `bold ${f.size ?? 18}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(f.text, c.x, c.y - 60 - age * 30);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, c.x, c.y - 60 - age * 30);
    ctx.globalAlpha = 1;
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, room: RoomState, a: Arrow): void {
  if (a.points.length < 2) return;
  const pts = a.points.map((p) => toScreen(room, p.x, p.y));
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = a.width ?? 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (a.dashed) ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (a.head !== false) {
    const end = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
    const s = 10;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - s * Math.cos(ang - 0.45), end.y - s * Math.sin(ang - 0.45));
    ctx.lineTo(end.x - s * Math.cos(ang + 0.45), end.y - s * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawMarker(ctx: CanvasRenderingContext2D, c: Pos, m: Marker): void {
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(m.text).width + 12;
  const y = c.y - 74 - (m.row ?? 0) * 20;
  ctx.fillStyle = m.background ?? 'rgba(15, 17, 24, 0.85)';
  roundRect(ctx, c.x - w / 2, y - 9, w, 18, 5);
  ctx.fill();
  ctx.strokeStyle = m.color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = m.color;
  ctx.fillText(m.text, c.x, y + 1);
  ctx.textBaseline = 'alphabetic';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRock(ctx: CanvasRenderingContext2D, c: Pos): void {
  const lift = 22;
  ctx.fillStyle = '#5b5f6b';
  ctx.beginPath();
  ctx.moveTo(c.x - TILE_W / 2, c.y - lift);
  ctx.lineTo(c.x, c.y + TILE_H / 2 - lift);
  ctx.lineTo(c.x, c.y + TILE_H / 2);
  ctx.lineTo(c.x - TILE_W / 2, c.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4a4e59';
  ctx.beginPath();
  ctx.moveTo(c.x + TILE_W / 2, c.y - lift);
  ctx.lineTo(c.x, c.y + TILE_H / 2 - lift);
  ctx.lineTo(c.x, c.y + TILE_H / 2);
  ctx.lineTo(c.x + TILE_W / 2, c.y);
  ctx.closePath();
  ctx.fill();
  diamond(ctx, c, lift);
  ctx.fillStyle = '#7d8290';
  ctx.fill();
}

function drawGhost(ctx: CanvasRenderingContext2D, c: Pos, g: Ghost): void {
  const scale = g.isBoss ? 1.45 : 1;
  const r = 13 * scale;
  const body = c.y - r - 6;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = unitColor(g.templateId);
  ctx.beginPath();
  ctx.ellipse(c.x, body, r, r * 1.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  base: Pos,
  u: DisplayUnit,
  focus: string | undefined,
  intent: { text: string; color: string } | undefined,
  now: number,
): void {
  const c = { x: base.x + (u.dx ?? 0), y: base.y + (u.dy ?? 0) };
  ctx.globalAlpha = u.alpha;
  const scale = u.isBoss ? 1.45 : 1;
  const r = 13 * scale;
  // Anneau de sélection
  if (focus) {
    ctx.strokeStyle = focus;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * 1.5, r * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Ombre
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Corps
  const body = c.y - r - 6;
  const flash = u.hitAt !== undefined && now - u.hitAt < 160;
  ctx.fillStyle = flash ? '#ffffff' : unitColor(u.templateId);
  ctx.beginPath();
  ctx.ellipse(c.x, body, r, r * 1.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = u.team === 'player' ? '#d8ffd8' : 'rgba(0,0,0,0.5)';
  ctx.stroke();
  // Initiale
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(12 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(u.team === 'player' ? 'A' : u.name[0], c.x, body);
  ctx.textBaseline = 'alphabetic';
  // États
  let sx = c.x + r;
  if (u.burning) {
    ctx.fillStyle = '#e8643c';
    ctx.beginPath();
    ctx.arc(sx, body - r, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1b1f2a';
    ctx.lineWidth = 1;
    ctx.stroke();
    sx += 4;
  }
  if (u.pmMalus > 0) {
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3c9be8';
    ctx.fillText(`-${u.pmMalus}PM`, sx + 4, body - r + 12);
  }
  // Barre de PV
  const w = 36 * scale;
  const top = body - r * 1.25 - 10;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(c.x - w / 2, top, w, 5);
  ctx.fillStyle = u.team === 'player' ? '#6cc070' : '#e0544f';
  ctx.fillRect(c.x - w / 2, top, (w * Math.max(0, u.hp)) / u.maxHp, 5);
  // Intention
  if (intent) {
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(intent.text).width + 8;
    ctx.fillStyle = 'rgba(15, 17, 24, 0.8)';
    roundRect(ctx, c.x - tw / 2, top - 17, tw, 14, 4);
    ctx.fill();
    ctx.fillStyle = intent.color;
    ctx.fillText(intent.text, c.x, top - 6);
  }
  ctx.globalAlpha = 1;
}
