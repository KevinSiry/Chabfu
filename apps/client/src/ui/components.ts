/**
 * Composants interactifs du système de design : feuille du bas, fenêtre de confirmation, toasts,
 * bannière, états vides, sélecteurs. Le style est dans components.css.
 */
import { icon } from './icons';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------------------------------------------------------------------------
// Mode d'entrée : clavier ou tactile/souris (les raccourcis ne s'affichent qu'au clavier)
// ---------------------------------------------------------------------------

export function trackInputMode(): void {
  const root = document.documentElement;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key.length === 1 || e.key === 'Tab' || e.key === ' ' || e.key === 'Escape') root.dataset.input = 'keyboard';
    },
    true,
  );
  window.addEventListener('pointerdown', (e) => (root.dataset.input = e.pointerType === 'touch' ? 'touch' : 'pointer'), true);
  root.dataset.input = matchMedia('(hover: none)').matches ? 'touch' : 'pointer';
}

export const isTouchUi = () => document.documentElement.dataset.input === 'touch';

// ---------------------------------------------------------------------------
// Feuille du bas
// ---------------------------------------------------------------------------

export interface SheetOptions {
  title?: string;
  html: string;
  /** Appelé quand la feuille se ferme (geste, fond, bouton, Échap). */
  onClose?: () => void;
  /** Classe ajoutée à la feuille. */
  cls?: string;
  /** Pas de voile derrière (fiche consultable pendant le jeu). */
  modeless?: boolean;
}

export interface SheetHandle {
  el: HTMLElement;
  body: HTMLElement;
  setContent(html: string, title?: string): void;
  close(): void;
}

let openSheetHandle: SheetHandle | null = null;

export function openSheet(o: SheetOptions): SheetHandle {
  openSheetHandle?.close();
  const scrim = document.createElement('div');
  scrim.className = 'ui-sheet-scrim';
  if (o.modeless) scrim.style.pointerEvents = 'none';
  const el = document.createElement('section');
  el.className = `ui-sheet${o.cls ? ` ${o.cls}` : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', o.modeless ? 'false' : 'true');
  el.innerHTML = `
    <div class="ui-sheet__grip" aria-hidden="true"></div>
    <header class="ui-sheet__head"><h2 class="ui-sheet__title"></h2>
      <button class="ui-icon-btn ui-icon-btn--sm ui-icon-btn--flat" data-sheet-close aria-label="Fermer">${icon('close')}</button></header>
    <div class="ui-sheet__body"></div>`;
  const body = el.querySelector<HTMLElement>('.ui-sheet__body')!;
  const titleEl = el.querySelector<HTMLElement>('.ui-sheet__title')!;
  const setContent = (html: string, title?: string) => {
    body.innerHTML = `<div class="ui-sheet__content">${html}</div>`;
    if (title !== undefined) titleEl.textContent = title;
    titleEl.hidden = !titleEl.textContent;
    el.setAttribute('aria-label', titleEl.textContent || 'Fiche');
    fitSheet(el);
  };
  setContent(o.html, o.title ?? '');
  if (o.modeless) scrim.style.opacity = '0';
  document.body.append(scrim, el);
  fitSheet(el);
  const previous = document.activeElement as HTMLElement | null;
  requestAnimationFrame(() => {
    scrim.classList.add('is-open');
    el.classList.add('is-open');
    if (!o.modeless) el.querySelector<HTMLElement>('[data-sheet-close]')?.focus({ preventScroll: true });
  });

  const onResize = () => fitSheet(el);
  window.addEventListener('resize', onResize);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('resize', onResize);
    el.classList.remove('is-open');
    scrim.classList.remove('is-open');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => {
      el.remove();
      scrim.remove();
    }, 260);
    if (openSheetHandle === handle) openSheetHandle = null;
    if (!o.modeless) previous?.focus?.({ preventScroll: true });
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('click', close);
  el.querySelector('[data-sheet-close]')!.addEventListener('click', close);

  // Glisser vers le bas pour fermer (par la poignée ou l'en-tête).
  let startY = 0;
  let dy = 0;
  const grabZones = el.querySelectorAll<HTMLElement>('.ui-sheet__grip, .ui-sheet__head');
  grabZones.forEach((z) =>
    z.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      startY = e.clientY;
      dy = 0;
      el.classList.add('is-dragging');
      z.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        dy = Math.max(0, ev.clientY - startY);
        if (getComputedStyle(el).left !== 'auto') el.style.transform = `translate(-50%, ${dy}px)`;
      };
      const up = () => {
        el.classList.remove('is-dragging');
        el.style.transform = '';
        z.removeEventListener('pointermove', move);
        z.removeEventListener('pointerup', up);
        z.removeEventListener('pointercancel', up);
        if (dy > 90) close();
      };
      z.addEventListener('pointermove', move);
      z.addEventListener('pointerup', up);
      z.addEventListener('pointercancel', up);
    }),
  );

  const handle: SheetHandle = { el, body, setContent, close };
  openSheetHandle = handle;
  return handle;
}

export const currentSheet = () => openSheetHandle;

/**
 * Une fiche ne défile jamais : si son contenu dépasse, elle s'élargit et passe sur deux colonnes,
 * puis resserre son texte si cela ne suffit toujours pas.
 */
export function fitSheet(el: HTMLElement): void {
  const body = el.querySelector<HTMLElement>('.ui-sheet__body');
  const content = el.querySelector<HTMLElement>('.ui-sheet__content');
  if (!body || !content) return;
  const steps = ['is-wide', 'is-xwide', 'is-dense'];
  el.classList.remove(...steps);
  sheetColumns(content, 1);
  const over = () => body.scrollHeight > body.clientHeight + 2 || content.scrollWidth > content.clientWidth + 2;
  if (!body.clientHeight) return;
  for (const step of steps) {
    if (!over()) return;
    el.classList.add(step);
    sheetColumns(content, el.classList.contains('is-xwide') ? 3 : 2);
  }
}

/**
 * Répartit les blocs d'une fiche en colonnes (fiche élargie). Chaque bloc va dans la colonne prévue pour sa classe ;
 * les blocs inconnus suivent le précédent. Avec n = 1, remet la fiche dans son ordre d'origine.
 */
const COLUMN_PLAN: Record<number, string[][]> = {
  2: [['ss-head', 'ss-costs', 'ss-dmg', 'ss-fx', 'item-head', 'item-meta', 'stat-rows'], ['ss-grid', 'ss-conc', 'ss-passives', 'ss-note', 'stat-delta', 'gr-sheet-action']],
  3: [['ss-head', 'ss-costs', 'ss-dmg', 'item-head', 'item-meta', 'stat-rows'], ['ss-fx', 'ss-conc', 'stat-delta'], ['ss-grid', 'ss-passives', 'ss-note', 'gr-sheet-action']],
};
function sheetColumns(content: HTMLElement, n: number): void {
  // Remise à plat : chaque bloc revient à sa place d'origine.
  const moved = [...content.querySelectorAll<HTMLElement>('[data-col-home]')];
  moved
    .sort((a, b) => Number(a.dataset.colOrder) - Number(b.dataset.colOrder))
    .forEach((b) => {
      const home = content.querySelector<HTMLElement>(`[data-col-id="${b.dataset.colHome}"]`) ?? content;
      home.appendChild(b);
      delete b.dataset.colHome;
      delete b.dataset.colOrder;
    });
  content.querySelector('.ui-sheet__cols')?.remove();
  content.classList.remove('has-cols');
  const plan = COLUMN_PLAN[n];
  if (!plan) return;
  const host = content.querySelector<HTMLElement>('.ss, .item-card');
  if (!host) return;
  host.dataset.colId = 'host';
  content.dataset.colId = 'content';
  const blocks: { el: HTMLElement; home: string }[] = [
    ...[...host.children].map((c) => ({ el: c as HTMLElement, home: 'host' })),
    ...[...content.children].filter((c) => c !== host && !c.contains(host)).map((c) => ({ el: c as HTMLElement, home: 'content' })),
  ];
  const cols = document.createElement('div');
  cols.className = 'ui-sheet__cols';
  cols.style.setProperty('--n', String(n));
  const colEls = plan.map(() => cols.appendChild(document.createElement('div')));
  let last = 0;
  blocks.forEach((b, i) => {
    const ci = plan.findIndex((list) => list.some((cls) => b.el.classList.contains(cls)));
    if (ci >= 0) last = ci;
    b.el.dataset.colHome = b.home;
    b.el.dataset.colOrder = String(i);
    colEls[last].appendChild(b.el);
  });
  content.classList.add('has-cols');
  content.prepend(cols);
}

// ---------------------------------------------------------------------------
// Fenêtre de confirmation
// ---------------------------------------------------------------------------

export function confirmModal(o: { title: string; text: string; confirm: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'ui-modal-scrim';
    scrim.innerHTML = `
      <div class="ui-modal" role="alertdialog" aria-modal="true" aria-labelledby="ui-modal-t">
        <h2 id="ui-modal-t">${esc(o.title)}</h2>
        <p>${o.text}</p>
        <div class="ui-modal__actions">
          <button class="ui-btn" data-v="0">${esc(o.cancel ?? 'Annuler')}</button>
          <button class="ui-btn ${o.danger ? 'ui-btn--danger' : 'ui-btn--primary'}" data-v="1">${esc(o.confirm)}</button>
        </div>
      </div>`;
    const done = (v: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      scrim.remove();
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
      if (b) done(b.dataset.v === '1');
      else if (e.target === scrim) done(false);
    });
    document.body.appendChild(scrim);
    scrim.querySelector<HTMLElement>('[data-v="1"]')!.focus();
  });
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export function toast(text: string, kind: 'info' | 'success' | 'error' | 'gold' = 'info', ms = 2600): void {
  let host = document.querySelector<HTMLElement>('.ui-toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'ui-toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const ico = { info: 'info', success: 'check', error: 'cross', gold: 'sparkle' }[kind];
  const t = document.createElement('div');
  t.className = `ui-toast ui-toast--${kind}`;
  t.innerHTML = `${icon(ico)}<span>${text}</span>`;
  host.appendChild(t);
  setTimeout(() => {
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

// ---------------------------------------------------------------------------
// Bannière plein écran (début de salle, de tour…) : passable d'un toucher
// ---------------------------------------------------------------------------

export function banner(title: string, kicker = '', ms = 1100): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'ui-banner';
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="ui-banner__band">${kicker ? `<span class="ui-banner__kicker">${esc(kicker)}</span>` : ''}<span class="ui-banner__title">${esc(title)}</span></div>`;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 260);
      resolve();
    };
    el.addEventListener('pointerdown', finish);
    document.body.appendChild(el);
    setTimeout(finish, ms);
  });
}

// ---------------------------------------------------------------------------
// Gabarits
// ---------------------------------------------------------------------------

export function emptyState(o: { icon: string; title: string; text?: string; action?: { id: string; label: string } }): string {
  return `<div class="ui-empty">
    <div class="ui-empty__art">${icon(o.icon)}</div>
    <p class="ui-empty__title">${o.title}</p>
    ${o.text ? `<p class="ui-empty__text">${o.text}</p>` : ''}
    ${o.action ? `<button class="ui-btn ui-btn--sm" id="${o.action.id}">${o.action.label}</button>` : ''}
  </div>`;
}

export function segmented(name: string, options: { value: string; label: string }[], value: string): string {
  return `<div class="ui-seg" role="group" data-seg="${name}">${options
    .map((o) => `<button type="button" data-value="${o.value}" aria-pressed="${o.value === value}">${o.label}</button>`)
    .join('')}</div>`;
}

export function bindSegmented(root: HTMLElement, name: string, onChange: (value: string) => void): void {
  const seg = root.querySelector<HTMLElement>(`[data-seg="${name}"]`);
  seg?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]');
    if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onChange(b.dataset.value!);
  });
}

// ---------------------------------------------------------------------------
// Grand panneau plein écran (fiche du personnage, tranches, paramètres) : jamais de défilement,
// le contenu se répartit en onglets et en colonnes qui tiennent dans l'écran.
// ---------------------------------------------------------------------------

export interface PanelTab {
  id: string;
  label: string;
  html: () => string;
  /** Branche les boutons du volet après son affichage. */
  bind?: (body: HTMLElement) => void;
}

export interface PanelHandle {
  el: HTMLElement;
  body: HTMLElement;
  show(tabId: string): void;
  close(): void;
}

export function openPanel(o: { title: string; tabs: PanelTab[]; tab?: string; cls?: string; onClose?: () => void }): PanelHandle {
  openSheetHandle?.close();
  const scrim = document.createElement('div');
  scrim.className = 'ui-pmodal-scrim';
  const multi = o.tabs.length > 1;
  scrim.innerHTML = `
    <section class="ui-pmodal${o.cls ? ` ${o.cls}` : ''}" role="dialog" aria-modal="true" aria-label="${o.title}">
      <header class="ui-pmodal__head">
        <h2 class="ui-pmodal__title">${o.title}</h2>
        ${multi ? segmented('pmodal-tab', o.tabs.map((t) => ({ value: t.id, label: t.label })), o.tab ?? o.tabs[0].id) : ''}
        <button class="ui-icon-btn ui-icon-btn--sm ui-pmodal__close" data-pmodal-close aria-label="Fermer">${icon('close')}</button>
      </header>
      <div class="ui-pmodal__body"></div>
    </section>`;
  const el = scrim.querySelector<HTMLElement>('.ui-pmodal')!;
  const body = scrim.querySelector<HTMLElement>('.ui-pmodal__body')!;
  const show = (id: string) => {
    const t = o.tabs.find((x) => x.id === id) ?? o.tabs[0];
    body.innerHTML = t.html();
    body.dataset.tab = t.id;
    scrim.querySelectorAll<HTMLButtonElement>('[data-seg="pmodal-tab"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === t.id)));
    t.bind?.(body);
  };
  document.body.appendChild(scrim);
  const previous = document.activeElement as HTMLElement | null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    scrim.classList.add('is-leaving');
    setTimeout(() => scrim.remove(), 200);
    previous?.focus?.({ preventScroll: true });
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('click', (e) => e.target === scrim && close());
  scrim.querySelector('[data-pmodal-close]')!.addEventListener('click', close);
  if (multi) bindSegmented(scrim, 'pmodal-tab', show);
  show(o.tab ?? o.tabs[0].id);
  requestAnimationFrame(() => scrim.querySelector<HTMLElement>('[data-pmodal-close]')?.focus({ preventScroll: true }));
  return { el, body, show, close };
}
