import { randomSeed, Rng } from '../../core/rng';
import { newRun } from '../../core/run';
import { TEAM_SIZE, analyzeTeam } from '../../core/team';
import type { UnitDef } from '../../core/types';
import { spellById } from '../../data/spells';
import { ROLE_NAMES, UNIT_LIST, unitById } from '../../data/units';
import { characterSvg } from '../../render/characters';
import type { App } from '../app';
import { h } from '../dom';
import { showHelp } from '../help';
import { NUM, button, costPips, elBadge, elColor, reactionChip, spellFlow, tagLabel } from '../widgets';

function spellLine(spellId: string): HTMLElement {
  const sp = spellById(spellId);
  return h(
    'div',
    { class: 'spell-line' },
    h('div', { class: 'spell-line-head' }, tagLabel(sp), h('span', { class: 'spell-name' }, sp.name), spellFlow(sp), costPips(sp.cost)),
    h('p', { class: 'spell-desc' }, sp.desc),
  );
}

function unitCard(unit: UnitDef, order: number, onToggle: () => void, full: boolean): HTMLElement {
  const selected = order >= 0;
  const color = elColor(unit.element);
  const card = h(
    'button',
    {
      type: 'button',
      class: `unit-card ${selected ? 'selected' : ''}`,
      style: { '--el': color },
      'aria-pressed': selected ? 'true' : 'false',
      disabled: !selected && full,
      onclick: onToggle,
    },
    h(
      'div',
      { class: 'unit-portrait' },
      h('div', { class: 'portrait-fig' }),
      h('span', { class: 'portrait-code' }, unit.code),
      selected ? h('span', { class: 'order-seal' }, NUM[order]) : null,
    ),
    h(
      'div',
      { class: 'unit-body' },
      h('div', { class: 'unit-head' }, elBadge(unit.element, 'sm'), h('h3', {}, unit.name), h('span', { class: 'role-tag' }, ROLE_NAMES[unit.role])),
      h('p', { class: 'unit-concept' }, unit.concept),
      h('dl', { class: 'unit-stats' }, h('div', {}, h('dt', {}, 'HP'), h('dd', {}, unit.maxHp)), h('div', {}, h('dt', {}, '공격'), h('dd', {}, unit.atk)), h('div', {}, h('dt', {}, '방어'), h('dd', {}, unit.def))),
      h('div', { class: 'unit-spells' }, h('p', { class: 'unit-spells-head' }, `스킬 ${unit.spells.length}개 · 매 라운드 2장`), unit.spells.map(spellLine)),
    ),
  );
  card.querySelector('.portrait-fig')!.innerHTML = characterSvg(unit.id);
  return card;
}

function synergyPanel(selected: string[]): HTMLElement {
  if (selected.length === 0) {
    return h('div', { class: 'synergy empty' }, h('p', {}, '술사를 고르면 이 팀이 만들 수 있는 링크와 성좌 반응을 보여줍니다.'));
  }
  const syn = analyzeTeam(selected);
  return h(
    'div',
    { class: 'synergy' },
    h(
      'div',
      { class: 'syn-stats' },
      h('div', { class: 'syn-stat' }, h('span', { class: 'syn-label' }, '가능한 최대 체인'), h('span', { class: `syn-value ${syn.maxChain >= 4 ? 'full' : ''}` }, syn.maxChain)),
      h('div', { class: 'syn-stat' }, h('span', { class: 'syn-label' }, '링크 쌍'), h('span', { class: 'syn-value' }, syn.linkPairs)),
    ),
    h('div', { class: 'syn-block' }, h('h4', {}, '발동 가능한 성좌 반응'), syn.reactions.length ? h('div', { class: 'chip-row' }, syn.reactions.map(reactionChip)) : h('p', { class: 'syn-none' }, '아직 없음')),
    syn.bestSequence.length > 1
      ? h(
          'div',
          { class: 'syn-block' },
          h('h4', {}, '손패가 맞으면 이런 순서로'),
          h(
            'ol',
            { class: 'syn-seq' },
            syn.bestSequence.map((st) => {
              const sp = spellById(st.spellId);
              return h('li', {}, elBadge(unitById(st.unitId).element, 'sm'), h('span', {}, sp.name), spellFlow(sp));
            }),
          ),
        )
      : null,
  );
}

export function teamScreen(app: App): HTMLElement {
  let selected: string[] = [];
  const root = h('main', { class: 'team-wrap' });

  const render = () => {
    const full = selected.length >= TEAM_SIZE;
    const toggle = (id: string) => {
      selected = selected.includes(id) ? selected.filter((x) => x !== id) : full ? selected : [...selected, id];
      render();
    };
    const randomize = () => {
      selected = new Rng(randomSeed()).shuffle(UNIT_LIST.map((u) => u.id)).slice(0, TEAM_SIZE);
      render();
    };
    const start = () => {
      app.run = newRun(selected, randomSeed());
      app.save();
      app.go('map');
    };

    root.replaceChildren(
      h(
        'header',
        { class: 'screen-head' },
        button('← 메인', () => app.go('title'), { class: 'btn-back' }),
        h('div', { class: 'screen-title' }, h('p', { class: 'eyebrow' }, 'SQUAD'), h('h1', {}, '술사 편성')),
        button('?', () => showHelp(), { class: 'btn-icon', title: '플레이 방법' }),
      ),
      h(
        'div',
        { class: 'team-layout' },
        h('section', { class: 'unit-grid', 'aria-label': '술사 목록' }, UNIT_LIST.map((u) => unitCard(u, selected.indexOf(u.id), () => toggle(u.id), full))),
        h(
          'aside',
          { class: 'side-panel' },
          h('h2', {}, '나의 팀 ', h('span', {}, `${selected.length} / ${TEAM_SIZE}`)),
          h(
            'ol',
            { class: 'team-slots' },
            Array.from({ length: TEAM_SIZE }, (_, i) => {
              const id = selected[i];
              if (!id) return h('li', { class: 'slot empty' }, h('span', { class: 'slot-num' }, NUM[i]), '빈 자리');
              const u = unitById(id);
              return h('li', { class: 'slot', style: { '--el': elColor(u.element) } }, h('span', { class: 'slot-num' }, NUM[i]), elBadge(u.element, 'sm'), h('span', {}, u.name), button('✕', () => toggle(id), { class: 'btn-icon btn-xs', title: '빼기' }));
            }),
          ),
          synergyPanel(selected),
          h('div', { class: 'team-actions' }, button('무작위 편성', randomize), button('여정 시작', start, { variant: 'primary', disabled: !full })),
        ),
      ),
    );
  };

  render();
  return root;
}
