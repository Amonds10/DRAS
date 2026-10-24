import type { Element, ReactionDef } from '../core/types';
import { ELEMENTS, REACTIONS, reactionById } from '../data/elements';
import { h } from './dom';
import { elBadge, elColor } from './widgets';

/*
 * 성좌 반응 전용 그림과 표시: 반응마다 고유 문장(엠블럼), 다섯 성속의 반응 바퀴, 카드·트랙에 붙는 반응 꼬리표.
 */

let uid = 0;

/** 반응 문장(SVG 문자열). 두 성속 색의 그라데이션으로 칠한다. */
export function reactionEmblem(id: string): string {
  const r = reactionById(id);
  const a = elColor(r.from);
  const b = elColor(r.to);
  const g = `rg${++uid}`;
  const defs = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="${g}r"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="${b}" stop-opacity=".55"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient></defs>`;
  const ring = `<circle cx="50" cy="50" r="46" fill="none" stroke="url(#${g})" stroke-width="3"/><circle cx="50" cy="50" r="40" fill="none" stroke="url(#${g})" stroke-width="1" stroke-dasharray="2 4" opacity=".8"/>`;
  let art = '';
  switch (id) {
    case 'eclipse':
      // 일식: 해를 가린 검은 달, 둘레로 번지는 코로나
      art = `<circle cx="50" cy="50" r="30" fill="url(#${g}r)"/>${Array.from({ length: 16 }, (_, i) => {
        const t = (i / 16) * Math.PI * 2;
        const l = i % 2 ? 31 : 36;
        return `<line x1="${50 + Math.cos(t) * 22}" y1="${50 + Math.sin(t) * 22}" x2="${50 + Math.cos(t) * l}" y2="${50 + Math.sin(t) * l}" stroke="${a}" stroke-width="${i % 2 ? 1.5 : 2.5}" stroke-linecap="round"/>`;
      }).join('')}<circle cx="50" cy="50" r="20" fill="${a}"/><circle cx="54" cy="47" r="19" fill="#1a1420" stroke="${b}" stroke-width="1.5"/>`;
      break;
    case 'moonset':
      // 월몰: 공허의 수평선 아래로 가라앉는 초승달
      art = `<path d="M38 22a24 24 0 1 0 26 38a19 19 0 1 1-26-38z" fill="${a}"/><path d="M14 60h72" stroke="${b}" stroke-width="3" stroke-linecap="round"/><path d="M22 68h56M30 76h40" stroke="${b}" stroke-width="2" stroke-linecap="round" opacity=".7"/><rect x="10" y="61" width="80" height="30" fill="#1a1420" opacity=".55"/><circle cx="50" cy="61" r="3" fill="#fff"/>`;
      break;
    case 'blackhole':
      // 블랙홀: 검은 핵과 기울어진 강착 원반, 말려 드는 팔
      art = `<ellipse cx="50" cy="50" rx="36" ry="12" fill="none" stroke="url(#${g})" stroke-width="5" transform="rotate(-18 50 50)"/>${[0, 1, 2].map((i) => `<path d="M50 50 m0 -${12 + i * 7} a${12 + i * 7} ${12 + i * 7} 0 0 1 ${12 + i * 7} ${12 + i * 7}" fill="none" stroke="${i % 2 ? a : b}" stroke-width="2" stroke-linecap="round" transform="rotate(${i * 120} 50 50)"/>`).join('')}<circle cx="50" cy="50" r="13" fill="#0d0912" stroke="${b}" stroke-width="2"/><circle cx="50" cy="50" r="5" fill="#000"/>`;
      break;
    case 'meteor':
      // 유성우: 비스듬히 쏟아지는 별똥 셋
      art = [
        [62, 30, 1],
        [44, 48, 1.2],
        [70, 60, 0.8],
      ]
        .map(([x, y, k]) => `<path d="M${x} ${y} L${x - 30 * k} ${y - 22 * k}" stroke="url(#${g})" stroke-width="${5 * k}" stroke-linecap="round" opacity=".85"/><circle cx="${x}" cy="${y}" r="${5.5 * k}" fill="#fff" stroke="${b}" stroke-width="2"/>`)
        .join('') + `<path d="M24 80l6-4 6 4M60 84l5-3 5 3" stroke="${b}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      break;
    case 'supernova':
      // 초신성: 여덟 갈래로 터지는 별
      art = `<circle cx="50" cy="50" r="34" fill="url(#${g}r)"/><path d="${Array.from({ length: 16 }, (_, i) => {
        const t = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 ? 9 : i % 4 ? 26 : 36;
        return `${i ? 'L' : 'M'}${(50 + Math.cos(t) * rad).toFixed(1)} ${(50 + Math.sin(t) * rad).toFixed(1)}`;
      }).join('')}Z" fill="url(#${g})" stroke="#fff" stroke-width="1.5"/><circle cx="50" cy="50" r="6" fill="#fff"/>`;
      break;
    case 'flare':
      // 홍염: 해 가장자리에서 고리처럼 솟는 불꽃
      art = `<circle cx="50" cy="60" r="22" fill="${a}"/><path d="M34 46 C26 20, 56 8, 62 30 C66 44, 54 44, 52 38" fill="none" stroke="url(#${g})" stroke-width="6" stroke-linecap="round"/><path d="M60 42 C70 26, 86 34, 76 48" fill="none" stroke="${b}" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="60" r="14" fill="#fff" opacity=".45"/>`;
      break;
    case 'tide':
      // 조수: 달 아래로 밀려오는 물결
      art = `<path d="M52 16a18 18 0 1 0 20 28a14 14 0 1 1-20-28z" fill="${a}"/>${[56, 68, 80].map((y, i) => `<path d="M${12 + i * 4} ${y} q10 -8 19 0 t19 0 t19 0 t19 0" fill="none" stroke="${i % 2 ? a : b}" stroke-width="${4 - i}" stroke-linecap="round"/>`).join('')}`;
      break;
  }
  return `<svg viewBox="0 0 100 100" class="rx-emblem-svg" aria-hidden="true">${defs}${ring}${art}</svg>`;
}

/** 이 성속을 받은 다음 주문이 일으킬 수 있는 반응들 */
export function reactionsFrom(el: Element | null): ReactionDef[] {
  return el ? REACTIONS.filter((r) => r.from === el) : [];
}

/** 작은 문장 + 이름 꼬리표 */
export function reactionTag(id: string, cls = 'rx-tag'): HTMLElement {
  const r = reactionById(id);
  const em = h('span', { class: 'rx-em' });
  em.innerHTML = reactionEmblem(id);
  return h('span', { class: cls, style: { '--from': elColor(r.from), '--to': elColor(r.to) }, title: `${r.name}: ${r.desc}` }, em, h('b', {}, r.name));
}

/** 반응 설명 상자(카드 설명 아래에 붙는다) */
export function reactionBox(id: string): HTMLElement {
  const r = reactionById(id);
  const em = h('span', { class: 'rx-em big' });
  em.innerHTML = reactionEmblem(id);
  return h(
    'div',
    { class: 'rx-box', style: { '--from': elColor(r.from), '--to': elColor(r.to) } },
    em,
    h('div', {}, h('small', {}, `성좌 반응 · ${r.en}`), h('b', {}, r.name, ' ', elBadge(r.from, 'sm'), h('i', { class: 'rx-plus' }, '→'), elBadge(r.to, 'sm')), h('p', {}, r.desc)),
  );
}

/**
 * 반응 바퀴: 다섯 성속을 별 꼭짓점에 두고, 반응을 화살표로 잇는다.
 * 바깥 고리(태양→달→공허→혜성→성운→태양)가 기본 순환이고, 안쪽 두 줄(태양→혜성, 달→성운)이 갈래다.
 */
export function reactionWheel(highlight?: Element | null): HTMLElement {
  const order: Element[] = ['sol', 'luna', 'void', 'comet', 'nebula'];
  const pos = new Map(order.map((e, i) => {
    const t = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return [e, { x: 160 + Math.cos(t) * 112, y: 150 + Math.sin(t) * 112 }] as const;
  }));
  const id = `rw${++uid}`;
  const lines = REACTIONS.map((r) => {
    const p0 = pos.get(r.from)!;
    const p1 = pos.get(r.to)!;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const sx = p0.x + ux * 30;
    const sy = p0.y + uy * 30;
    const ex = p1.x - ux * 34;
    const ey = p1.y - uy * 34;
    const outer = order.indexOf(r.to) === (order.indexOf(r.from) + 1) % 5;
    // 바깥 고리는 바퀴 바깥쪽으로 휘고 이름도 바깥에, 안쪽 갈래는 곧게 긋고 이름을 출발점 가까이 둔다(두 갈래가 가운데서 엇갈리므로)
    const cxm = (sx + ex) / 2;
    const cym = (sy + ey) / 2;
    const nl = Math.hypot(cxm - 160, cym - 150) || 1;
    const nx = (cxm - 160) / nl;
    const ny = (cym - 150) / nl;
    const mx = cxm + (outer ? nx * 20 : 0);
    const my = cym + (outer ? ny * 20 : 0);
    const lit = highlight ? r.from === highlight : true;
    const lx = outer ? cxm + nx * 38 : sx + (ex - sx) * 0.3 - uy * 12;
    const ly = outer ? cym + ny * 38 : sy + (ey - sy) * 0.3 + ux * 12;
    return `<g class="rw-edge ${lit ? 'lit' : 'dim'}"><path d="M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}" fill="none" stroke="url(#${id}${r.id})" stroke-width="${outer ? 4 : 3}" marker-end="url(#${id}arrow)" stroke-linecap="round"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${r.name}</text></g><linearGradient id="${id}${r.id}" gradientUnits="userSpaceOnUse" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"><stop offset="0" stop-color="${elColor(r.from)}"/><stop offset="1" stop-color="${elColor(r.to)}"/></linearGradient>`;
  }).join('');
  const nodes = order
    .map((e) => {
      const p = pos.get(e)!;
      return `<g class="rw-node ${highlight === e ? 'on' : ''}"><circle cx="${p.x}" cy="${p.y}" r="26" fill="${elColor(e)}" stroke="#4a3426" stroke-width="3"/><text x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="middle" class="rw-glyph">${ELEMENTS[e].glyph}</text><text x="${p.x}" y="${p.y + 42}" text-anchor="middle" class="rw-name">${ELEMENTS[e].name}</text></g>`;
    })
    .join('');
  const wrap = h('div', { class: 'rx-wheel' });
  wrap.innerHTML = `<svg viewBox="-20 -16 360 340" role="img" aria-label="성좌 반응 바퀴"><defs><marker id="${id}arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#4a3426"/></marker></defs>${lines}${nodes}</svg>`;
  return wrap;
}

/** 반응 도감: 바퀴 + 일곱 반응 목록 */
export function reactionCodex(highlight?: Element | null): HTMLElement {
  return h(
    'div',
    { class: 'rx-codex' },
    h('p', { class: 'rx-lead' }, '앞 주문이 넘긴 성속을 다음 주문이 받으면 링크가 이어집니다. 그 두 성속이 아래 짝이면 성좌 반응이 터집니다.'),
    reactionWheel(highlight),
    h('div', { class: 'rx-list' }, REACTIONS.map((r) => reactionBox(r.id))),
  );
}
