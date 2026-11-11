/**
 * Mécaniques des boss et traits des monstres de la tranche 1 (choix de Kevin, 2026-11-11) :
 * une mécanique simple par boss, annoncée un tour à l'avance, et un trait propre à chaque donjon.
 * Les valeurs sont dans des objets modifiables pour que le solveur puisse les régler (--set mechanic.*).
 */
import type { BossMechanic, MonsterTrait } from './monsters.js';

export const MECHANICS = {
  /** Gardien racineux : un tour sur deux, marque la case de l'Archer et ses 4 voisines ; éruption au tour suivant. */
  roots: { damage: 12, pmRemoval: 2, every: 2 },
  /** Reine Batracienne : pond un œuf tous les 3 tours (dès son 2e tour) ; il éclot après 2 tours. */
  brood: { every: 3, first: 2, hatchTurns: 2, egg: 'oeuf_batracien' },
  /** Golem de magma : +2 chaleur par tour, jauge sur 4 ; à 4 il annonce une explosion de rayon 2, puis refroidit. */
  overheat: { max: 4, gainPerTurn: 2, waterCooling: 1, radius: 2, damage: 18, cooledDamageTaken: 1.5 },
  /** Harpie matriarche : un tour sur deux, annonce un sens ; au tour suivant tout le monde sauf elle est poussé. */
  gale: { push: 2, every: 2 },
  /** Ronceau : les monstres collés à un Ronceau subissent moins de dégâts. */
  thornGuard: { damageTaken: 0.5 },
  /** Sangsue : se soigne d'une part des dégâts infligés. */
  lifesteal: { ratio: 1 },
  /** Salamandre : explose à sa mort sur les 8 cases autour. */
  deathBlast: { damage: 8, burn: { damage: 3, turns: 2 } },
  /** Vautour : bonus de dégâts quand l'Archer est sous la moitié de ses PV. */
  finisher: { threshold: 0.5, bonus: 1.5 },
};

/** Textes pour le joueur (fiches de monstre et bandeaux). */
export const MECHANIC_TEXT: Record<BossMechanic, { name: string; text: string }> = {
  roots: { name: 'Racines', text: 'Un tour sur deux, marque votre case et les 4 cases autour. Au tour suivant, des racines en jaillissent : dégâts et −2 PM. Quittez les cases marquées.' },
  brood: { name: 'Ponte', text: 'Tous les 3 tours, pond un œuf à côté d’elle. S’il n’est pas détruit en 2 tours, il éclot en Crapaud.' },
  overheat: { name: 'Surchauffe', text: 'Sa chaleur monte de 2 par tour. À 4, il annonce une explosion sur 2 cases autour de lui, puis refroidit un tour : immobile, il subit +50 % de dégâts. Chaque tour où vous le touchez à l’Eau, sa chaleur baisse de 1.' },
  gale: { name: 'Grand vent', text: 'Un tour sur deux, annonce un sens. Au tour suivant, tout le monde sauf elle est poussé de 2 cases dans ce sens : collision contre un rocher ou une unité.' },
};

export const TRAIT_TEXT: Record<MonsterTrait, { name: string; text: string }> = {
  thornGuard: { name: 'Haie d’épines', text: 'Les monstres collés à un Ronceau subissent moitié moins de dégâts.' },
  lifesteal: { name: 'Vol de vie', text: 'Se soigne des dégâts qu’elle vous inflige.' },
  deathBlast: { name: 'Explosive', text: 'Explose à sa mort : dégâts Feu et brûlure sur les 8 cases autour, monstres compris.' },
  finisher: { name: 'Charognard', text: 'Inflige +50 % de dégâts quand vous êtes sous la moitié de vos PV.' },
};
