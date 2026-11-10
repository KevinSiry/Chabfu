# Système de design « Verre nocturne »

Source unique des valeurs : `tokens.css`. Composants : `components.css` + `components.ts`. Icônes : `icons.ts`. Galerie de tous les états : ouvrir le jeu avec `?dev=ui`.

## Règles
- Aucune couleur, taille de police, rayon, ombre ou durée en dur hors `tokens.css`.
- Un seul bouton doré (`.ui-btn--primary`) par écran : l'action principale.
- Jamais une information portée par la seule couleur : chaque élément a son icône (`elementIcon`), chaque rareté son libellé.
- Aucune icône en émoji ou caractère Unicode : `icon('nom')`.
- Cibles tactiles ≥ 44 px (`--tap`), 8 px d'écart minimum.
- Raccourcis clavier (`<kbd>`) affichés seulement quand le joueur utilise un clavier (`html[data-input="keyboard"]`).
- Durées : `--d-fast` pour ce qui se répète, `--d-stage`/`--d-hero` pour les mises en scène, toujours passables d'un toucher.

## Jetons
- Fonds : `--c-bg`, `--c-surface` (verre), `--c-surface-solid`, `--c-surface-raised`, `--c-fill*`, `--c-line*`.
- Texte : `--c-text`, `--c-text-2`, `--c-text-3`, `--c-title`.
- Rôles : `--c-accent` (sélection, focus), `--c-cta-a/b` (action dorée), `--c-danger`, `--c-success`, `--c-warning`.
- Combat : `--c-hp`, `--c-pa`, `--c-pm`, `--c-conc` ; équipes `--c-ally`, `--c-enemy`, `--c-boss`.
- Éléments : `--c-fire`, `--c-water`, `--c-earth`, `--c-air`, `--c-neutral`. Raretés : `--c-r-common` … `--c-r-legendary`.
- Typo : Outfit ; échelle `--fs-2xs` (11) à `--fs-4xl` (64) ; chiffres tabulaires avec `.num`.
- Espacements : grille de 4 px, `--sp-1` à `--sp-16` ; zones sûres `--safe-*`.
- Rayons `--r-xs` à `--r-xl`, `--r-pill` ; ombres `--sh-1` à `--sh-3` ; flous `--blur-1/2`.
- Mouvement : `--d-instant` 80 ms, `--d-fast` 150, `--d-base` 250, `--d-stage` 450, `--d-hero` 800 ; courbes `--ease-out`, `--ease-spring`…

## Réglages d'accessibilité (posés sur `<html>` par `settings.ts`)
- `data-text="lg|xl"` : texte agrandi (`--text-scale`).
- `data-cvd="on"` : palette des éléments et raretés pour daltoniens.
- `data-motion="reduced|full"` : mouvements réduits, sinon `prefers-reduced-motion`.

## Composants
Boutons (`ui-btn`, variantes primary, accent, ghost, danger, lg, sm, block ; états hover, pressé, focus, désactivé, chargement), bouton icône (`ui-icon-btn`, `is-on`), pastilles (`ui-chip`), badge, panneau verre (`ui-panel`), titre de section, barres (`ui-bar`, PV avec part fantôme, XP), segments (Concentration), sélecteur segmenté, crans de difficulté (`ui-steps`), feuille du bas (`openSheet`, panneau latéral en paysage), confirmation (`confirmModal`), toasts (`toast`), bannière (`banner`), état vide (`emptyState`), squelette.
