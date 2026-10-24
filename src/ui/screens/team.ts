import { randomSeed, Rng } from '../../core/rng';
import { newRun } from '../../core/run';
import { TEAM_SIZE, analyzeTeam } from '../../core/team';
import type { UnitDef } from '../../core/types';
import { DECKS, type DeckPreset } from '../../data/decks';
import { ELEMENTS } from '../../data/elements';
import { TAG_NAMES, spellById } from '../../data/spells';
import { ROLE_NAMES, UNIT_LIST, unitById } from '../../data/units';
import { characterSvg } from '../../render/characters';
import type { App } from '../app';
import { h } from '../dom';
import { showHelp } from '../help';
import { NUM, button, costPips, elBadge, elColor, highlight, reactionChip, spellFlow, spellText } from '../widgets';

/** 스킬 한 칸: 유형, 이름, 받는→넘기는 성속, 성진, 쿨타임, 설명 */
function skillLine(spellId: string): HTMLElement {
  const sp = spellById(spellId);
  return h(
    'div',
    { class: 'spell-line kit-line' },
    h('div', { class: 'spell-line-head' }, h('span', { class: 'kit-slot' }, TAG_NAMES[sp.tag]), h('span', { class: 'spell-name' }, sp.name), spellFlow(sp), h('span', { class: 'kit-cost' }, sp.cooldown ? `쿨타임 ${sp.cooldown}` : '매 라운드'), costPips(sp.cost)),
    spellText(sp),
  );
}

/** 추천 덱 카드: 누르면 팀과 장착 주문을 한 번에 맞춘다 */
function deckCard(d: DeckPreset, active: boolean, onPick: () => void): HTMLElement {
  return h(
    'button',
    { type: 'button', class: `deck-card ${active ? 'on' : ''}`, 'aria-pressed': active ? 'true' : 'false', onclick: onPick },
    h('span', { class: 'deck-en' }, d.en),
    h('b', {}, d.name),
    h('span', { class: 'deck-plan' }, d.plan),
    h('span', { class: 'deck-units' }, d.team.map((id) => h('i', { style: { '--el': elColor(unitById(id).element) } }, unitById(id).name))),
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

/** 상세: 능력치, 패시브, 고정 스킬 4개 */
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
        h('p', { class: 'detail-sub' }, elBadge(unit.element, 'sm'), h('span', {}, `${ELEMENTS[unit.element].name} · ${ROLE_NAMES[unit.role]}`)),
        h('p', { class: 'unit-concept' }, unit.concept),
        h('p', { class: 'unit-passive' }, h('b', {}, `패시브 · ${unit.passive.name}`), h('span', {}, highlight(unit.passive.desc))),
        h('dl', { class: 'detail-stats' }, statBar('HP', unit.maxHp, 100), statBar('공격', unit.atk, 16), statBar('방어', unit.def, 8)),
        button(selected ? `편성에서 빼기 (${order + 1}번)` : full ? '팀이 가득 찼습니다' : '편성에 넣기', onToggle, { variant: selected ? 'ghost' : 'primary', disabled: !selected && full, class: 'detail-toggle' }),
      ),
    ),
    h('div', { class: 'unit-spells' }, h('p', { class: 'unit-spells-head' }, '스킬 4개 · 전투 내내 모두 쓸 수 있고, 쿨타임으로 제한됩니다'), unit.spells.map(skillLine)),
  );
  detail.querySelector('.detail-fig')!.innerHTML = characterSvg(unit.id);
  return detail;
}

/** 팀 궁합: 이 팀이 만들 수 있는 최대 체인, 성좌 반응, 예시 순서 */
function synergyPanel(selected: string[]): HTMLElement {
  if (selected.length === 0) return h('div', { class: 'synergy empty' }, h('p', {}, '술사를 고르면 이 팀이 만들 수 있는 링크와 성좌 반응을 보여줍니다.'));
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
          h('h4', {}, '이어지는 순서 예시'),
          h('ol', { class: 'syn-seq' }, syn.bestSequence.map((st) => {
            const sp = spellById(st.spellId);
            return h('li', {}, elBadge(unitById(st.unitId).element, 'sm'), h('span', {}, sp.name), spellFlow(sp));
          })),
        )
      : null,
  );
}

export function teamScreen(app: App): HTMLElement {
  let selected: string[] = [];
  let inspect = UNIT_LIST[0].id;
  let deckId: string | null = null;
  const root = h('main', { class: 'team-wrap' });

  const render = () => {
    const full = selected.length >= TEAM_SIZE;
    const toggle = (id: string) => {
      selected = selected.includes(id) ? selected.filter((x) => x !== id) : full ? selected : [...selected, id];
      inspect = id;
      render();
      root.querySelector<HTMLElement>(`[data-unit="${id}"]`)?.focus({ preventScroll: true });
    };
    const detail = (id: string) => unitDetail(unitById(id), selected.indexOf(id), full, () => toggle(id));
    const pickDeck = (d: DeckPreset) => {
      selected = [...d.team];
      deckId = d.id;
      inspect = selected[0];
      render();
    };
    const ready = full;
    const peek = (id: string) => {
      if (inspect === id) return;
      inspect = id;
      root.querySelector('.unit-detail')?.replaceWith(detail(id));
      root.querySelectorAll('.roster-tile').forEach((t) => t.classList.toggle('inspecting', t.getAttribute('data-unit') === id));
    };
    const randomize = () => {
      selected = new Rng(randomSeed()).shuffle(UNIT_LIST.map((u) => u.id)).slice(0, TEAM_SIZE);
      deckId = null;
      render();
    };
    const start = () => {
      if (!ready) return;
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
        'section',
        { class: 'deck-strip', 'aria-label': '추천 팀' },
        h('p', { class: 'deck-strip-head' }, h('span', {}, 'ARCHETYPES'), ' 추천 팀 · 고르면 4명이 한 번에 맞춰집니다'),
        h('div', { class: 'deck-row' }, DECKS.map((d) => deckCard(d, deckId === d.id, () => pickDeck(d)))),
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
        detail(inspect),
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
          h('div', { class: 'team-actions' }, button('무작위 편성', randomize), button('여정 시작', start, { variant: 'primary', disabled: !ready })),
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
        button(ready ? '여정 시작' : `${selected.length}/${TEAM_SIZE}`, start, { variant: 'primary', disabled: !ready }),
      ),
    );
  };

  render();
  return root;
}
