import { chooseReward } from '../../core/run';
import { rewardById } from '../../data/rewards';
import type { App } from '../app';
import { h } from '../dom';
import { ROMAN, decoRule } from '../widgets';

export function rewardScreen(app: App): HTMLElement {
  const run = app.run!;
  const choices = run.rewardChoices ?? [];
  return h(
    'main',
    { class: 'reward-wrap' },
    h('div', { class: 'screen-title center' }, h('p', { class: 'kicker' }, 'BLESSING OF THE STARS'), h('h1', {}, '별의 축복'), h('p', { class: 'muted' }, '성역을 지켜냈습니다. 카드 한 장을 고르세요.')),
    h(
      'div',
      { class: 'reward-grid' },
      choices.map((id, i) => {
        const r = rewardById(id);
        return h(
          'button',
          {
            type: 'button',
            class: 'reward-card',
            style: { '--i': String(i) },
            onclick: () => {
              chooseReward(run, id);
              app.save();
              app.go('map');
            },
          },
          h('span', { class: 'tarot-num' }, ROMAN[i]),
          h('span', { class: 'reward-art' }, h('span', { class: 'tarot-rays' }), h('span', { class: 'reward-glyph' }, r.glyph)),
          h('h3', {}, r.name),
          decoRule(),
          h('p', {}, r.desc),
        );
      }),
    ),
  );
}
