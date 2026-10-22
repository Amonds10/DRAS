import { findReaction } from '../data/elements';
import type { Element, SpellDef } from './types';

/** 체인 길이별 배율. 인덱스 = 체인 길이 */
export const CHAIN_MULT = [1, 1, 1.25, 1.6, 2];
export const FULL_CHAIN = 4;

export function chainMult(chain: number): number {
  return CHAIN_MULT[Math.min(chain, CHAIN_MULT.length - 1)];
}

export interface LinkStep {
  linked: boolean;
  chain: number;
  mult: number;
  /** 다음 마법에 넘겨줄 성속 */
  outElement: Element | null;
  reactionId: string | null;
  /** 성식(봉인) 때문에 링크가 끊겼는지 */
  sealed: boolean;
}

/** 직전 출력과 체인 수를 받아 이번 마법의 링크 결과를 계산한다. */
export function linkStep(prevOut: Element | null, prevChain: number, spell: SpellDef, seal: Element | null): LinkStep {
  const accepts = prevOut !== null && (spell.input === 'wild' || spell.input === prevOut);
  const outElement = spell.output === 'echo' ? (accepts ? prevOut : null) : spell.output;
  const sealed = accepts && seal !== null && outElement === seal;
  const linked = accepts && !sealed;
  const chain = linked ? prevChain + 1 : 1;
  const reaction = linked && prevOut && outElement ? findReaction(prevOut, outElement) : undefined;
  return { linked, chain, mult: chainMult(chain), outElement, reactionId: reaction?.id ?? null, sealed };
}

/** 계획한 시전 순서 전체의 링크 결과를 미리 계산한다. */
export function previewChain(spells: SpellDef[], seal: Element | null = null): LinkStep[] {
  const steps: LinkStep[] = [];
  let prevOut: Element | null = null;
  let prevChain = 0;
  for (const spell of spells) {
    const step = linkStep(prevOut, prevChain, spell, seal);
    steps.push(step);
    prevOut = step.outElement;
    prevChain = step.chain;
  }
  return steps;
}
