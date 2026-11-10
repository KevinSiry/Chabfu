# Rapport d’équilibrage par bot

Généré le 2026-11-10 19:10 UTC. Options : faisceau 24, difficultés 1,2,3,4,5,6,7,8,9,10, stuff aucun.

Le bot cherche, pour chaque donjon, difficulté et deck, la route qui finit en un minimum de tours
(recherche en faisceau sur le moteur, deux profils : agressif et prudent). Une victoire prouve que le
donjon est finissable ; une défaite veut seulement dire que le bot n’a pas trouvé de route, pas qu’il
n’en existe aucune. La durée est estimée à 2,5 s par action du joueur et 1,5 s par tour des monstres.

## Vérification des cibles

| Donjon | Cible | Attendu | Résultat | |
|---|---|---|---|---|
| Bosquet des Ronces | Niveau 1 sans stuff, D1 | victoire | 12 tours, ~105 s, 100/150 PV | ✅ |
| Bosquet des Ronces | Sans stuff, D3 | victoire | 13 tours, ~114 s, 77/150 PV | ✅ |
| Bosquet des Ronces | Sans stuff, D5 | défaite | aucune victoire (3 decks) | ✅ |
| Bosquet des Ronces | Stuff faible, D10 | défaite | aucune victoire (3 decks) | ✅ |
| Bosquet des Ronces | Stuff fort, D10 (serré) | victoire | 13 tours, ~106 s, 147/300 PV : trop de marge (147/300 PV au plus bas) | ❌ |
| Tourbière des Noyés | Niveau 1 sans stuff, D1 | victoire | 12 tours, ~99 s, 86/150 PV | ✅ |
| Tourbière des Noyés | Sans stuff, D3 | victoire | 14 tours, ~115 s, 33/150 PV | ✅ |
| Tourbière des Noyés | Sans stuff, D5 | défaite | aucune victoire (3 decks) | ✅ |
| Tourbière des Noyés | Stuff faible, D10 | défaite | aucune victoire (3 decks) | ✅ |
| Tourbière des Noyés | Stuff fort, D10 (serré) | victoire | 16 tours, ~140 s, 40/300 PV | ✅ |
| Caldeira des Cendres | Niveau 1 sans stuff, D1 | victoire | 14 tours, ~112 s, 53/150 PV | ✅ |
| Caldeira des Cendres | Sans stuff, D3 | victoire | 14 tours, ~131 s, 70/150 PV | ✅ |
| Caldeira des Cendres | Sans stuff, D5 | défaite | gagné en 18 tours avec multi-element, 22/150 PV | ❌ |
| Caldeira des Cendres | Stuff faible, D10 | défaite | gagné en 22 tours avec multi-element, 83/240 PV | ❌ |
| Caldeira des Cendres | Stuff fort, D10 (serré) | victoire | 18 tours, ~168 s, 136/300 PV : trop de marge (173/300 PV au plus bas) | ❌ |
| Falaises Hurlantes | Niveau 1 sans stuff, D1 | victoire | 12 tours, ~95 s, 94/150 PV | ✅ |
| Falaises Hurlantes | Sans stuff, D3 | victoire | 13 tours, ~118 s, 73/150 PV | ✅ |
| Falaises Hurlantes | Sans stuff, D5 | défaite | aucune victoire (3 decks) | ✅ |
| Falaises Hurlantes | Stuff faible, D10 | défaite | aucune victoire (3 decks) | ✅ |
| Falaises Hurlantes | Stuff fort, D10 (serré) | victoire | 14 tours, ~121 s, 91/300 PV | ✅ |

16/20 cibles atteintes.

## Decks testés

- **feu-poussee** : Flèche ardente, Bond arrière, Flèche fracassante, Tir concentré, Coup de pied
- **multi-element** : Flèche ardente, Flèche givrée, Flèche du vent, Pluie de flèches, Flèche fracassante
- **concentration** : Flèche ardente, Tir concentré, Flèche givrée, Flèche du vent, Bond arrière
