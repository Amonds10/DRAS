import type { AllyTarget, Cond, DamageEffect, Effect, EnemyTarget, Rider, SpellDef, Stack, Stage } from '../core/types';
import { ELEMENTS, STATUS_META } from './elements';

/*
 * 주문 효과 설명을 데이터에서 만들어 낸다. 손으로 쓴 설명과 실제 효과가 어긋나지 않게 한다.
 * 줄마다 꼬리표([사용 시], [적중 시], [태양핵 3 이상] …)와 본문을 따로 돌려주고, 화면이 색을 입힌다.
 */

/** 꼬리표 종류: 화면에서 색이 다르다 */
export type TagKind = 'start' | 'use' | 'hit' | 'kill' | 'after' | 'cond';

export interface DescTag {
  kind: TagKind;
  text: string;
}

export interface DescLine {
  tags: DescTag[];
  text: string;
}

export interface StageDesc {
  /** 1부터 */
  n: number;
  power: number;
  /** 이 조건일 때만 나간다 */
  only?: string;
  /** 대상이 주문 전체와 다를 때 */
  target?: string;
  lines: DescLine[];
}

export interface SpellDesc {
  /** 피해 앞: 전투 시작 시, 사용 시 */
  pre: DescLine[];
  /** 타격 전체에 걸리는 성질(방어 무시, 소모 …)과 공통 적중 효과 */
  attack: DescLine[];
  /** 공격 대상 문구("대상에게 3단 공격") */
  head: string | null;
  stages: StageDesc[];
  /** 피해 뒤: 시전 후, 처치 시 */
  post: DescLine[];
}

export const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ'];

const TAG_TEXT: Record<Exclude<TagKind, 'cond'>, string> = { start: '전투 시작 시', use: '사용 시', hit: '적중 시', kill: '처치 시', after: '시전 후' };
const tag = (kind: Exclude<TagKind, 'cond'>): DescTag => ({ kind, text: TAG_TEXT[kind] });

/** 받침이 있으면 a, 없으면 b(을/를, 은/는, 으로/로) */
function josa(word: string, a: string, b: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return word + b;
  const jong = (c - 0xac00) % 28;
  // 으로/로: ㄹ 받침은 '로'
  if (a === '으로' && jong === 8) return word + b;
  return word + (jong ? a : b);
}

const name = (id: string) => STATUS_META[id]?.name ?? id;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const who = (t: AllyTarget | undefined) => (t === 'allAllies' ? '아군 전원' : t === 'lowestAlly' ? '가장 다친 아군' : '자신');
const foe = (t: EnemyTarget | 'focus' | 'allEnemies') => (t === 'allEnemies' ? '모든 적' : t === 'random' ? '무작위 적' : '대상');
const kw = (k: string, v: number, t: number) => `${name(k)} ${v}·${t}`;
const burstText = (k: string, mult: number, whom: string) =>
  `${josa(`${whom}의 ${name(k)}`, '을', '를')} 터뜨린다(${k === 'tremor' ? '위력' : '위력×횟수'}${mult !== 1 ? ` ×${mult}` : ''}${k === 'tremor' ? ', 8 이상이면 기절' : ''})`;

export function condText(c: Cond): string {
  const parts: string[] = [];
  if (c.targetHas) parts.push(c.targetHas === 'any' ? '대상에게 각인' : `대상 ${name(c.targetHas)}${c.targetMin && c.targetMin > 1 ? ` ${c.targetMin} 이상` : ''}`);
  if (c.kinds) parts.push(`대상 각인 ${c.kinds}종 이상`);
  if (c.casterHas) parts.push(`${name(c.casterHas)} ${c.min ?? 1} 이상`);
  if (c.sum) parts.push(`대상 ${name(c.sum.keyword)} 위력 + ${name(c.sum.stack)} ${c.sum.min} 이상`);
  if (c.chain) parts.push(`체인 ${c.chain} 이상`);
  if (c.linked) parts.push('링크 시');
  if (c.targetHpBelow !== undefined) parts.push(`대상 HP ${pct(c.targetHpBelow)} 이하`);
  if (c.casterHpBelow !== undefined) parts.push(`자신 HP ${pct(c.casterHpBelow)} 이하`);
  if (c.shielded) parts.push('보호막 보유');
  return parts.join(' · ');
}

const condTag = (c: Cond | undefined): DescTag[] => (c ? [{ kind: 'cond', text: condText(c) }] : []);

function stackGain(t: AllyTarget | undefined, s: Stack, n: number): string {
  return `${who(t)} ${name(s)} +${n}`;
}

export function effectText(e: Effect): string {
  switch (e.kind) {
    case 'heal':
      return `${who(e.target)} 체력 ${e.power} 회복`;
    case 'shield':
      return `${who(e.target)} 보호막 ${e.power}`;
    case 'enemyStatus':
      return `${foe(e.target)} ${name(e.status)} ${e.turns}턴`;
    case 'allyStatus':
      if (e.status === 'atkUp') return `${who(e.target)} 공격 +${e.value} (${e.turns}턴)`;
      if (e.status === 'counter') return `${who(e.target)} 반격 ${e.value} 태세 (${e.turns}턴)`;
      if (e.status === 'taunt') return `${who(e.target)} 도발 — 이번 턴 단일 공격을 대신 받는다`;
      return `${who(e.target)} ${name(e.status)} ${e.turns}턴`;
    case 'stardust':
      return `성진 +${e.amount}`;
    case 'purge':
      return `${foe(e.target)}의 강화와 보호막을 걷어낸다`;
    case 'boost':
      return `다음 시전 배율 +${e.amount}`;
    case 'doom':
      return `라운드가 끝날 때 대상에게 위력 ${e.power} 폭격`;
    case 'gain':
      return stackGain(e.target, e.stack, e.amount);
    case 'inflict':
      return `${foe(e.target)}에게 ${kw(e.keyword, e.value, e.turns)}`;
    case 'amplify':
      return `${foe(e.target)}의 모든 각인 위력 +${e.value}${e.turns ? `·횟수 +${e.turns}` : ''}`;
    case 'burst':
      return burstText(e.keyword, e.mult, foe(e.target));
    case 'convert':
      return `${foe(e.target)}의 ${josa(name(e.from), '을', '를')} ${josa(name(e.to), '으로', '로')} 바꾼다(위력 ×${e.mult})`;
    case 'spread':
      return `대상의 ${josa(name(e.keyword), '을', '를')} 다른 모든 적에게 퍼뜨린다(${pct(e.ratio)})`;
    case 'attune':
      return `${ELEMENTS[e.element].name} 공명 +${e.amount}`;
    case 'detonate':
      return '걸려 있는 폭격을 지금 모두 터뜨린다';
    case 'damage':
      return '공격';
  }
}

export function riderText(r: Rider): string {
  if ('inflict' in r) return kw(r.inflict, r.value, r.turns);
  if ('gain' in r) return stackGain(r.to, r.gain, r.amount);
  if ('heal' in r) return `${who(r.to)} 체력 ${r.heal} 회복`;
  if ('shield' in r) return `${who(r.to)} 보호막 ${r.shield}`;
  if ('amplify' in r) return `대상의 모든 각인 위력 +${r.amplify}${r.turns ? `·횟수 +${r.turns}` : ''}`;
  if ('burst' in r) return burstText(r.burst, r.mult, '대상');
  if ('stardust' in r) return `성진 +${r.stardust}`;
  if ('debuff' in r) return `${name(r.debuff)} ${r.turns}턴`;
  return `대상의 ${josa(name(r.spread), '을', '를')} 다른 모든 적에게 퍼뜨린다(${pct(r.ratio)})`;
}

const riderLine = (r: Rider): DescLine => ({ tags: [tag('hit'), ...condTag(r.when)], text: riderText(r) });

/** 타격 전체에 걸리는 성질 */
function attackLines(d: DamageEffect): DescLine[] {
  const out: DescLine[] = [];
  const use = (text: string, c?: Cond) => out.push({ tags: [tag('use'), ...condTag(c)], text });
  if (d.consume) use(`${josa(name(d.consume.stack), '을', '를')} 모두 소모해 1당 피해 +${pct(d.consume.per)}`);
  if (d.releaseAttune) use(`${ELEMENTS[d.releaseAttune].name} 공명을 모두 풀어 1당 피해 +25%`);
  if (d.fromStardust) use(`남은 성진을 모두 쏟아 1당 위력 +${d.fromStardust}`);
  if (d.devour) use(`대상의 ${josa(d.devour.keywords.map(name).join('·'), '을', '를')} 집어삼켜 (위력×횟수)의 ${pct(d.devour.per)}만큼 위력 +`);
  const plain = (text: string) => out.push({ tags: [], text });
  if (d.pierce) plain('모든 타격 방어 무시');
  if (d.attune) plain(`${ELEMENTS[d.attune].name} 공명 1당 피해 +12%`);
  if (d.fromShield) plain(`자신 보호막${d.fromShield !== 1 ? ` ×${d.fromShield}` : ''}만큼 타격마다 피해 +`);
  if (d.scaleWithChain) plain('체인 수만큼 피해 배율');
  if (d.execute) out.push({ tags: [{ kind: 'cond', text: '대상 HP 35% 이하' }], text: `피해 ×${d.execute}` });
  if (d.vsDebuffed) out.push({ tags: [{ kind: 'cond', text: '대상에게 약화 효과' }], text: `피해 ×${d.vsDebuffed}` });
  for (const b of d.bonusVs ?? []) out.push({ tags: [{ kind: 'cond', text: b.keyword === 'any' ? '대상에게 각인' : `대상 ${name(b.keyword)}` }], text: `피해 +${pct(b.mult - 1)}` });
  if (d.lifesteal) plain(`준 피해의 ${pct(d.lifesteal)}만큼 자신 회복`);
  for (const r of d.onHit ?? []) out.push({ ...riderLine(r), tags: [tag('hit'), { kind: 'cond', text: '매 타격' }, ...condTag(r.when)] });
  if (d.hitsFrom) plain(`대상 ${name(d.hitsFrom.keyword)} 횟수만큼(최대 ${d.hitsFrom.max}) 마지막 타격을 되풀이`);
  return out;
}

function stageDesc(st: Stage, n: number, main: EnemyTarget): StageDesc {
  const lines: DescLine[] = [];
  if (st.pierce) lines.push({ tags: [], text: '방어 무시' });
  if (st.up) lines.push({ tags: condTag(st.up.when), text: `이 타격 피해 +${pct(st.up.mult - 1)}` });
  for (const r of st.onHit ?? []) lines.push(riderLine(r));
  return { n, power: st.power, only: st.only ? condText(st.only) : undefined, target: st.target && st.target !== main ? foe(st.target) : undefined, lines };
}

export function describeSpell(sp: SpellDef): SpellDesc {
  const out: SpellDesc = { pre: [], attack: [], head: null, stages: [], post: [] };
  for (const e of sp.start ?? []) out.pre.push({ tags: [tag('start'), ...condTag(e.when)], text: effectText(e) });
  let struck = false;
  for (const e of sp.effects) {
    if (e.kind === 'damage') {
      struck = true;
      const stages = e.stages ?? Array.from({ length: e.hits ?? 1 }, () => ({ power: e.power }));
      out.attack.push(...attackLines(e));
      out.head = `${foe(e.target)}에게 ${stages.length > 1 ? `${stages.length}단 ` : ''}공격`;
      out.stages.push(...stages.map((st, i) => stageDesc(st, out.stages.length + i + 1, e.target)));
      continue;
    }
    const line = { tags: [tag(struck ? 'after' : 'use'), ...condTag(e.when)], text: effectText(e) };
    (struck ? out.post : out.pre).push(line);
  }
  for (const e of sp.kill ?? []) out.post.push({ tags: [tag('kill'), ...condTag(e.when)], text: effectText(e) });
  return out;
}

/** 시험·접근성용 평문 */
export function spellPlainText(sp: SpellDef): string {
  const d = describeSpell(sp);
  const line = (l: DescLine) => `${l.tags.map((t) => `[${t.text}]`).join('')} ${l.text}`.trim();
  return [
    ...d.pre.map(line),
    ...(d.head ? [d.head] : []),
    ...d.attack.map(line),
    ...d.stages.flatMap((s) => [`${ROMAN[s.n - 1] ?? s.n} 위력 ${s.power}${s.only ? ` [${s.only}일 때만]` : ''}${s.target ? ` (${s.target})` : ''}`, ...s.lines.map((l) => `  ${line(l)}`)]),
    ...d.post.map(line),
  ].join('\n');
}
