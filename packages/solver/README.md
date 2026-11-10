# @chabfu/solver — équilibrage par bot

Recherche en faisceau (beam search) sur le moteur déterministe : pour un donjon, une difficulté,
un deck et un équipement, le bot cherche la route qui gagne en un minimum de tours. Chaque route
trouvée est une suite d'actions que `verifyRun` accepte, donc rejouable telle quelle.

Le solveur ne connaît aucun donjon en dur : il prend tous les donjons déclarés dans le moteur
(`DUNGEONS`), y compris ceux ajoutés plus tard.

## Lancer

```bash
npm run solve -- --difficulty 1-10 --stuff aucun,mythique --no-walk
```

Le rapport est écrit dans `reports/equilibrage.md`, avec `reports/resultats.json` et une route
gagnante par donjon, panoplie et difficulté dans `reports/routes/`.

| Option | Effet |
|---|---|
| `--dungeon id[,id]` | Donjons à tester (défaut : tous) |
| `--difficulty 1-10` | Difficultés, ex. `1,5,10` |
| `--deck nom` ou `--deck sort1,sort2,…` | Decks prédéfinis (`feu-poussee`, `multi-element`, `concentration`) ou liste de sorts, répétable |
| `--all-decks` | Tous les decks possibles de la tranche (long) |
| `--stuff aucun,commun,rare,mythique,…` | Panoplie complète de la tranche dans cette rareté |
| `--no-walk` | Ajoute une passe où l'Archer ne marche pas (Bond arrière permis) pour mesurer la tension de la Concentration |
| `--set monster.*.hp=x0.7` | Essaie une valeur sans toucher au code (répétable) ; voir `src/overrides.ts` |
| `--beam n`, `--quick` | Largeur du faisceau (défaut 48, `--quick` = 16) : plus large = meilleures routes, plus lent |
| `--jobs n` | Calculs en parallèle (défaut : cœurs - 1) |
| `--out dossier` | Dossier du rapport |

Une défaite du bot veut seulement dire qu'il n'a pas trouvé de route. La durée affichée est une
estimation : 2,5 s par action du joueur et 1,5 s par tour des monstres.
