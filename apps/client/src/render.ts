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
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
}

export interface Highlight {
  pos: Pos;
  color: string;
}

export interface Scene {
  room: RoomState;
  units: DisplayUnit[];
  highlights: Highlight[];
  path: Pos[];
  hover: Pos | null;
  floats: FloatingText[];
  now: number;
}

export const ELEMENT_COLORS: Record<Element, string> = {
  fire: '#e8643c',
  water: '#3c9be8',
  earth: '#b0844a',
  air: '#7fd08a',
  neutral: '#e6e6e6',
};

const UNIT_COLORS: Record<string, string> = {
  archer: '#5fbf6a',
  ronceau: '#8a5a2b',
  guepe: '#e8c23c',
  gardien_racineux: '#7a2f2f',
};

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

function diamond(ctx: CanvasRenderingContext2D, c: Pos, lift = 0): void {
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - TILE_H / 2 - lift);
  ctx.lineTo(c.x + TILE_W / 2, c.y - lift);
  ctx.lineTo(c.x, c.y + TILE_H / 2 - lift);
  ctx.lineTo(c.x - TILE_W / 2, c.y - lift);
  ctx.closePath();
}

export function draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { room } = scene;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const highlight = new Map(scene.highlights.map((h) => [`${h.pos.x},${h.pos.y}`, h.color]));
  const pathSet = new Set(scene.path.map((p) => `${p.x},${p.y}`));

  // Sol
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const c = toScreen(room, x, y);
      diamond(ctx, c);
      ctx.fillStyle = (x + y) % 2 === 0 ? '#3d5a3a' : '#42623f';
      ctx.fill();
      const k = `${x},${y}`;
      const h = highlight.get(k);
      if (h) {
        ctx.fillStyle = h;
        ctx.fill();
      }
      if (pathSet.has(k)) {
        ctx.fillStyle = 'rgba(108, 192, 112, 0.55)';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (scene.hover && scene.hover.x === x && scene.hover.y === y) {
        ctx.strokeStyle = '#f2c14e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // Objets triés par profondeur
  type Drawable = { depth: number; draw: () => void };
  const items: Drawable[] = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (room.tiles[y][x] === '#') items.push({ depth: x + y, draw: () => drawRock(ctx, toScreen(room, x, y)) });
    }
  }
  for (const u of scene.units) {
    if (u.alpha <= 0) continue;
    items.push({ depth: u.x + u.y + 0.1, draw: () => drawUnit(ctx, toScreen(room, u.x, u.y), u) });
  }
  items.sort((a, b) => a.depth - b.depth).forEach((i) => i.draw());

  // Textes flottants
  for (const f of scene.floats) {
    const age = (scene.now - f.born) / 1000;
    if (age < 0 || age > 1.2) continue;
    const c = toScreen(room, f.x, f.y);
    ctx.globalAlpha = Math.max(0, 1 - age / 1.2);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(f.text, c.x, c.y - 60 - age * 30);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, c.x, c.y - 60 - age * 30);
    ctx.globalAlpha = 1;
  }
}

function drawRock(ctx: CanvasRenderingContext2D, c: Pos): void {
  const lift = 22;
  // Faces latérales
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

function drawUnit(ctx: CanvasRenderingContext2D, c: Pos, u: DisplayUnit): void {
  ctx.globalAlpha = u.alpha;
  const scale = u.isBoss ? 1.45 : 1;
  const r = 13 * scale;
  // Ombre
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Corps
  const body = c.y - r - 6;
  ctx.fillStyle = UNIT_COLORS[u.templateId] ?? '#999';
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
  if (u.burning) {
    ctx.fillStyle = '#e8643c';
    ctx.beginPath();
    ctx.arc(c.x + r, body - r, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Barre de PV
  const w = 36 * scale;
  const top = body - r * 1.25 - 10;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(c.x - w / 2, top, w, 5);
  ctx.fillStyle = u.team === 'player' ? '#6cc070' : '#e0544f';
  ctx.fillRect(c.x - w / 2, top, (w * Math.max(0, u.hp)) / u.maxHp, 5);
  ctx.globalAlpha = 1;
}
