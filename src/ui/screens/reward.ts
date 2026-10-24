import { chooseReward, type RunState } from '../../core/run';
import { rewardById } from '../../data/rewards';
import type { App } from '../app';
import { h } from '../dom';

/** 보상의 갈래(색): 회복 · 성장 · 성진 */
const KIND: Record<string, { label: string; tone: string }> = {
  mend: { label: '회복', tone: 'heal' },
  vigor: { label: '성장', tone: 'grow' },
  might: { label: '성장', tone: 'grow' },
  ward: { label: '성장', tone: 'grow' },
  flow: { label: '성진', tone: 'dust' },
  reserve: { label: '성진', tone: 'dust' },
  resonance: { label: '체인', tone: 'chain' },
};

const sum = (run: RunState, f: (a: RunState['team'][number]) => number) => run.team.reduce((s, a) => s + f(a), 0);

/** 고르기 전에 바뀔 수치를 "지금 → 고른 뒤"로 미리 보여 준다 */
function preview(run: RunState, id: string): [string, string, string] | null {
  const n = run.team.length;
  switch (id) {
    case 'mend': {
      const now = sum(run, (a) => a.hp);
      const after = sum(run, (a) => Math.min(a.maxHp, a.hp + Math.round(a.maxHp * 0.5)));
      return ['팀 HP', `${now}`, `${after} / ${sum(run, (a) => a.maxHp)}`];
    }
    case 'vigor':
      return ['팀 최대 HP', `${sum(run, (a) => a.maxHp)}`, `${sum(run, (a) => a.maxHp) + 12 * n}`];
    case 'might':
      return ['술사 공격', run.team.map((a) => a.atk).join('·'), run.team.map((a) => a.atk + 2).join('·')];
    case 'ward':
      return ['술사 방어', run.team.map((a) => a.def).join('·'), run.team.map((a) => a.def + 2).join('·')];
    case 'flow':
      return ['턴마다 성진', `${run.mods.stardustPerTurn}`, `${run.mods.stardustPerTurn + 1}`];
    case 'reserve':
      return ['시작 성진', `${run.mods.startStardust}`, `${run.mods.startStardust + 2}`];
    case 'resonance':
      return ['완성 보너스', `×${run.mods.fullChainBonus.toFixed(1)}`, `×${(run.mods.fullChainBonus + 0.5).toFixed(1)}`];
    default:
      return null;
  }
}

export function rewardScreen(app: App): HTMLElement {
  const run = app.run!;
  const choices = run.rewardChoices ?? [];
  const hpNow = sum(run, (a) => a.hp);
  const hpMax = sum(run, (a) => a.maxHp);
  let picked = false;
  const pick = (id: string, card: HTMLElement) => {
    if (picked) return;
    picked = true;
    card.classList.add('taken');
    root.classList.add('picked');
    chooseReward(run, id);
    app.save();
    setTimeout(() => app.go('map'), 420);
  };
  const root = h(
    'main',
    { class: 'reward-wrap' },
    h(
      'div',
      { class: 'screen-title center' },
      h('p', { class: 'eyebrow' }, `${run.floor}층 돌파`),
      h('h1', {}, '별의 축복'),
      h('p', { class: 'muted' }, '하나를 고르세요. ', h('span', { class: 'rw-hp' }, `팀 HP ${hpNow} / ${hpMax}`)),
    ),
    h(
      'div',
      { class: 'reward-grid' },
      choices.map((id, i) => {
        const r = rewardById(id);
        const kind = KIND[id] ?? { label: '축복', tone: 'grow' };
        const pv = preview(run, id);
        const card: HTMLElement = h(
          'button',
          {
            type: 'button',
            class: `reward-card rw-${kind.tone}`,
            style: { '--i': String(i) },
            onclick: () => pick(id, card),
            onpointermove: (e: PointerEvent) => {
              if (e.pointerType !== 'mouse') return;
              const b = card.getBoundingClientRect();
              card.style.setProperty('--tx', `${(((e.clientX - b.left) / b.width - 0.5) * 10).toFixed(1)}deg`);
              card.style.setProperty('--ty', `${((0.5 - (e.clientY - b.top) / b.height) * 8).toFixed(1)}deg`);
            },
          },
          h('kbd', { class: 'rw-key' }, String(i + 1)),
          h('span', { class: 'rw-kind' }, kind.label),
          h('span', { class: 'reward-glyph' }, h('i', {}, r.glyph)),
          h('h3', {}, r.name),
          h('p', {}, r.desc),
          pv ? h('span', { class: 'rw-pv' }, h('small', {}, pv[0]), h('span', {}, pv[1]), h('i', {}, '→'), h('b', {}, pv[2])) : null,
        );
        return card;
      }),
    ),
  );
  const onKey = (e: KeyboardEvent) => {
    if (!root.isConnected) return document.removeEventListener('keydown', onKey);
    const n = Number(e.key);
    const cards = root.querySelectorAll<HTMLElement>('.reward-card');
    if (n >= 1 && n <= choices.length) pick(choices[n - 1], cards[n - 1]);
  };
  document.addEventListener('keydown', onKey);
  return root;
}
