import { spellById } from '../data/spells';
import { unitById } from '../data/units';
import { previewChain } from './link';
import type { SpellDef } from './types';

export const TEAM_SIZE = 4;

export interface SequenceStep {
  unitId: string;
  spellId: string;
}

export interface TeamSynergy {
  /** 이 팀으로 만들 수 있는 최대 체인 */
  maxChain: number;
  /** 최대 체인을 만드는 예시 순서(반응이 많은 쪽 우선) */
  bestSequence: SequenceStep[];
  /** 이 팀으로 발동할 수 있는 성좌 반응 */
  reactions: string[];
  /** 서로 다른 술사 사이에 이어지는 마법 쌍 수 */
  linkPairs: number;
}

function* sequences(unitIds: string[], prefix: SequenceStep[] = []): Generator<SequenceStep[]> {
  for (const id of unitIds) {
    if (prefix.some((p) => p.unitId === id)) continue;
    for (const spellId of unitById(id).spells) {
      const next = [...prefix, { unitId: id, spellId }];
      yield next;
      yield* sequences(unitIds, next);
    }
  }
}

function canFeed(from: SpellDef, to: SpellDef): boolean {
  if (from.output === 'echo') return false;
  return to.input === 'wild' || to.input === from.output;
}

/** 편성 화면용: 팀이 가진 링크 궁합을 계산한다. 실제 전투와 같은 링크 규칙(previewChain)을 쓴다. */
export function analyzeTeam(unitIds: string[]): TeamSynergy {
  const reactions = new Set<string>();
  let maxChain = 0;
  let bestReactions = -1;
  let bestSequence: SequenceStep[] = [];

  for (const seq of sequences(unitIds)) {
    const steps = previewChain(seq.map((s) => spellById(s.spellId)));
    const last = steps[steps.length - 1];
    let reactionCount = 0;
    for (const st of steps) {
      if (st.reactionId) {
        reactions.add(st.reactionId);
        reactionCount++;
      }
    }
    // 처음부터 끝까지 끊김 없이 이어진 순서만 최대 체인 후보로 본다.
    if (last.chain !== seq.length) continue;
    if (last.chain > maxChain || (last.chain === maxChain && reactionCount > bestReactions)) {
      maxChain = last.chain;
      bestReactions = reactionCount;
      bestSequence = seq;
    }
  }

  let linkPairs = 0;
  for (const a of unitIds) {
    for (const b of unitIds) {
      if (a === b) continue;
      for (const sa of unitById(a).spells) {
        for (const sb of unitById(b).spells) {
          if (canFeed(spellById(sa), spellById(sb))) linkPairs++;
        }
      }
    }
  }

  return { maxChain, bestSequence, reactions: [...reactions], linkPairs };
}
