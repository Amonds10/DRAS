import { enemyHitAmount } from '../core/battle';
import type { Ally, Element, Enemy, Intent, SpellDef, SpellInput, SpellOutput, Status } from '../core/types';
import { ELEMENTS, STATUS_META, reactionById } from '../data/elements';
import { unitById } from '../data/units';
import { h } from './dom';

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

export function hpBar(hp: number, maxHp: number, shield: number): HTMLElement {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const shieldPct = Math.min(100 - pct, (shield / maxHp) * 100);
  return h(
    'div',
    { class: 'hp' },
    h(
      'div',
      { class: 'hp-track' },
      h('div', { class: 'hp-fill', style: { width: `${pct}%` } }),
      h('div', { class: 'hp-shield', style: { left: `${pct}%`, width: `${shieldPct}%` } }),
    ),
    h('div', { class: 'hp-text' }, h('span', { class: 'hp-num' }, `${hp}`), ` / ${maxHp}`, shield > 0 ? h('span', { class: 'hp-shield-num' }, ` ⛨${shield}`) : null),
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
      const label = st.id === 'burn' || st.id === 'atkUp' ? `${meta.name} ${st.value ?? ''}` : meta.name;
      return h('span', { class: `status ${meta.debuff ? 'debuff' : 'buff'}`, title: `${label} (${st.turns >= 99 ? '지속' : `${st.turns}턴`})` }, meta.glyph, st.turns < 99 ? h('small', {}, st.turns) : null);
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

export interface SpellCardOpts {
  element: Element | 'star';
  numeral?: string;
  order?: number;
  chosen?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'hand' | 'mini';
}

/** 마법 카드 */
export function spellCard(spell: SpellDef, opts: SpellCardOpts): HTMLElement {
  const meta = ELEMENTS[opts.element];
  const tag = opts.onClick ? 'button' : 'div';
  const el = h(
    tag as 'button',
    {
      type: opts.onClick ? 'button' : undefined,
      class: `tarot tarot-${opts.size ?? 'hand'} ${opts.chosen ? 'chosen' : ''}`,
      style: { '--el': meta.color },
      disabled: opts.disabled,
      title: `${spell.name} — ${spell.desc}`,
      onclick: opts.onClick,
    },
    h(
      'span',
      { class: 'tarot-top' },
      h('span', { class: 'tarot-cost' }, Array.from({ length: Math.max(spell.cost, 0) }, () => h('i'))),
      opts.numeral ? h('span', { class: 'tarot-num' }, opts.numeral) : null,
    ),
    h('span', { class: 'tarot-art' }, h('span', { class: 'tarot-glyph' }, meta.glyph)),
    h('span', { class: 'tarot-name' }, spell.name),
    h('span', { class: 'tarot-flow' }, spellFlow(spell)),
    opts.size !== 'mini' ? h('span', { class: 'tarot-desc' }, spell.desc) : null,
    opts.order !== undefined ? h('span', { class: 'tarot-order' }, NUM[opts.order]) : null,
  );
  return el;
}
