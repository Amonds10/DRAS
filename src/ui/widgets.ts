import { enemyHitAmount } from '../core/battle';
import type { AbilityDef, Affinity, Ally, Enemy, Intent, Status } from '../core/types';
import { ELEMENTS, STATUS_META } from '../data/elements';
import { unitById } from '../data/units';
import { h } from './dom';

export function elColor(el: Affinity): string {
  return ELEMENTS[el].color;
}

export function elBadge(el: Affinity, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  return h('span', { class: `el-badge el-${size}`, style: { '--el': elColor(el) }, title: ELEMENTS[el].name }, ELEMENTS[el].glyph);
}

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
      return h('div', { class: 'intent intent-seal', title: '성식: 우리 성진 1을 빼앗는다' }, h('b', {}, '⊘ ✦-1'), h('span', { class: 'intent-target' }, '성식'));
    case 'charge':
      return h('div', { class: 'intent intent-charge', title: '다음 행동이 강력하다' }, h('b', {}, '◌◌◌'), h('span', { class: 'intent-target' }, '힘을 모은다'));
  }
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

/** 설명 속 각인·중첩 이름과 "2·3", "140%" 같은 수치를 색으로 짚는다 */
const HL_IDS = Object.keys(STATUS_META).filter((id) => STATUS_META[id].keyword || ['solarCore', 'aim', 'tide', 'hunger', 'fortitude', 'wave'].includes(id));
const HL_BY_NAME = new Map(HL_IDS.map((id) => [STATUS_META[id].name, id]));
const HL_RE = new RegExp(`(${[...HL_BY_NAME.keys()].sort((a, b) => b.length - a.length).join('|')}|\\d+·\\d+|[+×]?\\d+(?:\\.\\d+)?%|[+×]\\d+(?:\\.\\d+)?)`, 'g');

export function highlight(text: string): (string | HTMLElement)[] {
  const out: (string | HTMLElement)[] = [];
  let last = 0;
  for (const m of text.matchAll(HL_RE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const id = HL_BY_NAME.get(m[0]);
    out.push(h('span', { class: id ? `hl hl-${id} ${STATUS_META[id].keyword ? 'hl-kw' : 'hl-stack'}` : 'hl hl-num' }, m[0]));
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 능력 설명(문장형) */
export function abilityText(ab: AbilityDef): HTMLElement {
  return h('p', { class: 'ab-desc' }, highlight(ab.desc));
}

/** 약점 속성 아이콘 줄 */
export function weakRow(weak: Affinity[]): HTMLElement {
  return h('span', { class: 'weak-row', title: `약점: ${weak.map((w) => ELEMENTS[w].name).join(', ')}` }, weak.map((w) => elBadge(w, 'sm')));
}
