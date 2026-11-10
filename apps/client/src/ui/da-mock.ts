/**
 * Maquettes de direction artistique « casual mobile » (?dev=da&v=azur|arene&s=hub|combat).
 * Servent à choisir une variante avec Kevin avant la refonte écran par écran.
 */
import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './da-mock.css';
import { assetUrl } from './assets';
import { elementIcon, icon } from './icons';

const img = (p: string, cls = '') => `<img class="${cls}" src="${assetUrl(p)}" alt="" draggable="false">`;

function hub(): string {
  const dungeons = [
    { id: 'bosquet_des_ronces', name: 'Bosquet des Ronces', el: 'earth', weak: 'fire', boss: 'gardien_racineux', best: 3 },
    { id: 'tourbiere_des_noyes', name: 'Tourbière des Noyés', el: 'water', weak: 'air', boss: 'reine_batracienne', best: 0 },
  ];
  const d = dungeons[0];
  return `
  <div class="da-hub">
    <header class="da-topbar">
      <div class="da-player">
        <div class="da-lvl"><span>12</span></div>
        <div class="da-player-txt"><b class="da-stroke">Sylvan</b><div class="da-xp"><i style="width:62%"></i><span>372 / 600</span></div></div>
      </div>
      <div class="da-res"><span class="da-res-ico shard">${icon('shard')}</span><b class="da-stroke">1 240</b><button class="da-plus" aria-label="Plus">${icon('plus')}</button></div>
      <button class="da-round" aria-label="Paramètres">${icon('settings')}</button>
    </header>

    <div class="da-title"><span class="da-stroke">Donjons</span><small>Tranche 1</small></div>

    <article class="da-dungeon el-${d.el}">
      <div class="da-dungeon-art">${img(`dungeons/${d.id}.webp`)}
        <span class="da-ribbon da-stroke">Record : diff. ${d.best}</span>
        ${img(`units/${d.boss}.png`, 'da-boss')}
      </div>
      <div class="da-dungeon-body">
        <div class="da-dname da-stroke">${d.name}</div>
        <div class="da-tags"><span class="da-tag">${elementIcon(d.el)} Terre</span><span class="da-tag weak">Craint ${elementIcon(d.weak)} Feu</span></div>
        <div class="da-rooms"><span class="da-room">1</span><i></i><span class="da-room">2</span><i></i><span class="da-room boss">${icon('skull')}</span></div>
      </div>
    </article>
    <div class="da-dots"><i class="on"></i><i></i><i></i><i></i></div>

    <section class="da-panel">
      <div class="da-panel-head da-stroke">Difficulté <b>4</b></div>
      <div class="da-steps">${Array.from({ length: 10 }, (_, i) => `<span class="${i < 3 ? 'done' : ''} ${i === 3 ? 'on' : ''}">${i + 1}</span>`).join('')}</div>
      <p class="da-note">Monstres : +45 % de PV, de dégâts et d’XP</p>
    </section>

    <section class="da-panel da-deck">
      ${['fleche_ardente', 'bond_arriere', 'fleche_givree', 'tir_concentre', 'fleche_du_vent'].map((s, i) => `<div class="da-card">${img(`icons/${s}.webp`)}<span class="da-cost">${[3, 2, 3, 4, 2][i]}</span></div>`).join('')}
    </section>

    <button class="da-btn da-btn--cta da-btn--xl"><span class="da-stroke">Combattre</span></button>

    <nav class="da-tabs">
      <button class="on">${icon('dungeons')}<span class="da-stroke">Donjons</span></button>
      <button>${icon('grimoire')}<span class="da-stroke">Grimoire</span><i class="da-badge">1</i></button>
      <button>${icon('equipment')}<span class="da-stroke">Équipement</span></button>
      <button>${icon('workshop')}<span class="da-stroke">Atelier</span></button>
    </nav>
  </div>`;
}

function combat(): string {
  const order = [['archer', 150, 150, true], ['ronceau', 38, 38], ['guepe', 24, 30], ['ronceau', 38, 38]] as const;
  return `
  <div class="da-combat" style="background-image:url('${assetUrl('../dev/board.png')}')">
    <header class="da-ctop">
      <div class="da-cinfo"><span class="da-pill da-stroke">Salle 1/3</span><span class="da-pill da-stroke">Tour 2</span></div>
      <div class="da-order">${order
        .map(([t, hp, max, me]) => `<div class="da-oc ${me ? 'me' : ''}">${img(`units/${t}.png`)}<i style="width:${(100 * hp) / max}%"></i></div>`)
        .join('')}</div>
      <div class="da-cinfo"><span class="da-pill da-stroke num">0:42</span><button class="da-round sm" aria-label="Pause">${icon('pause')}</button></div>
    </header>
    <button class="da-round da-threat" aria-label="Menace">${icon('eye')}</button>
    <footer class="da-cdock">
      <div class="da-me">
        <div class="da-hp"><i style="width:78%"></i><b class="da-stroke num">117 / 150</b></div>
        <div class="da-res3">
          <span class="da-gem pa">${icon('pa')}<b class="da-stroke">6</b></span>
          <span class="da-gem pm">${icon('pm')}<b class="da-stroke">3</b></span>
          <span class="da-gem conc">${icon('conc')}<b class="da-stroke">4</b></span>
        </div>
      </div>
      <div class="da-spells">${['fleche_ardente', 'bond_arriere', 'fleche_givree', 'tir_concentre', 'fleche_du_vent']
        .map((s, i) => `<button class="da-card ${i === 0 ? 'sel' : ''} ${i === 3 ? 'off' : ''}">${img(`icons/${s}.webp`)}<span class="da-cost">${[3, 2, 3, 4, 2][i]}</span></button>`)
        .join('')}</div>
      <button class="da-btn da-btn--cta da-end"><span class="da-stroke">Fin du tour</span></button>
    </footer>
  </div>`;
}

export function renderDaMock(app: HTMLElement): void {
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.da = q.get('v') ?? 'azur';
  app.innerHTML = q.get('s') === 'combat' ? combat() : hub();
}
