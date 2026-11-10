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

## Personnage et progression

- Au premier lancement, on crée son Archer (sauvegarde locale `chabfu.character.v1`). Il démarre niveau 1 avec Flèche ardente et Bond arrière.
- XP : chaque monstre vaincu rapporte la moitié de ses PV de base (×2 pour un boss), +15 % par palier de difficulté, et +50 % de bonus en cas de victoire.
  Une défaite ou un abandon rapporte l'XP des monstres déjà vaincus. Le bilan est recalculé en rejouant le run (`summarizeRun`), donc vérifiable côté serveur.
- Les sorts et les passifs se débloquent à leur niveau ; chaque tranche garde son deck et ses passifs. On peut se redéfinir sur toute tranche débloquée.
- Moteur : `character.ts` (courbe d'XP, personnage, redéfinition), `passives.ts` et `data/passives.ts` (6 passifs T1, branchés dans le combat).
- Client : `apps/client/src/character/` (création, fiche, choix de tranche, section XP de l'écran de fin). Les autres systèmes peuvent ajouter
  leur propre bloc à l'écran de fin de run avec `registerRunEndSection`.

## Docker

```bash
docker compose up -d --build          # production (Nginx) : http://localhost:8080
docker compose --profile dev up dev   # développement avec rechargement : http://localhost:5173
```

L'image de production lance les tests du moteur pendant le build : un test qui échoue bloque l'image.

## Sauvegarde (PostgreSQL)

`docker compose up -d --build` lance trois services : `web` (Nginx, le jeu), `api` (Node, `apps/server`) et `db` (PostgreSQL 17).
Nginx sert l'API sous `/api`. La base vit dans le volume Docker `chabfu-db` : elle survit aux reconstructions et à `docker compose down`
(mais **pas** à `docker compose down -v`).

- Le jeu écrit toujours ses clés `chabfu.*` dans le navigateur, qui sert de cache. `apps/client/src/save/sync.ts` repère chaque écriture
  et envoie la partie complète à `PUT /api/save` peu après. Au démarrage (`boot.ts`), la sauvegarde du serveur remplace celle du navigateur,
  sauf si des changements faits serveur arrêté sont plus récents. Si la base est vide, la partie du navigateur y est envoyée.
- Format : `packages/engine/src/save.ts`. Enveloppe `{ format: 'chabfu-save', version, savedAt, data }` où `data` contient **toutes** les clés
  `chabfu.*` : une nouvelle clé (runes, challenges…) est sauvegardée sans rien changer. Si la forme d'une donnée change, monter `SAVE_VERSION`
  et ajouter l'étape dans `MIGRATIONS`.
- La base garde aussi les 200 sauvegardes précédentes (table `save_history`), en filet de sécurité.
- Paramètres du jeu : bloc « Sauvegarde » (état, export en fichier JSON, import avec confirmation).
