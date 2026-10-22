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

/** 로스터 타일: 초상, 이름, 역할. 누르면 편성에 넣거나 뺀다. */
function rosterTile(unit: UnitDef, order: number, inspecting: boolean, full: boolean, onToggle: () => void, onInspect: () => void): HTMLElement {
  const selected = order >= 0;
  const tile = h(
    'button',
    {
      type: 'button',
      class: `roster-tile unit-card ${selected ? 'selected' : ''} ${inspecting ? 'inspecting' : ''}`,
      style: { '--el': elColor(unit.element) },
      'aria-pressed': selected ? 'true' : 'false',
      'aria-label': `${unit.name}, ${ROLE_NAMES[unit.role]}${selected ? `, ${order + 1}번 자리` : ''}`,
      disabled: !selected && full,
      onclick: onToggle,
      onmouseenter: onInspect,
      onfocus: onInspect,
    },
    h('div', { class: 'tile-fig' }),
    h('span', { class: 'tile-role' }, ROLE_NAMES[unit.role]),
    selected ? h('span', { class: 'order-seal' }, NUM[order]) : null,
    h('div', { class: 'tile-foot' }, elBadge(unit.element, 'sm'), h('b', {}, unit.name)),
  );
  tile.querySelector('.tile-fig')!.innerHTML = characterSvg(unit.id);
  return tile;
}

function statBar(label: string, value: number, max: number): HTMLElement {
  return h('div', { class: 'stat-bar' }, h('dt', {}, label), h('dd', {}, h('b', {}, value), h('span', { class: 'stat-track' }, h('i', { style: { width: `${Math.round((value / max) * 100)}%` } }))));
}

/** 상세: 고르기 전에 스킬 5개를 모두 읽을 수 있게 한다 */
function unitDetail(unit: UnitDef, order: number, full: boolean, onToggle: () => void): HTMLElement {
  const selected = order >= 0;
  const detail = h(
    'section',
    { class: 'unit-detail panel', style: { '--el': elColor(unit.element) }, 'aria-label': `${unit.name} 상세` },
    h(
      'div',
      { class: 'detail-hero' },
      h('div', { class: 'detail-fig' }),
      h(
        'div',
        { class: 'detail-id' },
        h('span', { class: 'portrait-code' }, unit.code),
        h('h2', {}, unit.name),
        h('p', { class: 'detail-sub' }, elBadge(unit.element, 'sm'), h('span', {}, `${ROLE_NAMES[unit.role]}`)),
        h('p', { class: 'unit-concept' }, unit.concept),
        h('dl', { class: 'detail-stats' }, statBar('HP', unit.maxHp, 100), statBar('공격', unit.atk, 16), statBar('방어', unit.def, 8)),
        button(selected ? `편성에서 빼기 (${order + 1}번)` : full ? '팀이 가득 찼습니다' : '편성에 넣기', onToggle, { variant: selected ? 'ghost' : 'primary', disabled: !selected && full, class: 'detail-toggle' }),
      ),
    ),
    h('div', { class: 'unit-spells' }, h('p', { class: 'unit-spells-head' }, `스킬 ${unit.spells.length}개 · 매 라운드 이 중 2장을 뽑습니다`), unit.spells.map(spellLine)),
  );
  detail.querySelector('.detail-fig')!.innerHTML = characterSvg(unit.id);
  return detail;
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
  let inspect = UNIT_LIST[0].id;
  const root = h('main', { class: 'team-wrap' });

  const render = () => {
    const full = selected.length >= TEAM_SIZE;
    const toggle = (id: string) => {
      selected = selected.includes(id) ? selected.filter((x) => x !== id) : full ? selected : [...selected, id];
      inspect = id;
      render();
      root.querySelector<HTMLElement>(`[data-unit="${id}"]`)?.focus({ preventScroll: true });
    };
    const peek = (id: string) => {
      if (inspect === id) return;
      inspect = id;
      root.querySelector('.unit-detail')?.replaceWith(unitDetail(unitById(id), selected.indexOf(id), full, () => toggle(id)));
      root.querySelectorAll('.roster-tile').forEach((t) => t.classList.toggle('inspecting', t.getAttribute('data-unit') === id));
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
        h(
          'section',
          { class: 'roster', 'aria-label': '술사 목록' },
          h('p', { class: 'roster-hint' }, '눌러서 편성 · 올려서 자세히'),
          h(
            'div',
            { class: 'roster-grid' },
            UNIT_LIST.map((u) => {
              const t = rosterTile(u, selected.indexOf(u.id), inspect === u.id, full, () => toggle(u.id), () => peek(u.id));
              t.setAttribute('data-unit', u.id);
              return t;
            }),
          ),
        ),
        unitDetail(unitById(inspect), selected.indexOf(inspect), full, () => toggle(inspect)),
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
      // 좁은 화면: 스크롤 위치와 상관없이 엄지 닿는 곳에 편성 현황과 시작 버튼
      h(
        'div',
        { class: 'squad-bar' },
        h(
          'div',
          { class: 'squad-dots', 'aria-label': `편성 ${selected.length} / ${TEAM_SIZE}` },
          Array.from({ length: TEAM_SIZE }, (_, i) => {
            const id = selected[i];
            return id ? h('span', { class: 'squad-dot on', style: { '--el': elColor(unitById(id).element) } }, unitById(id).name) : h('span', { class: 'squad-dot' }, NUM[i]);
          }),
        ),
        button(full ? '여정 시작' : `${selected.length}/${TEAM_SIZE}`, start, { variant: 'primary', disabled: !full }),
      ),
    );
  };

  render();
  return root;
}
