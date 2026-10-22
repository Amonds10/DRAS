import type { GfxPref } from '../render/three/quality';
import { getStage } from '../render/three/stage';

const ORDER: GfxPref[] = ['auto', 'high', 'low'];
const NAMES: Record<GfxPref, string> = { auto: '자동', high: '높음', low: '낮음' };

/** 그래픽 설정 표시: "자동 (높음)"처럼 실제 적용된 등급도 함께 */
export function graphicsLabel(): string {
  const g = getStage().graphics;
  return g.pref === 'auto' ? `${NAMES.auto} (${NAMES[g.tier]})` : NAMES[g.pref];
}

/** 자동 → 높음 → 낮음 순서로 바꾼다. 바뀐 표시 문자열을 돌려준다. */
export function cycleGraphics(): string {
  const stage = getStage();
  const next = ORDER[(ORDER.indexOf(stage.graphics.pref) + 1) % ORDER.length];
  stage.setGraphics(next);
  return graphicsLabel();
}
