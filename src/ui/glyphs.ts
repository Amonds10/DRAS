import type { SkillTag } from '../core/types';

/**
 * 스킬 유형 아이콘. 굵은 단색 실루엣(24×24)이라 작게 써도 읽힌다.
 * 색은 currentColor를 따르므로 바깥에서 정한다.
 */
const PATHS: Record<SkillTag, string> = {
  // 단일: 대각선 칼날
  strike: '<path d="M20.5 2.5 21.5 3.5 21 8 9.6 19.4 4.6 14.4 16 3z"/><path d="M3 16.2 7.8 21l-1.4 1.4-1.6-1.6L2.6 23 1 21.4l2.2-2.2-1.6-1.6z"/>',
  // 연타: 세 겹 갈퀴
  multi: '<path d="M3 4h4l5 8-5 8H3l5-8z"/><path d="M10 4h3.6l5 8-5 8H10l5-8z" opacity=".75"/><path d="M17 4h2l4 8-4 8h-2l4-8z" opacity=".5"/>',
  // 광역: 퍼지는 파동
  aoe: '<circle cx="12" cy="12" r="3.2"/><path d="M12 5.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/><path d="M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22zm0 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" opacity=".55"/>',
  // 관통: 벽을 뚫는 화살
  pierce: '<path d="M1 11h14V7.5l8 4.5-8 4.5V13H1z"/><path d="M9 3h2.4v6H9zm0 12h2.4v6H9z" opacity=".6"/>',
  // 처단: 조준선 안의 X
  execute: '<path d="M11 1h2v5h-2zm0 17h2v5h-2zM1 11h5v2H1zm17 0h5v2h-5z"/><path d="m7.8 6.4 4.2 4.2 4.2-4.2 1.4 1.4-4.2 4.2 4.2 4.2-1.4 1.4-4.2-4.2-4.2 4.2-1.4-1.4 4.2-4.2-4.2-4.2z"/>',
  // 흡수: 물방울과 되돌아오는 화살
  drain: '<path d="M12 2s7 7.6 7 12.5a7 7 0 0 1-14 0C5 9.6 12 2 12 2z"/><path d="M8.5 14.5a3.5 3.5 0 0 0 6.2 2.2l-1.7-1.2h4.5V20l-1.4-1.6A5.5 5.5 0 0 1 6.5 14.5z" fill="#000" opacity=".45"/>',
  // 지속: 불꽃
  dot: '<path d="M12 1.5c1 4 6.5 6.4 6.5 12.5A6.5 6.5 0 0 1 5.5 14c0-3 1.6-5 3-6 0 2 1 3.4 2.2 3.8C10 8 10.6 4.4 12 1.5z"/><path d="M12 13c.6 2 3 2.6 3 5a3 3 0 0 1-6 0c0-1.6 1-2.6 1.6-3 .1 1 .6 1.5 1.1 1.6-.2-1.3-.2-2.5.3-3.6z" fill="#000" opacity=".4"/>',
  // 지연: 모래시계
  delayed: '<path d="M5 1h14v2h-1.5v3.2L13.3 12l4.2 5.8V21H19v2H5v-2h1.5v-3.2l4.2-5.8-4.2-5.8V3H5z"/><path d="M9 19h6v-1l-3-4-3 4z" fill="#000" opacity=".4"/>',
  // 약화: 갈라진 아래 화살표
  debuff: '<path d="M10 1h4v11h5l-7 10-7-10h5z"/><path d="m14.6 6.5-3 2.2 2 1.6-2.4 2.4" stroke="#000" stroke-width="1.4" fill="none" opacity=".5"/>',
  // 치유: 십자
  heal: '<path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/>',
  // 보호: 방패
  shield: '<path d="M12 1 21 4.5V11c0 5.8-3.9 10-9 12-5.1-2-9-6.2-9-12V4.5z"/><path d="M12 4.2v15.6c3.4-1.7 6-4.8 6-8.8V6.6z" fill="#000" opacity=".3"/>',
  // 강화: 겹친 위 화살표
  buff: '<path d="m12 2 9 9h-5.5L12 7.5 8.5 11H3z"/><path d="m12 10 9 9h-5.5L12 15.5 8.5 19H3z" opacity=".65"/>',
  // 보조: 네 갈래 별
  utility: '<path d="M12 0c.9 6.5 4.5 10.1 12 12-7.5 1.9-11.1 5.5-12 12-.9-6.5-4.5-10.1-12-12C7.5 10.1 11.1 6.5 12 0z"/>',
};

export function glyphSvg(tag: SkillTag): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${PATHS[tag]}</svg>`;
}

/** 아이콘을 담은 span */
export function glyph(tag: SkillTag, cls = 'glyph'): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = cls;
  el.innerHTML = glyphSvg(tag);
  return el;
}
