/**
 * Grilles paginées : une liste ne défile jamais, elle se découpe en pages qui tiennent dans la place disponible.
 * La grille doit avoir une hauteur imposée par sa mise en page (flex: 1; min-height: 0), pas par son contenu.
 * Le nombre d'éléments par page se recalcule quand la place change (rotation, redimensionnement, taille du texte).
 */
import { icon } from './icons';

/** Page affichée par grille, gardée entre deux rendus du même écran. */
const pageByKey = new Map<string, number>();

export interface PagedGrid {
  /** Affiche la page qui contient cet élément. */
  showItem(el: Element): void;
  refresh(): void;
  destroy(): void;
}

export function pagerHtml(key: string): string {
  return `<div class="ui-pager" data-pager="${key}">
    <button type="button" class="ui-icon-btn ui-icon-btn--sm ui-pager__btn" data-dir="-1" aria-label="Page précédente">${icon('back')}</button>
    <span class="ui-pager__dots" aria-live="polite"></span>
    <button type="button" class="ui-icon-btn ui-icon-btn--sm ui-pager__btn" data-dir="1" aria-label="Page suivante">${icon('chevronRight')}</button>
  </div>`;
}

/**
 * Pagine les enfants de `grid`. `pager` est la barre de pagination (créée par `pagerHtml`),
 * placée hors de la grille : elle garde toujours sa place, même avec une seule page, pour que la grille ne change pas de taille.
 */
export function pagedGrid(grid: HTMLElement, key: string, pager: HTMLElement | null = grid.parentElement?.querySelector<HTMLElement>(`[data-pager="${key}"]`) ?? null): PagedGrid {
  let perPage = 0;
  let pages = 1;
  let page = pageByKey.get(key) ?? 0;
  const items = () => [...grid.children] as HTMLElement[];

  const measure = () => {
    const all = items();
    all.forEach((el) => (el.hidden = false));
    if (!all.length || !grid.clientHeight) return all.length || 1;
    const top0 = all[0].offsetTop;
    let cols = all.findIndex((el) => el.offsetTop !== top0);
    if (cols < 0) cols = all.length;
    const cs = getComputedStyle(grid);
    const rowGap = parseFloat(cs.rowGap) || 0;
    const rowH = Math.max(...all.slice(0, cols).map((el) => el.offsetHeight));
    const avail = grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const rows = Math.max(1, Math.floor((avail + rowGap + 1) / (rowH + rowGap)));
    return Math.max(1, cols * rows);
  };

  const render = () => {
    const all = items();
    pages = Math.max(1, Math.ceil(all.length / perPage));
    page = Math.min(Math.max(0, page), pages - 1);
    pageByKey.set(key, page);
    all.forEach((el, i) => (el.hidden = Math.floor(i / perPage) !== page));
    if (!pager) return;
    pager.classList.toggle('is-single', pages <= 1);
    const dots = pager.querySelector<HTMLElement>('.ui-pager__dots')!;
    dots.innerHTML =
      pages <= 8
        ? Array.from({ length: pages }, (_, i) => `<button type="button" class="${i === page ? 'on' : ''}" data-page="${i}" aria-label="Page ${i + 1}"></button>`).join('')
        : `<b>${page + 1} / ${pages}</b>`;
    dots.setAttribute('aria-label', `Page ${page + 1} sur ${pages}`);
    pager.querySelector<HTMLButtonElement>('[data-dir="-1"]')!.disabled = page === 0;
    pager.querySelector<HTMLButtonElement>('[data-dir="1"]')!.disabled = page >= pages - 1;
  };

  const refresh = () => {
    perPage = measure();
    render();
  };
  const go = (p: number) => {
    page = p;
    render();
  };

  pager?.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!t) return;
    if (t.dataset.dir) go(page + Number(t.dataset.dir));
    else if (t.dataset.page) go(Number(t.dataset.page));
  });

  // Balayage horizontal sur la grille (téléphone, tablette).
  let x0 = 0;
  let y0 = 0;
  let id = -1;
  grid.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    x0 = e.clientX;
    y0 = e.clientY;
    id = e.pointerId;
  });
  grid.addEventListener('pointerup', (e) => {
    if (e.pointerId !== id) return;
    id = -1;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(e.clientY - y0)) go(page + (dx < 0 ? 1 : -1));
  });
  grid.style.touchAction = 'pan-y pinch-zoom';

  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(refresh);
  });
  ro.observe(grid);
  refresh();

  return {
    showItem(el) {
      const i = items().indexOf(el as HTMLElement);
      if (i >= 0) go(Math.floor(i / perPage));
    },
    refresh,
    destroy: () => ro.disconnect(),
  };
}

/** Pagine toutes les grilles `[data-paged]` d'un écran (la clé de page est la valeur de l'attribut). */
export function pageAll(root: ParentNode): PagedGrid[] {
  return [...root.querySelectorAll<HTMLElement>('[data-paged]')].map((g) => pagedGrid(g, g.dataset.paged!));
}
