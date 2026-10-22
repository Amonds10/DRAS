import { DEFAULT_MODS } from '../../core/battle';
import { startBattle } from '../../core/run';
import { FLOORS, type FloorKind } from '../../data/encounters';
import { unitById } from '../../data/units';
import { allyFigure } from '../../render/figures';
import type { App } from '../app';
import { h, s } from '../dom';
import { ROMAN, button, decoRule, elColor, hpBar } from '../widgets';

const KIND_LABEL: Record<FloorKind, string> = { battle: '전투', elite: '강적', boss: '보스' };
const KIND_GLYPH: Record<FloorKind, string> = { battle: '✧', elite: '✶', boss: '✹' };
/** 성도 위 층 위치(%) */
const POS: [number, number][] = [
  [16, 82], [38, 62], [24, 38], [60, 30], [80, 12],
];

function chart(current: number): HTMLElement {
  const lines = POS.slice(1).map(([x, y], i) => {
    const [px, py] = POS[i];
    const state = i + 1 <= current ? 'done' : i + 1 === current + 1 ? 'next' : '';
    return s('line', { x1: px, y1: py, x2: x, y2: y, class: `map-line ${state}`, 'vector-effect': 'non-scaling-stroke' });
  });
  return h(
    'div',
    { class: 'map-art' },
    s('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, lines),
    FLOORS.map((f, i) => {
      const state = i < current ? 'done' : i === current ? 'current' : 'locked';
      return h(
        'div',
        { class: `map-node ${state} kind-${f.kind}`, style: { left: `${POS[i][0]}%`, top: `${POS[i][1]}%` } },
        h('span', { class: 'map-star' }, h('span', {}, KIND_GLYPH[f.kind])),
        h('span', { class: 'map-label' }, h('b', {}, `${ROMAN[i]} · ${KIND_LABEL[f.kind]}`), h('small', {}, f.name)),
      );
    }),
  );
}

export function mapScreen(app: App): HTMLElement {
  const run = app.run!;
  const floor = FLOORS[run.floor];
  const mods = run.mods;
  const modLines = [
    mods.stardustPerTurn !== DEFAULT_MODS.stardustPerTurn && `턴당 성진 ${mods.stardustPerTurn}`,
    mods.startStardust !== DEFAULT_MODS.startStardust && `시작 성진 ${mods.startStardust}`,
    mods.fullChainBonus !== DEFAULT_MODS.fullChainBonus && `성좌 완성 피해 ×${mods.fullChainBonus}`,
  ].filter(Boolean) as string[];

  return h(
    'main',
    { class: 'map-wrap' },
    h(
      'header',
      { class: 'screen-head' },
      button('‹ 메인', () => app.go('title'), { class: 'btn-back', title: '진행 상황은 저장됩니다' }),
      h('div', { class: 'screen-title' }, h('p', { class: 'kicker' }, 'STAR CHART'), h('h1', {}, '별의 여정')),
      h('span', { class: 'head-spacer' }),
    ),
    h(
      'div',
      { class: 'map-layout' },
      h('section', { class: 'map-board' }, h('div', { class: 'bg-astrolabe' }, h('i'), h('i'), h('i')), chart(run.floor)),
      h(
        'aside',
        { class: 'map-side' },
        h(
          'div',
          { class: `next-floor deco-card kind-${floor.kind}` },
          h('p', { class: 'kicker' }, `FLOOR ${ROMAN[run.floor]} / ${ROMAN[FLOORS.length - 1]}`),
          h('h2', {}, floor.name),
          h('p', { class: 'muted' }, floor.kind === 'boss' ? '별을 삼키는 자가 기다립니다. 체인 3 미만의 공격은 절반만 통합니다.' : floor.kind === 'elite' ? '강한 적이 기다립니다. 충분히 대비하세요.' : '성역을 떠도는 적들을 물리치세요.'),
          button('전투 개시', () => {
            startBattle(run);
            app.save();
            app.go('battle');
          }, { variant: 'primary', class: 'btn-wide' }),
        ),
        h(
          'div',
          { class: 'dossier party-status' },
          h('p', { class: 'dossier-kicker' }, 'PARTY'),
          decoRule(),
          run.team.map((a, i) => {
            const u = unitById(a.defId);
            const row = h(
              'div',
              { class: 'party-line', style: { '--el': elColor(u.element) } },
              h('div', { class: 'party-fig' }),
              h('div', { class: 'party-info' }, h('div', { class: 'party-name' }, h('span', { class: 'slot-num' }, ROMAN[i]), u.name), h('div', { class: 'party-sub' }, `ATK ${a.atk} · DEF ${a.def}`), hpBar(a.hp, a.maxHp, 0)),
            );
            row.querySelector('.party-fig')!.innerHTML = allyFigure(u.role, elColor(u.element), u.element === 'star');
            return row;
          }),
          modLines.length ? h('div', { class: 'mods' }, modLines.map((m) => h('span', { class: 'mod-chip' }, m))) : null,
        ),
      ),
    ),
  );
}
