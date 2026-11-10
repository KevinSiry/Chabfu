/**
 * Tutoriel par bulles : un projecteur éclaire un élément de l'écran, une bulle explique quoi faire.
 * Chaque visite guidée n'est montrée qu'une fois (réglage seenTips), « Passer » coupe tout le tutoriel.
 */
import { getSettings, markTipSeen, updateSettings } from './settings';
import { sfx } from './sfx';

export interface CoachStep {
  /** Sélecteur ou élément à éclairer ; rien : bulle au centre. */
  target?: string | Element | null;
  title: string;
  text: string;
}

let running = false;

/** Visites déjà vues ou tutoriel coupé : rien à montrer. */
export function coachPending(id: string): boolean {
  const s = getSettings();
  return !s.tutorialDone && !s.seenTips.includes(id);
}

export async function coachTour(id: string, steps: CoachStep[]): Promise<void> {
  if (running || !coachPending(id)) return;
  running = true;
  markTipSeen(id);
  const root = document.createElement('div');
  root.className = 'coach';
  root.innerHTML = `<div class="coach-spot"></div>
    <div class="coach-bubble" role="dialog" aria-live="polite">
      <div class="coach-head"><b class="coach-title"></b><span class="coach-count num"></span></div>
      <p class="coach-text"></p>
      <div class="coach-actions">
        <button type="button" class="coach-skip">Passer le tutoriel</button>
        <button type="button" class="ui-btn ui-btn--primary ui-btn--sm coach-next">Compris</button>
      </div>
    </div>`;
  document.body.append(root);
  const spot = root.querySelector<HTMLElement>('.coach-spot')!;
  const bubble = root.querySelector<HTMLElement>('.coach-bubble')!;
  requestAnimationFrame(() => root.classList.add('is-open'));

  let stopped = false;
  for (let i = 0; i < steps.length && !stopped; i++) {
    const step = steps[i];
    const el = typeof step.target === 'string' ? document.querySelector(step.target) : (step.target ?? null);
    root.querySelector('.coach-title')!.textContent = step.title;
    root.querySelector('.coach-text')!.textContent = step.text;
    root.querySelector('.coach-count')!.textContent = steps.length > 1 ? `${i + 1}/${steps.length}` : '';
    root.querySelector('.coach-next')!.textContent = i === steps.length - 1 ? 'C’est parti !' : 'Suivant';
    place(spot, bubble, el);
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
    sfx('select');
    const onResize = () => place(spot, bubble, el);
    window.addEventListener('resize', onResize);
    const choice = await new Promise<'next' | 'skip'>((resolve) => {
      root.querySelector('.coach-next')!.addEventListener('click', () => resolve('next'), { once: true });
      root.querySelector('.coach-skip')!.addEventListener('click', () => resolve('skip'), { once: true });
      const key = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          document.removeEventListener('keydown', key, true);
          resolve(e.key === 'Escape' ? 'skip' : 'next');
        }
      };
      document.addEventListener('keydown', key, true);
    });
    window.removeEventListener('resize', onResize);
    if (choice === 'skip') {
      updateSettings({ tutorialDone: true });
      stopped = true;
    }
  }
  root.classList.remove('is-open');
  setTimeout(() => root.remove(), 220);
  running = false;
}

function place(spot: HTMLElement, bubble: HTMLElement, el: Element | null): void {
  const vw = innerWidth;
  const vh = innerHeight;
  // La bulle est agrandie par zoom sur grand écran : ses left/top et sa flèche sont en pixels « zoomés ».
  const z = parseFloat(getComputedStyle(bubble).zoom) || 1;
  const bRect = bubble.getBoundingClientRect();
  const bw = bRect.width;
  const bh = bRect.height;
  const r = el?.getBoundingClientRect();
  if (!r || r.width === 0) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
    bubble.style.left = `${Math.max(12, (vw - bw) / 2) / z}px`;
    bubble.style.top = `${Math.max(12, (vh - bh) / 2) / z}px`;
    bubble.dataset.side = 'center';
    return;
  }
  const pad = 8;
  spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
  const below = vh - r.bottom;
  const above = r.top;
  const right = vw - r.right;
  let left: number;
  let top: number;
  let side: string;
  if (below >= bh + 24 || (below >= above && below > right)) {
    side = 'below';
    top = r.bottom + pad + 14;
    left = r.left + r.width / 2 - bw / 2;
  } else if (above >= bh + 24) {
    side = 'above';
    top = r.top - pad - 14 - bh;
    left = r.left + r.width / 2 - bw / 2;
  } else {
    // Cible haute comme l'écran (colonne de sorts en paysage) : bulle sur le côté.
    side = right > r.left ? 'right' : 'left';
    left = side === 'right' ? r.right + pad + 14 : r.left - pad - 14 - bw;
    top = r.top + r.height / 2 - bh / 2;
  }
  const cl = Math.min(Math.max(12, left), vw - bw - 12);
  const ct = Math.min(Math.max(12, top), vh - bh - 12);
  bubble.style.left = `${cl / z}px`;
  bubble.style.top = `${ct / z}px`;
  bubble.dataset.side = side;
  const arrowX = Math.min(Math.max(20, r.left + r.width / 2 - cl), bw - 20);
  const arrowY = Math.min(Math.max(20, r.top + r.height / 2 - ct), bh - 20);
  bubble.style.setProperty('--ax', `${arrowX / z}px`);
  bubble.style.setProperty('--ay', `${arrowY / z}px`);
}
