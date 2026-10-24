import { DEFAULT_MODS } from '../../core/battle';
import { startBattle } from '../../core/run';
import { FLOORS, type FloorKind } from '../../data/encounters';
import { unitById } from '../../data/units';
import { characterSvg } from '../../render/characters';
import type { App } from '../app';
import { h, s } from '../dom';
import { NUM, button, elColor, hpBar } from '../widgets';

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
        h('span', { class: 'map-label' }, h('b', {}, `${i + 1}층 · ${KIND_LABEL[f.kind]}`), h('small', {}, f.name)),
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
      button('← 메인', () => app.go('title'), { class: 'btn-back', title: '진행 상황은 저장됩니다' }),
      h('div', { class: 'screen-title' }, h('h1', {}, '별의 여정')),
      h('span', { class: 'head-spacer' }),
    ),
    h(
      'div',
      { class: 'map-layout' },
      h('section', { class: 'map-board' }, chart(run.floor)),
      h(
        'aside',
        { class: 'map-side' },
        h(
          'div',
          { class: `next-floor panel kind-${floor.kind}` },
          h('p', { class: 'eyebrow' }, `${run.floor + 1}층 / ${FLOORS.length}층`),
          h('h2', {}, floor.name),
          h('p', { class: 'muted' }, floor.kind === 'boss' ? '별을 삼키는 자가 기다립니다. 체인 3 미만의 공격은 절반만 통하니, 링크를 길게 이으세요.' : floor.kind === 'elite' ? '강한 적이 기다립니다. 충분히 대비하세요.' : '이곳을 떠도는 적들을 물리치세요.'),
          button('전투 시작', () => {
            startBattle(run);
            app.save();
            app.go('battle');
          }, { variant: 'primary', class: 'btn-wide' }),
        ),
        h(
          'div',
          { class: 'panel party-status' },
          h('h3', {}, '파티'),
          run.team.map((a, i) => {
            const u = unitById(a.defId);
            const row = h(
              'div',
              { class: 'party-line', style: { '--el': elColor(u.element) } },
              h('div', { class: 'party-fig' }),
              h('div', { class: 'party-info' }, h('div', { class: 'party-name' }, h('span', { class: 'slot-num' }, NUM[i]), u.name), h('div', { class: 'party-sub' }, `공격 ${a.atk} · 방어 ${a.def}`), hpBar(a.hp, a.maxHp, 0)),
            );
            row.querySelector('.party-fig')!.innerHTML = characterSvg(u.id);
            return row;
          }),
          modLines.length ? h('div', { class: 'mods' }, modLines.map((m) => h('span', { class: 'mod-chip' }, m))) : null,
        ),
      ),
    ),
  );
}
