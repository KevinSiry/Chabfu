# Game Design Document — Jeu d'archer type Wakfu

Nov 10, 2026 · @Kevin Siry · Titre provisoire, version 0.1

## 1. Pitch

Un jeu web solo de combat tactique au tour par tour sur grille, inspiré de Wakfu. Le joueur incarne un unique **Archer** dans un monde de fantasy coloré et léger. Le cœur du jeu : farmer des donjons très courts (1 à 3 minutes), toujours identiques, et chercher la route parfaite pour grimper dans les classements.

Le niveau du personnage ne mesure pas sa puissance : il débloque des tranches. À tout moment, le joueur peut se **redéfinir** sur une tranche inférieure, et son personnage est alors ramené au niveau de cette tranche. Toutes les tranches restent donc intéressantes pour toujours.

## 2. Piliers de design

- **Optimisation avant progression.** On joue pour trouver la meilleure route, pas pour accumuler de la puissance.
- **Farm court et mécanique.** Un donjon = 1 à 2 salles + un boss, 1 à 3 minutes une fois maîtrisé.
- **Chaque tranche est un jeu complet.** Son stuff, son deck, ses passifs, ses donjons, ses classements.
- **Chaque sort compte.** Deck limité, coûts serrés, Concentration à gérer : aucun sort n'est joué « par défaut ».
- **Équité des classements.** Un vétéran redéfini sur une tranche n'a aucun avantage de puissance sur un joueur qui y arrive.

## 3. Boucle de jeu

1. Choisir une tranche (se redéfinir si besoin).
2. Choisir un donjon et un niveau de difficulté.
3. Composer son deck de sorts et équiper le stuff de la tranche.
4. Faire le run (1 à 3 minutes).
5. Récolter ressources et objets, améliorer le stuff de la tranche.
6. Améliorer son score (tours, chrono, difficulté) et recommencer.

En parallèle, la progression permanente (niveau, sorts, passifs, collection d'équipement) ouvre de nouvelles tranches et de nouvelles options de deck.

## 4. Niveaux, tranches et redéfinition

### Tranches

Peu de tranches, mais larges. Proposition : **5 tranches de 20 niveaux**, niveau maximum 100.

| Tranche | Niveaux | Niveau de redéfinition |
| --- | --- | --- |
| T1 | 1–20 | 20 |
| T2 | 21–40 | 40 |
| T3 | 41–60 | 60 |
| T4 | 61–80 | 80 |
| T5 | 81–100 | 100 |

### Redéfinition

Un personnage peut se redéfinir sur n'importe quelle tranche inférieure ou égale à son niveau. Il est alors scalé au niveau de redéfinition de la tranche (ex. un niveau 65 redéfini en T1 joue au niveau 20).

Une fois redéfini :

- **Sorts** : seuls les sorts dont le niveau de déblocage est ≤ au niveau de redéfinition sont disponibles pour le deck.
- **Passifs** : seuls les passifs dont le niveau est ≤ au niveau de redéfinition sont utilisables, avec le nombre d'emplacements de la tranche.
- **Stuff** : le personnage utilise l'équipement dédié à la tranche (voir section 8).

Résultat : un vétéran en T1 a exactement les mêmes options qu'un vrai niveau 20 qui aurait tout débloqué. Son seul avantage est sa connaissance du jeu.

## 5. Système de combat

### Bases

- Grille isométrique, tour par tour, initiative fixe.
- Ressources par tour : **PA** (actions, base 6), **PM** (déplacement, base 3). Valeurs à équilibrer par tranche.
- Lignes de vue et portée : centrales pour un archer. Les obstacles du décor sont pensés comme des outils (couverture, murs de collision).
- Les sorts ont un coût en PA, une portée min/max, éventuellement une limite d'utilisation par tour ou un temps de recharge.

### Concentration (mécanique signature)

Jauge de **0 à 10** qui se construit et se dépense.

Gagner de la Concentration (proposition) :

- +1 au début du tour si le personnage n'a pas bougé au tour précédent.
- Certains sorts « précis » donnent de la Concentration sous condition (ex. tir à portée ≥ 5, cible sur sa faiblesse élémentaire).

Perdre de la Concentration :

- -1 par PM dépensé.
- Les sorts de désengagement coûtent de la Concentration (sauf exceptions débloquées plus tard).

La dépenser :

- Sorts « Concentrés » qui consomment un montant fixe ou toute la jauge pour des effets puissants (dégâts multipliés, tir perforant, etc.).

La tension voulue : **rester en place pour charger** au risque d'être rattrapé au contact, ou **reculer** et perdre son élan. C'est ce choix, tour après tour, qui rend la route optimale intéressante à chercher.

### Éléments et faiblesses

Quatre éléments, chacun avec une identité tactique pour l'Archer :

| Élément | Identité |
| --- | --- |
| Feu | Dégâts sur la durée (brûlure), zones |
| Eau | Contrôle : retrait de PM, ralentissement |
| Terre | Poussées, dégâts de collision, tirs perforants |
| Air | Mobilité, portée, tirs multiples |

Chaque monstre a une faiblesse et une résistance. Bonus **notable mais pas obligatoire** : proposition +30 % de dégâts sur la faiblesse, -20 % sur la résistance. Le stuff donne des maîtrises élémentaires, ce qui oriente vers 1 ou 2 éléments principaux.

### Gestion du contact

L'Archer n'est pas fait pour le corps à corps. Il s'en sort avec :

- des **sorts de désengagement** (bond arrière, roulade) ;
- des **poussées** (flèche fracassante, coup de pied), avec dégâts de collision contre un mur ou un autre monstre.

## 6. L'Archer : ébauche du catalogue de sorts

Deck limité, dont la taille grandit avec les tranches (proposition : 5 / 6 / 7 / 8 / 8 sorts). Valeurs indicatives, à équilibrer.

| Niv. | Sort | Élément | PA | Effet |
| --- | --- | --- | --- | --- |
| 1 | Flèche ardente | Feu | 3 | Dégâts + brûlure 2 tours. +1 Concentration si portée ≥ 5 |
| 1 | Bond arrière | Neutre | 2 | Recule de 2 cases. -1 Concentration |
| 3 | Flèche fracassante | Terre | 4 | Dégâts + pousse de 2 cases, dégâts de collision |
| 6 | Flèche givrée | Eau | 3 | Dégâts + retire 1 PM |
| 9 | Flèche du vent | Air | 2 | Faibles dégâts, portée max +2 |
| 12 | Tir concentré | Neutre | 2 | Consomme 4 Concentration : le prochain tir fait double dégâts |
| 15 | Pluie de flèches | Air | 4 | Zone en croix, dégâts réduits |
| 18 | Coup de pied | Terre | 2 | Corps à corps : pousse de 1, rend 1 PM |
| 24 | Flèche explosive | Feu | 5 | Zone de 1 case autour de la cible |
| 30 | Brume | Eau | 3 | Zone au sol : -2 PM aux ennemis qui la traversent |
| 36 | Roulade | Neutre | 1 | Se déplace de 1 case sans perdre de Concentration |
| 45 | Tir perforant | Terre | 4 | Ligne : touche tous les ennemis alignés. Consomme 3 Concentration |
| 55 | Œil du faucon | Neutre | 2 | +2 portée ce tour, +2 Concentration |
| 70 | Volée tempête | Air | 6 | Consomme toute la Concentration : un tir par point dépensé |
| 85 | Flèche du chasseur | Élément au choix | 4 | Dégâts massifs sur une cible à sa faiblesse. Consomme 6 Concentration |

### Passifs

- Débloqués par niveau, ils sont limités au niveau de redéfinition (voir section 4).
- Nombre d'emplacements par tranche : 1 / 2 / 3 / 4 / 5.
- Ils modifient la façon de jouer plutôt que la puissance brute (ex. « Bond arrière ne coûte plus de Concentration », « +1 Concentration en tuant une cible »).

## 7. Donjons

### Structure

- **Plusieurs donjons par tranche.** Chaque tranche propose plusieurs donjons (proposition : 3 à 4), chacun avec une dominante élémentaire différente pour varier les decks optimaux.
- **Un donjon est unique à sa tranche.** Il n'appartient qu'à une seule tranche et n'est jamais recyclé dans une autre.
- **Format** : 1 à 2 salles + une salle de boss. Durée cible : 1 à 3 minutes une fois maîtrisé.
- **Fixes** : mêmes salles, mêmes monstres, mêmes placements à chaque run. Le joueur peut apprendre le donjon par cœur et optimiser sa route.

### Difficultés

- Chaque donjon est disponible en plusieurs difficultés (proposition : 1 à 10).
- **La difficulté n'augmente que les PV et les dégâts des monstres** (proposition : +15 % par palier). Salles, placements et comportements restent identiques : la route apprise reste valable, mais la marge d'erreur diminue.
- Une difficulté plus haute compte dans le classement et donne accès à de meilleures ressources.

### Ressources par difficulté

Chaque ressource et chaque objet a une **difficulté de référence**. La progression dans l'équipement suit ainsi la progression en difficulté.

Règle de drop :

- **À la difficulté de référence et au-dessus** : taux de drop de base à la difficulté de référence, puis de plus en plus élevé à chaque palier au-dessus (proposition : +25 % du taux de base par palier). Monter en difficulté fait donc tomber plus souvent les objets des paliers inférieurs.
- **À la difficulté de référence − 1** : drop possible, mais avec une probabilité beaucoup plus faible (proposition : taux divisé par 10).
- **En dessous** : aucun drop.

Exemple : une ressource rare de référence 4 tombe normalement en difficulté 4 et plus, très rarement en difficulté 3, et jamais en 1 ou 2. Un joueur un peu juste peut donc avoir un coup de chance, mais la voie normale reste de réussir le palier.

| Difficulté | Ressources (difficulté de référence) | Ce qu'elles permettent |
| --- | --- | --- |
| 1–3 | Ressources communes | Craft des objets Communs et Inhabituels |
| 4–5 | Ressources rares | Craft des objets Rares, runes de base |
| 6–8 | Ressources mythiques, drop Légendaire possible | Craft des objets Mythiques, runes avancées |
| 9–10 | Ressources ultimes | Runes parfaites, meilleures chances de Légendaire |

Chaque donjon a ses propres ressources : pour compléter le stuff d'une tranche, il faut monter en difficulté dans plusieurs de ses donjons.

## 8. Stuff

L'équipement est le moteur du farm : les donjons servent à l'optimiser, et la rareté maximale est l'objectif ultime de chaque tranche.

### Principes

- **Un équipement par tranche** : chaque tranche a ses objets, et le joueur garde un loadout dédié à chaque tranche.
- **Emplacements** (proposition) : arc, carquois, coiffe, cape, plastron, bottes, amulette, 2 anneaux.
- **Chaque objet existe en plusieurs raretés** : la même pièce (ex. « Arc du Gardien de la T2 ») peut être obtenue en rareté Commune jusqu'à Légendaire. Plus la rareté est haute, plus les caractéristiques sont fortes et plus l'objet a d'emplacements de runes.

### Raretés

| Rareté | Puissance (indicative) | Emplacements de runes | Obtention |
| --- | --- | --- | --- |
| Commune | 40 % | 0 | Craft, drop fréquent |
| Inhabituelle | 55 % | 1 | Craft, drop |
| Rare | 70 % | 1 | Craft (ressources rares), drop |
| Mythique | 100 % (référence) | 2 | Craft (ressources mythiques), drop rare |
| Légendaire | 120 % | 3 | Drop uniquement, très rare, difficulté élevée |

La Légendaire est volontairement la plus dure à obtenir : c'est l'aboutissement de l'optimisation d'une tranche.

Échelle retenue par Kevin (2026-11-10) : un objet commun ne donne qu'un peu de stats, un mythique beaucoup. Les stats d'un objet sont fixes (pas de jets), données en Mythique et multipliées par la puissance de la rareté ; les +1 (PA, PM, portée, Concentration) n'apparaissent qu'à partir d'Inhabituelle. Stats possibles : PV, maîtrise et résistance par élément (résistance plafonnée à 50 %), Dommages (ajoutés à chaque coup de sort), portée, PA/PM, Concentration par salle.

### Obtention

- **Drop** : chaque boss a sa table d'objets. À chaque drop, la rareté est tirée au sort. La difficulté choisie augmente les chances de rareté élevée, et la Légendaire n'est possible qu'à partir d'un certain niveau de difficulté (ex. 6+).
- **Craft** : chaque recette produit un objet d'une rareté fixe, de Commune à Mythique. Les recettes de haute rareté demandent les ressources des paliers de difficulté correspondants (voir section 7).
- **Pas d'amélioration de rareté** : la rareté d'un objet est fixée à son obtention, par craft ou par drop. Un objet ne monte jamais en rareté.

**Rythme d'obtention (cibles du farm, révision du 2026-11-10).** Chabfu est un jeu de farm : une panoplie complète doit se mériter sur des dizaines, puis des centaines de runs. Le boss donne en général un seul objet (de 1,1 objet par run en D1 à 1,7 en D10), surtout en Commune et Inhabituelle. Cibles, drops et atelier compris, pour une panoplie complète de 9 emplacements farmée sur un seul donjon : Inhabituelle ≈ 20 runs (D3–D5), Rare ≈ 70 runs (D5), Mythique ≈ 180 runs (D8) ou ≈ 155 runs (D10), Légendaire hors d'atteinte en panoplie (environ une pièce tous les 150 à 250 runs en D10). L'outil `npm run economy` recalcule ce tableau après chaque changement de taux, de recette ou de recyclage.
- **Runes** : obtenues dans les donjons, elles se sertissent dans les emplacements et permettent d'affiner le build (maîtrise élémentaire, portée, Concentration, PA/PM).

### Utilité du surplus de farm

Le farm accumule beaucoup d'objets en double ou dépassés. Aucun drop ne doit être inutile : chaque objet en trop alimente une autre progression.

- **Recyclage en éclats.** Tout objet peut être détruit contre des éclats de sa tranche, en quantité qui dépend de sa rareté. Les éclats servent au craft et à la fabrication de runes. Ils restent propres à leur tranche pour garder une économie cohérente.
- **Doublons pour les runes.** Les doublons d'un objet ne servent pas à augmenter sa rareté : ils alimentent le système de runes (à définir).
- **Maîtrise d'objet.** Recycler les exemplaires d'un même objet fait progresser sa maîtrise. Chaque palier de maîtrise donne un bonus qui améliore le farm sans toucher à la puissance en combat : chances de rareté légèrement accrues pour cet objet, apparence alternative, titre. Les classements restent équitables.
- **Commandes de PNJ.** Des commandes tournantes demandent de livrer des objets précis (ex. « 3 Capes du Gardien Rares ») contre des runes, des ressources de palier supérieur ou des cosmétiques.
- **Recyclage automatique.** Une option pour recycler d'office les objets en dessous d'une rareté choisie, pour éviter de passer du temps à trier les sacs entre deux runs de 1 à 3 minutes.

### La boucle d'optimisation

C'est la boucle centrale du jeu :

1. Mieux s'équiper permet de monter en difficulté et de finir les donjons en moins de tours.
2. Moins de tours et plus de difficulté donnent plus de drops par heure et de meilleures chances de rareté.
3. Plus de drops et de ressources de palier donnent accès à des raretés plus hautes, jusqu'au Légendaire.

Optimiser son deck et sa route n'est donc pas seulement utile pour le classement : **aller plus vite, c'est farmer plus vite**, et atteindre plus tôt l'optimisation maximale de la tranche.

### Équilibrage à surveiller

- Les taux de drop de la Légendaire doivent rester bas même pour un joueur très rapide, sinon la rareté perd sa valeur.
- Les classements restent équitables à équipement égal : on peut envisager plus tard un classement « à équipement imposé » pour isoler le pur skill.

## 9. Classements

- Un classement par donjon et par tranche.
- Critères de tri (proposition) : 1) difficulté la plus haute, 2) nombre de tours le plus bas, 3) chrono le plus bas.
- Le chrono départage les joueurs qui ont trouvé la même route : il récompense l'exécution.
- Les donjons étant fixes, la communauté finira par trouver des routes optimales : c'est assumé, la compétition se joue sur la difficulté et l'exécution.

## 10. Progression permanente

- **Niveau** : débloque les tranches, les sorts et les passifs.
- **Sorts** : nouveaux sorts ajoutés au catalogue.
- **Passifs / talents** : nouveaux passifs disponibles.
- **Collection d'équipement** : toutes les pièces obtenues restent dans la collection et peuvent être équipées dans leur tranche.

## 11. Pistes techniques

- **Web** : client navigateur, compte en ligne pour les classements.
- **Logique de combat partagée** client/serveur (même code, ex. TypeScript), déterministe.
- **Validation des scores par replay** : le client envoie la suite d'actions du run, le serveur la rejoue pour vérifier tours et résultat. Ça protège les classements de la triche sans faire tourner le combat en temps réel sur le serveur.
- Le chrono est plus difficile à valider de façon fiable : à traiter à part (horodatage serveur du début et de la fin du run).

## 12. Questions ouvertes

- **Aléatoire** : coups critiques ou dégâts variables ? Avec des donjons fixes et des classements, un combat sans aléatoire (ou à graine fixe) rend les routes reproductibles.
- **Univers** : nom du jeu, monde, origine de l'Archer, ton de l'écriture.
- **Contenu** : nombre exact de donjons par tranche et de pièces d'équipement.
- **Taille du deck** et valeurs de PA/PM par tranche.
- **Modèle économique** : gratuit, achat unique, cosmétiques ?
- **Système de runes** : obtention, effets, emplacements, et rôle des doublons d'objets.
