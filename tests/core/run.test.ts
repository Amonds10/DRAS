import { describe, expect, it } from 'vitest';
import { bestPlan } from '../../src/core/autoplan';
import { executeRound } from '../../src/core/battle';
import { chooseReward, clearRun, finishBattle, loadRun, newRun, saveRun, startBattle, type KeyValueStore } from '../../src/core/run';
import { FLOORS } from '../../src/data/encounters';

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const TEAM = ['solea', 'lune', 'nox', 'vela'];

describe('run', () => {
  it('rejects teams that are not exactly 4 distinct units', () => {
    expect(() => newRun(TEAM.slice(0, 3), 1)).toThrow();
    expect(() => newRun([...TEAM.slice(0, 3), TEAM[0]], 1)).toThrow();
  });

  it('moves map → battle → reward → map and carries HP over', () => {
    const run = newRun(TEAM, 3);
    const battle = startBattle(run);
    expect(run.phase).toBe('battle');
    for (let i = 0; i < 30 && battle.outcome === 'ongoing'; i++) executeRound(battle, bestPlan(battle));
    expect(battle.outcome).toBe('victory');
    finishBattle(run);
    expect(run.phase).toBe('reward');
    expect(run.floor).toBe(1);
    expect(run.rewardChoices).toHaveLength(3);
    chooseReward(run, run.rewardChoices![0]);
    expect(run.phase).toBe('map');
  });

  it('save and load round-trip, and finished runs are not resumable', () => {
    const store = memoryStore();
    const run = newRun(TEAM, 4);
    saveRun(store, run);
    expect(loadRun(store)).toEqual(run);
    run.phase = 'defeat';
    saveRun(store, run);
    expect(loadRun(store)).toBeNull();
    clearRun(store);
    expect(store.getItem('starweaver.run')).toBeNull();
  });

  it('corrupted saves load as null', () => {
    const store = memoryStore();
    store.setItem('starweaver.run', '{not json');
    expect(loadRun(store)).toBeNull();
  });

  it('a full run can be completed by the auto planner', () => {
    const run = newRun(TEAM, 12345);
    while (run.phase !== 'victory' && run.phase !== 'defeat') {
      if (run.phase === 'map') {
        const b = startBattle(run);
        for (let i = 0; i < 60 && b.outcome === 'ongoing'; i++) executeRound(b, bestPlan(b));
        finishBattle(run);
      } else if (run.phase === 'reward') {
        chooseReward(run, run.rewardChoices![0]);
      }
    }
    expect(['victory', 'defeat']).toContain(run.phase);
    if (run.phase === 'victory') expect(run.floor).toBe(FLOORS.length);
  });
});
