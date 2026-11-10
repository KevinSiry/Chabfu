# Chabfu

Jeu web solo de combat tactique au tour par tour sur grille (Archer, donjons fixes, tranches de niveaux).
Référence : `docs/game-design-document.md` (GDD v0.1).

## Démarrer

```bash
npm install      # si npm affiche « Cannot read properties of null (reading 'edgesOut') » : npm install --legacy-peer-deps
npm run dev      # client sur http://localhost:5173
npm test         # tests du moteur
npm run build    # build de production du client
```

## Structure

- `packages/engine` : moteur de règles en TypeScript pur, **déterministe** (aucun `Math.random`, aucun DOM).
  Il sera partagé tel quel par le serveur pour valider les scores en rejouant la suite d'actions (`verifyRun`).
  - `combat.ts` : création du run, actions du joueur (`move`, `cast`, `endTurn`), tours des monstres, dégâts, Concentration, poussées.
  - `ai.ts` : IA déterministe des monstres.
  - `grid.ts` : distances, ligne de vue, déplacements.
  - `progression.ts` : tranches, redéfinition, validation du deck.
  - `loot.ts` : échelle de difficulté, règle de drop, raretés, RNG à graine (pour le serveur).
  - `replay.ts` : rejouer / vérifier un run, tri du classement.
  - `data/` : sorts, monstres, donjons.
- `apps/client` : client navigateur (Vite + canvas 2D iso). L'affichage est une couche remplaçable (PixiJS/Phaser plus tard).

## État du prototype (v0.1)

Jouable : tranche T1, donjon « Bosquet des Ronces » (2 salles + boss), 8 sorts de l'Archer jusqu'au niveau 18,
deck de 5 sorts, difficultés 1 à 10, Concentration, faiblesses/résistances, brûlure, retrait de PM, poussées et collisions,
classement local (difficulté > tours > chrono) et validation du run par replay.

Choix pris sur les questions ouvertes du GDD : **aucun aléatoire en combat** (pas de critiques ni de dégâts variables),
pour que les routes soient reproductibles.

Pas encore fait : stuff et raretés en jeu, passifs, runes, ressources et drops, serveur et comptes, autres donjons et tranches.
Équilibrage entièrement provisoire.

## Docker

```bash
docker compose up -d --build          # production (Nginx) : http://localhost:8080
docker compose --profile dev up dev   # développement avec rechargement : http://localhost:5173
```

L'image de production lance les tests du moteur pendant le build : un test qui échoue bloque l'image.
