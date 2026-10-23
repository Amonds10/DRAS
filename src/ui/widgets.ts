import { enemyHitAmount } from '../core/battle';
import type { Ally, Element, Enemy, Intent, SpellDef, SpellInput, SpellOutput, Status } from '../core/types';
import { ELEMENTS, STATUS_META, reactionById } from '../data/elements';
import { TAG_NAMES } from '../data/spells';
import { unitById } from '../data/units';
import { h } from './dom';
import { glyph } from './glyphs';

export function elColor(el: Element | 'star'): string {
  return ELEMENTS[el].color;
}

export function elBadge(el: Element | 'star', size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  return h('span', { class: `el-badge el-${size}`, style: { '--el': elColor(el) }, title: ELEMENTS[el].name }, ELEMENTS[el].glyph);
}

function inputGlyph(input: SpellInput): HTMLElement {
  if (input === 'none') return h('span', { class: 'flow-node flow-start', title: '기점: 새 체인을 연다' }, '●');
  if (input === 'wild') return h('span', { class: 'flow-node', style: { '--el': elColor('star') }, title: '어떤 성속이든 받는다' }, ELEMENTS.star.glyph);
  return h('span', { class: 'flow-node', style: { '--el': elColor(input) }, title: `${ELEMENTS[input].name}을(를) 받는다` }, ELEMENTS[input].glyph);
}

function outputGlyph(output: SpellOutput): HTMLElement {
  if (output === 'echo') return h('span', { class: 'flow-node', style: { '--el': elColor('star') }, title: '받은 성속을 그대로 넘긴다' }, '↻');
  return h('span', { class: 'flow-node', style: { '--el': elColor(output) }, title: `${ELEMENTS[output].name}을(를) 넘긴다` }, ELEMENTS[output].glyph);
}

/** 마법의 입력 → 출력 성속 표시 */
export function spellFlow(spell: SpellDef): HTMLElement {
  return h('span', { class: 'spell-flow' }, inputGlyph(spell.input), h('span', { class: 'flow-arrow' }, '→'), outputGlyph(spell.output));
}

export function costPips(cost: number): HTMLElement {
  return h('span', { class: 'cost', title: `성진 ${cost}` }, '✦'.repeat(cost) || '0');
}

/**
 * HP 막대. forecast를 주면 이번 라운드에 깎일 예상 구간을 흐린 막대로 겹쳐 보여 준다.
 */
export function hpBar(hp: number, maxHp: number, shield: number, forecast?: number): HTMLElement {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const shieldPct = Math.min(100 - pct, (shield / maxHp) * 100);
  const loss = forecast !== undefined && forecast < hp;
  const fPct = loss ? Math.max(0, (forecast / maxHp) * 100) : pct;
  return h(
    'div',
    { class: `hp ${loss ? 'has-forecast' : ''}` },
    h(
      'div',
      { class: 'hp-track' },
      h('div', { class: 'hp-fill', style: { width: `${fPct}%` } }),
      loss ? h('div', { class: 'hp-ghost', style: { left: `${fPct}%`, width: `${pct - fPct}%` } }) : null,
      h('div', { class: 'hp-shield', style: { left: `${pct}%`, width: `${shieldPct}%` } }),
    ),
    h(
      'div',
      { class: 'hp-text' },
      h('span', { class: 'hp-num' }, `${hp}`),
      loss ? h('span', { class: `hp-forecast ${forecast <= 0 ? 'kill' : ''}`, title: '이번 라운드 예상' }, forecast <= 0 ? ' → 처치' : ` → ${forecast}`) : ` / ${maxHp}`,
      shield > 0 ? h('span', { class: 'hp-shield-num' }, ` ⛨${shield}`) : null,
    ),
  );
}

export function updateHpBar(root: HTMLElement, hp: number, maxHp: number, shield: number): void {
  const old = root.querySelector('.hp');
  if (old) old.replaceWith(hpBar(hp, maxHp, shield));
}

export function statusRow(statuses: Status[]): HTMLElement {
  return h(
    'div',
    { class: 'status-row' },
    statuses.map((st) => {
      const meta = STATUS_META[st.id];
      // 각인은 위력·횟수, 고유 중첩은 쌓인 수, 나머지는 남은 턴을 작게 붙인다
      const lasting = st.turns >= 90;
      const label = meta.keyword ? `${meta.name} 위력 ${st.value ?? 0}·횟수 ${st.turns}` : st.value && (lasting || st.id === 'atkUp') ? `${meta.name} ${st.value}` : meta.name;
      const small = meta.keyword ? `${st.value ?? 0}·${st.turns}` : lasting ? (st.value ?? null) : st.turns;
      return h(
        'span',
        { class: `status ${meta.debuff ? 'debuff' : 'buff'} st-${st.id}`, title: `${meta.debuff ? '약화 효과' : '강화 효과'} · ${label}: ${meta.desc} (${meta.keyword ? `${st.turns}회 남음` : lasting ? '지속' : `${st.turns}턴 남음`})` },
        h('i', { class: 'st-dir', 'aria-hidden': 'true' }, meta.debuff ? '▼' : '▲'),
        meta.glyph,
        small != null ? h('small', {}, small) : null,
      );
    }),
  );
}

export function allyName(ally: Ally): string {
  return unitById(ally.defId).name;
}

export function intentView(intent: Intent | null, enemy: Enemy, allies: Ally[]): HTMLElement {
  if (!intent) return h('div', { class: 'intent intent-none' }, '—');
  switch (intent.kind) {
    case 'attack': {
      const target = allies.find((a) => a.uid === intent.targetId);
      const dmg = target ? enemyHitAmount(enemy, intent.power, target) : intent.power;
      return h('div', { class: 'intent intent-attack', title: '공격' }, h('b', {}, '⚔ ', dmg), target ? h('span', { class: 'intent-target' }, `→ ${allyName(target)}`) : null);
    }
    case 'attackAll': {
      const living = allies.filter((a) => a.hp > 0);
      const avg = living.length ? Math.round(living.reduce((s, a) => s + enemyHitAmount(enemy, intent.power, a), 0) / living.length) : intent.power;
      return h('div', { class: 'intent intent-attack', title: '전체 공격' }, h('b', {}, '⚔ ', avg), h('span', { class: 'intent-target' }, '→ 전체'));
    }
    case 'defend':
      return h('div', { class: 'intent intent-defend', title: '방어' }, h('b', {}, '⛨ ', intent.shield), h('span', { class: 'intent-target' }, '방어'));
    case 'buff':
      return h('div', { class: 'intent intent-buff', title: '강화' }, h('b', {}, '↑ ', intent.atk), h('span', { class: 'intent-target' }, '공격 강화'));
    case 'seal':
      return h(
        'div',
        { class: 'intent intent-seal', title: '성식: 다음 턴 이 성속으로 이어지는 링크가 끊긴다' },
        h('b', {}, '⊘ '),
        intent.element ? elBadge(intent.element, 'sm') : null,
        h('span', { class: 'intent-target' }, '성식'),
      );
    case 'charge':
      return h('div', { class: 'intent intent-charge', title: '다음 행동이 강력하다' }, h('b', {}, '◌◌◌'), h('span', { class: 'intent-target' }, '힘을 모은다'));
  }
}

export function reactionChip(id: string): HTMLElement {
  const r = reactionById(id);
  return h(
    'span',
    { class: 'reaction-chip', style: { '--from': elColor(r.from), '--to': elColor(r.to) }, title: r.desc },
    ELEMENTS[r.from].glyph,
    '→',
    ELEMENTS[r.to].glyph,
    ' ',
    r.name,
  );
}

export function button(label: string | Node, onClick: () => void, opts: { variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; title?: string; class?: string } = {}): HTMLButtonElement {
  return h(
    'button',
    { class: `btn btn-${opts.variant ?? 'ghost'} ${opts.class ?? ''}`, disabled: opts.disabled, title: opts.title, type: 'button', onclick: onClick },
    label,
  );
}

export function modal(title: string, body: Node, onClose: () => void): HTMLElement {
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e: Event) => e.target === backdrop && close() });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  backdrop.append(
    h(
      'div',
      { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'modal-head' }, h('h2', {}, title), button('✕', close, { title: '닫기', class: 'btn-icon' })),
      h('div', { class: 'modal-body' }, body),
    ),
  );
  document.body.append(backdrop);
  return backdrop;
}

export const NUM = ['1', '2', '3', '4', '5', '6', '7'];

/** 카드 위 링크 예고: 링크(배율), 반응, 끊김, 새 체인 */
export interface LinkHint {
  kind: 'link' | 'reaction' | 'break' | 'start';
  text: string;
}

/** 스킬 유형 표시: 아이콘 + 이름(무채색) */
export function tagLabel(spell: SpellDef): HTMLElement {
  return h('span', { class: 'skill-tag' }, glyph(spell.tag, 'skill-tag-glyph'), TAG_NAMES[spell.tag]);
}
