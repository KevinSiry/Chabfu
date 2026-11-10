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
    body.innerHTML = html;
    if (title !== undefined) titleEl.textContent = title;
    titleEl.hidden = !titleEl.textContent;
    el.setAttribute('aria-label', titleEl.textContent || 'Fiche');
  };
  setContent(o.html, o.title ?? '');
  if (o.modeless) scrim.style.opacity = '0';
  document.body.append(scrim, el);
  const previous = document.activeElement as HTMLElement | null;
  requestAnimationFrame(() => {
    scrim.classList.add('is-open');
    el.classList.add('is-open');
    if (!o.modeless) el.querySelector<HTMLElement>('[data-sheet-close]')?.focus({ preventScroll: true });
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
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
