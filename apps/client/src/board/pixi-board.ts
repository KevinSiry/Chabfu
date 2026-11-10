/**
 * Rendu du plateau de combat avec PixiJS (WebGL, repli canvas géré par Pixi).
 * Le plateau ne connaît aucune règle : il dessine la `Scene` préparée par combat.ts.
 */
import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { Pos, RoomState } from '@chabfu/engine';
import {
  CANVAS_H,
  CANVAS_W,
  TILE_H,
  TILE_W,
  toScreen,
  unitColor,
  type Arrow,
  type DisplayUnit,
  type Ghost,
  type Highlight,
  type Marker,
  type Scene,
} from '../render';

// ---------------------------------------------------------------------------
// Couleurs CSS -> Pixi
// ---------------------------------------------------------------------------

interface Rgba {
  color: number;
  alpha: number;
}

const colorCache = new Map<string, Rgba>();

export function parseColor(css: string): Rgba {
  const hit = colorCache.get(css);
  if (hit) return hit;
  let out: Rgba = { color: 0xffffff, alpha: 1 };
  const m = /^rgba?\(([^)]+)\)$/.exec(css.trim());
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x));
    out = { color: (r << 16) | (g << 8) | b, alpha: a ?? 1 };
  } else if (css.startsWith('#')) {
    let h = css.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    out = { color: parseInt(h.slice(0, 6), 16), alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  colorCache.set(css, out);
  return out;
}

const fill = (css: string, alphaMul = 1) => {
  const c = parseColor(css);
  return { color: c.color, alpha: c.alpha * alphaMul };
};

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

function diamondPts(c: Pos, lift = 0, inset = 0): number[] {
  const w = TILE_W / 2 - inset * 2;
  const h = TILE_H / 2 - inset;
  return [c.x, c.y - h - lift, c.x + w, c.y - lift, c.x, c.y + h - lift, c.x - w, c.y - lift];
}

/** Petite variation déterministe par case, pour casser l'effet damier. */
function cellNoise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function shade(hex: number, k: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------
// Sprites des unités
// ---------------------------------------------------------------------------

const textures = new Map<string, Texture | null>();
const pending = new Set<string>();

function unitTexture(templateId: string): Texture | null {
  if (textures.has(templateId)) return textures.get(templateId)!;
  if (!pending.has(templateId)) {
    pending.add(templateId);
    const url = `${import.meta.env.BASE_URL}assets/units/${templateId}.png`;
    // Sprite absent : on garde la silhouette dessinée en code.
    fetch(url, { method: 'HEAD' })
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').startsWith('image') ? Assets.load<Texture>(url) : null))
      .then((t) => textures.set(templateId, t ?? null))
      .catch(() => textures.set(templateId, null));
  }
  return null;
}

interface UnitView {
  root: Container;
  shadow: Graphics;
  ring: Graphics;
  body: Container;
  fallback: Graphics;
  initial: Text;
  sprite: Sprite | null;
  bars: Graphics;
  intent: Text;
  pm: Text;
  seed: number;
}

const LABEL_STYLE = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '700', fill: 0xffffff });

export class PixiBoard {
  readonly app: Application;
  private floor = new Graphics();
  private overlay = new Graphics();
  private arrows = new Graphics();
  private depth = new Container();
  private fx = new Graphics();
  private labels = new Container();
  private rocks: Graphics[] = [];
  private roomKey = '';
  private units = new Map<string, UnitView>();
  private ghosts: Graphics[] = [];
  private labelPool: { bg: Graphics; text: Text }[] = [];
  private floatPool: Text[] = [];

  private constructor(app: Application) {
    this.app = app;
    this.depth.sortableChildren = true;
    app.stage.addChild(this.floor, this.overlay, this.arrows, this.depth, this.fx, this.labels);
  }

  static async create(host: HTMLElement): Promise<PixiBoard> {
    const app = new Application();
    await app.init({
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgl',
    });
    app.ticker.stop(); // combat.ts pilote le rendu image par image
    app.canvas.id = 'board';
    // La taille d'affichage suit le conteneur (#board-wrap) ; la résolution interne reste 900×600.
    app.canvas.style.width = '100%';
    app.canvas.style.height = 'auto';
    host.prepend(app.canvas);
    return new PixiBoard(app);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  /** Coordonnées canvas (900×600) -> coordonnées de scène (avant cadrage). */
  screenToScene(x: number, y: number): { x: number; y: number } {
    const st = this.app.stage;
    return { x: (x - st.position.x) / st.scale.x, y: (y - st.position.y) / st.scale.y };
  }

  /** Cadre la salle pour qu'elle occupe le plateau, avec de la marge pour les unités et étiquettes. */
  private fit(room: RoomState): void {
    const top = toScreen(room, 0, 0);
    const right = toScreen(room, room.width - 1, 0);
    const bottom = toScreen(room, room.width - 1, room.height - 1);
    const left = toScreen(room, 0, room.height - 1);
    const x0 = left.x - TILE_W / 2 - 10;
    const x1 = right.x + TILE_W / 2 + 10;
    const y0 = top.y - TILE_H / 2 - 105;
    const y1 = bottom.y + TILE_H / 2 + 26;
    const k = Math.min(CANVAS_W / (x1 - x0), CANVAS_H / (y1 - y0), 1.7);
    const st = this.app.stage;
    st.scale.set(k);
    st.position.set((CANVAS_W - (x1 - x0) * k) / 2 - x0 * k, (CANVAS_H - (y1 - y0) * k) / 2 - y0 * k);
  }

  render(scene: Scene): void {
    this.fit(scene.room);
    this.drawFloor(scene.room);
    this.drawOverlay(scene);
    this.drawArrows(scene.room, scene.arrows);
    this.syncRocks(scene.room);
    this.syncGhosts(scene.room, scene.ghosts);
    this.syncUnits(scene);
    this.drawFx(scene);
    this.drawLabels(scene);
    this.app.render();
  }

  // --- Sol et rochers -------------------------------------------------------

  private drawFloor(room: RoomState): void {
    const key = `${room.name}|${room.width}x${room.height}|${room.tiles.join('')}`;
    if (key === this.roomKey) return;
    this.roomKey = key;
    const g = this.floor;
    g.clear();
    // Socle sous la grille, pour donner de l'épaisseur au plateau.
    const top = toScreen(room, 0, 0);
    const right = toScreen(room, room.width - 1, 0);
    const bottom = toScreen(room, room.width - 1, room.height - 1);
    const left = toScreen(room, 0, room.height - 1);
    const depth = 18;
    g.poly([left.x - TILE_W / 2, left.y, bottom.x, bottom.y + TILE_H / 2, bottom.x, bottom.y + TILE_H / 2 + depth, left.x - TILE_W / 2, left.y + depth]).fill(0x2a3a26);
    g.poly([bottom.x, bottom.y + TILE_H / 2, right.x + TILE_W / 2, right.y, right.x + TILE_W / 2, right.y + depth, bottom.x, bottom.y + TILE_H / 2 + depth]).fill(0x223020);
    void top;
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const c = toScreen(room, x, y);
        const n = cellNoise(x, y);
        const base = (x + y) % 2 === 0 ? 0x3f5d3b : 0x446541;
        g.poly(diamondPts(c)).fill(shade(base, 0.92 + n * 0.14)).stroke({ width: 1, color: 0x000000, alpha: 0.22 });
        // Touffes d'herbe discrètes
        if (n > 0.72) {
          g.circle(c.x - 8 + n * 10, c.y - 2, 1.6).fill({ color: 0x6f9a5a, alpha: 0.7 });
          g.circle(c.x + 6 - n * 6, c.y + 3, 1.2).fill({ color: 0x6f9a5a, alpha: 0.6 });
        }
      }
    }
  }

  private syncRocks(room: RoomState): void {
    const wanted: Pos[] = [];
    for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) if (room.tiles[y][x] === '#') wanted.push({ x, y });
    while (this.rocks.length > wanted.length) this.rocks.pop()!.destroy();
    while (this.rocks.length < wanted.length) {
      const g = new Graphics();
      this.rocks.push(g);
      this.depth.addChild(g);
    }
    wanted.forEach((p, i) => {
      const g = this.rocks[i];
      const tag = `${p.x},${p.y}`;
      if (g.label === tag) return;
      g.label = tag;
      g.clear();
      const c = toScreen(room, p.x, p.y);
      const n = cellNoise(p.x, p.y);
      const lift = 20 + n * 8;
      const w = TILE_W / 2 - 3;
      const h = TILE_H / 2 - 1.5;
      g.poly([c.x - w, c.y - lift, c.x, c.y + h - lift, c.x, c.y + h, c.x - w, c.y]).fill(0x5d616d);
      g.poly([c.x + w, c.y - lift, c.x, c.y + h - lift, c.x, c.y + h, c.x + w, c.y]).fill(0x4a4e59);
      g.poly([c.x, c.y - h - lift, c.x + w, c.y - lift, c.x, c.y + h - lift, c.x - w, c.y - lift]).fill(0x80858f);
      // Fissure et mousse
      g.moveTo(c.x - 6, c.y - lift - 2).lineTo(c.x + 2, c.y - lift + 3).lineTo(c.x + 8, c.y - lift + 1).stroke({ width: 1, color: 0x5d616d });
      g.ellipse(c.x - 10 + n * 8, c.y - lift - 3, 6, 2.5).fill({ color: 0x5f8a4e, alpha: 0.8 });
      g.zIndex = (p.x + p.y) * 10;
    });
  }

  // --- Surbrillances, chemins -----------------------------------------------

  private drawOverlay(scene: Scene): void {
    const g = this.overlay;
    g.clear();
    const { room } = scene;
    const byCell = new Map<string, Highlight[]>();
    for (const h of scene.highlights) {
      const k = `${h.pos.x},${h.pos.y}`;
      const l = byCell.get(k);
      if (l) l.push(h);
      else byCell.set(k, [h]);
    }
    for (const list of byCell.values()) {
      const c = toScreen(room, list[0].pos.x, list[0].pos.y);
      for (const h of list) {
        if (h.color) g.poly(diamondPts(c)).fill(fill(h.color));
        if (h.hatch) {
          const hc = fill(h.hatch);
          for (let i = -1; i <= 1; i++) {
            const ox = i * 12;
            g.moveTo(c.x + ox - 6, c.y + 5).lineTo(c.x + ox + 6, c.y - 5);
          }
          g.stroke({ width: 2, color: hc.color, alpha: hc.alpha });
        }
      }
      for (const h of list) if (h.outline) g.poly(diamondPts(c, 0, 2)).stroke({ width: 2, ...fill(h.outline) });
    }
    for (const p of scene.path) {
      const c = toScreen(room, p.x, p.y);
      g.poly(diamondPts(c)).fill({ color: 0x6fbf4f, alpha: 0.5 });
    }
    if (scene.path.length) {
      const pts = scene.path.map((p) => toScreen(room, p.x, p.y));
      const end = pts[pts.length - 1];
      g.circle(end.x, end.y, 4).fill(0xd8ffd8);
    }
    if (scene.hover) {
      const c = toScreen(room, scene.hover.x, scene.hover.y);
      const pulse = 0.65 + 0.35 * Math.sin(scene.now / 180);
      g.poly(diamondPts(c)).stroke({ width: 2, color: 0xecc878, alpha: pulse });
    }
  }

  private drawArrows(room: RoomState, arrows: Arrow[]): void {
    const g = this.arrows;
    g.clear();
    for (const a of arrows) {
      if (a.points.length < 2) continue;
      const pts = a.points.map((p) => toScreen(room, p.x, p.y));
      const col = fill(a.color);
      const width = a.width ?? 3;
      if (a.dashed) {
        for (let i = 0; i < pts.length - 1; i++) dashed(g, pts[i], pts[i + 1], 7, 6);
      } else {
        g.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      }
      g.stroke({ width, color: col.color, alpha: col.alpha, cap: 'round', join: 'round' });
      if (a.head !== false) {
        const end = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
        const s = 11;
        g.poly([end.x, end.y, end.x - s * Math.cos(ang - 0.45), end.y - s * Math.sin(ang - 0.45), end.x - s * Math.cos(ang + 0.45), end.y - s * Math.sin(ang + 0.45)]).fill(col);
      }
    }
  }

  // --- Unités ---------------------------------------------------------------

  private makeUnit(u: DisplayUnit): UnitView {
    const root = new Container();
    const shadow = new Graphics();
    const ring = new Graphics();
    const body = new Container();
    const fallback = new Graphics();
    const initial = new Text({ text: u.team === 'player' ? 'A' : u.name[0], style: { ...LABEL_STYLE, fontSize: u.isBoss ? 17 : 12 } });
    initial.anchor.set(0.5);
    body.addChild(fallback, initial);
    const bars = new Graphics();
    const intent = new Text({ text: '', style: { ...LABEL_STYLE, fontSize: 11 } });
    intent.anchor.set(0.5, 1);
    const pm = new Text({ text: '', style: { ...LABEL_STYLE, fontSize: 10, fill: 0x6fb8f0 } });
    pm.anchor.set(0, 0.5);
    root.addChild(shadow, ring, body, bars, intent, pm);
    this.depth.addChild(root);
    let seed = 0;
    for (const ch of u.id) seed = (seed * 31 + ch.charCodeAt(0)) % 1000;
    return { root, shadow, ring, body, fallback, initial, sprite: null, bars, intent, pm, seed };
  }

  private syncUnits(scene: Scene): void {
    const { room } = scene;
    const alive = new Set<string>();
    const focus = new Map(scene.focus.map((f) => [f.id, f.color]));
    for (const u of scene.units) {
      if (u.alpha <= 0) continue;
      alive.add(u.id);
      let v = this.units.get(u.id);
      if (!v) {
        v = this.makeUnit(u);
        this.units.set(u.id, v);
      }
      const scale = u.isBoss ? 1.45 : 1;
      const r = 13 * scale;
      const c = toScreen(room, u.x, u.y);
      const bob = Math.sin(scene.now / 420 + v.seed) * 1.5;
      v.root.position.set(c.x + (u.dx ?? 0), c.y + (u.dy ?? 0));
      v.root.alpha = u.alpha;
      v.root.zIndex = (u.x + u.y) * 10 + 5;

      v.shadow.clear().ellipse(0, 0, r * 1.15, r * 0.5).fill({ color: 0x000000, alpha: 0.35 });
      const fc = focus.get(u.id);
      v.ring.clear();
      if (fc) v.ring.ellipse(0, 0, r * 1.6, r * 0.75).stroke({ width: 3, ...fill(fc) });
      else if (u.team === 'player') v.ring.ellipse(0, 0, r * 1.3, r * 0.6).stroke({ width: 2, color: 0x9be89f, alpha: 0.7 });

      // Corps : sprite généré s'il existe, sinon silhouette dessinée.
      const tex = unitTexture(u.templateId);
      const flash = u.hitAt !== undefined && scene.now - u.hitAt < 160;
      let headY: number;
      if (tex) {
        if (!v.sprite) {
          v.sprite = new Sprite(tex);
          v.sprite.anchor.set(0.5, 0.92);
          v.body.addChild(v.sprite);
          v.fallback.visible = false;
          v.initial.visible = false;
        }
        const h = (u.isBoss ? 96 : 66);
        v.sprite.scale.set(h / tex.height);
        v.sprite.position.set(0, bob);
        v.sprite.tint = flash ? 0xff8080 : 0xffffff;
        headY = -h + 4;
      } else {
        const body = -r - 6 + bob;
        v.fallback.clear().ellipse(0, body, r, r * 1.25).fill(flash ? 0xffffff : parseColor(unitColor(u.templateId)).color).stroke({ width: 2, color: u.team === 'player' ? 0xd8ffd8 : 0x000000, alpha: u.team === 'player' ? 1 : 0.5 });
        v.initial.position.set(0, body);
        headY = body - r * 1.25;
      }

      // Barre de PV et états
      const w = 36 * scale;
      const top = headY - 9;
      const ratio = Math.max(0, u.hp) / u.maxHp;
      v.bars.clear();
      v.bars.roundRect(-w / 2 - 1, top - 1, w + 2, 7, 3).fill({ color: 0x000000, alpha: 0.65 });
      v.bars.roundRect(-w / 2, top, w * ratio, 5, 2).fill(u.team === 'player' ? 0x6cc070 : 0xe0544f);
      if (u.burning) v.bars.circle(w / 2 + 6, top + 2, 4.5).fill(0xe8643c).stroke({ width: 1, color: 0x1b1f2a });
      v.pm.text = u.pmMalus > 0 ? `-${u.pmMalus}PM` : '';
      v.pm.position.set(w / 2 + (u.burning ? 13 : 4), top + 2);

      const intent = scene.intents.get(u.id);
      v.intent.text = intent?.text ?? '';
      v.intent.style.fill = intent ? parseColor(intent.color).color : 0xffffff;
      v.intent.position.set(0, top - 3);
    }
    for (const [id, v] of this.units) {
      if (alive.has(id)) continue;
      v.root.destroy({ children: true });
      this.units.delete(id);
    }
  }

  private syncGhosts(room: RoomState, ghosts: Ghost[]): void {
    while (this.ghosts.length > ghosts.length) this.ghosts.pop()!.destroy();
    while (this.ghosts.length < ghosts.length) {
      const g = new Graphics();
      this.ghosts.push(g);
      this.depth.addChild(g);
    }
    ghosts.forEach((gh, i) => {
      const g = this.ghosts[i];
      const scale = gh.isBoss ? 1.45 : 1;
      const r = 13 * scale;
      const c = toScreen(room, gh.x, gh.y);
      const body = c.y - r - 6;
      g.clear();
      g.ellipse(c.x, c.y, r * 1.1, r * 0.5).fill({ color: 0xffffff, alpha: 0.12 });
      g.ellipse(c.x, body, r, r * 1.25).fill({ color: parseColor(unitColor(gh.templateId)).color, alpha: 0.4 });
      dashedEllipse(g, c.x, body, r, r * 1.25);
      g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
      g.zIndex = (gh.x + gh.y) * 10 + 4;
    });
  }

  // --- Effets ---------------------------------------------------------------

  private drawFx(scene: Scene): void {
    const g = this.fx;
    g.clear();
    for (const p of scene.projectiles) {
      const t = (scene.now - p.born) / p.duration;
      if (t < 0 || t > 1) continue;
      const a = toScreen(scene.room, p.from.x, p.from.y);
      const b = toScreen(scene.room, p.to.x, p.to.y);
      const at = (k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - 28 - Math.sin(Math.PI * k) * 34 });
      const head = at(t);
      const tail = at(Math.max(0, t - 0.1));
      const col = parseColor(p.color).color;
      // Traînée lumineuse puis flèche
      for (let i = 1; i <= 4; i++) {
        const q = at(Math.max(0, t - 0.04 * i));
        g.circle(q.x, q.y, 3.5 - i * 0.6).fill({ color: col, alpha: 0.5 - i * 0.1 });
      }
      g.moveTo(tail.x, tail.y).lineTo(head.x, head.y).stroke({ width: 3, color: col, cap: 'round' });
      const ang = Math.atan2(head.y - tail.y, head.x - tail.x);
      g.poly([head.x + 6 * Math.cos(ang), head.y + 6 * Math.sin(ang), head.x + 6 * Math.cos(ang + 2.4), head.y + 6 * Math.sin(ang + 2.4), head.x + 6 * Math.cos(ang - 2.4), head.y + 6 * Math.sin(ang - 2.4)]).fill(0xffffff);
      // Impact
      if (t > 0.9) {
        const k = (t - 0.9) / 0.1;
        g.circle(b.x, b.y - 28, 6 + k * 14).stroke({ width: 3, color: col, alpha: 1 - k });
      }
    }
  }

  private drawLabels(scene: Scene): void {
    const { room } = scene;
    let used = 0;
    const take = () => {
      if (used >= this.labelPool.length) {
        const bg = new Graphics();
        const text = new Text({ text: '', style: LABEL_STYLE.clone() });
        text.anchor.set(0.5);
        this.labels.addChild(bg, text);
        this.labelPool.push({ bg, text });
      }
      return this.labelPool[used++];
    };
    for (const m of scene.markers) drawMarker(take(), toScreen(room, m.x, m.y), m);
    for (let i = used; i < this.labelPool.length; i++) {
      this.labelPool[i].bg.visible = false;
      this.labelPool[i].text.visible = false;
    }

    let f = 0;
    for (const fl of scene.floats) {
      const age = (scene.now - fl.born) / 1000;
      if (age < 0 || age > 1.2) continue;
      if (f >= this.floatPool.length) {
        const t = new Text({ text: '', style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 4, alpha: 0.75 } }) });
        t.anchor.set(0.5, 1);
        this.labels.addChild(t);
        this.floatPool.push(t);
      }
      const t = this.floatPool[f++];
      const c = toScreen(room, fl.x, fl.y);
      t.visible = true;
      t.text = fl.text;
      t.style.fontSize = fl.size ?? 18;
      t.style.fill = parseColor(fl.color).color;
      // Petit rebond à l'apparition, puis montée et fondu.
      const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.55 : age < 0.22 ? 1.15 - ((age - 0.12) / 0.1) * 0.15 : 1;
      t.scale.set(pop);
      t.position.set(c.x, c.y - 62 - age * 32);
      t.alpha = Math.max(0, 1 - Math.max(0, age - 0.5) / 0.7);
    }
    for (let i = f; i < this.floatPool.length; i++) this.floatPool[i].visible = false;
  }
}

function drawMarker(slot: { bg: Graphics; text: Text }, c: Pos, m: Marker): void {
  slot.text.visible = true;
  slot.bg.visible = true;
  slot.text.text = m.text;
  const col = parseColor(m.color).color;
  slot.text.style.fill = col;
  const y = c.y - 82 - (m.row ?? 0) * 20;
  slot.text.position.set(c.x, y);
  const w = slot.text.width + 12;
  const bg = m.background ? fill(m.background) : { color: 0x0f1118, alpha: 0.88 };
  slot.bg.clear().roundRect(c.x - w / 2, y - 9, w, 18, 5).fill(bg).stroke({ width: 1.5, color: col });
}

function dashed(g: Graphics, a: Pos, b: Pos, dash: number, gap: number): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    g.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * e, a.y + uy * e);
  }
}

function dashedEllipse(g: Graphics, cx: number, cy: number, rx: number, ry: number): void {
  const n = 18;
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    g.moveTo(cx + rx * Math.cos(a0), cy + ry * Math.sin(a0)).lineTo(cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
  }
}
