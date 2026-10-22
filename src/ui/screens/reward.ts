import { chooseReward } from '../../core/run';
import { rewardById } from '../../data/rewards';
import type { App } from '../app';
import { h } from '../dom';

export function rewardScreen(app: App): HTMLElement {
  const run = app.run!;
  const choices = run.rewardChoices ?? [];
  return h(
    'main',
    { class: 'reward-wrap' },
    h('div', { class: 'screen-title center' }, h('h1', {}, '별의 축복'), h('p', { class: 'muted' }, '전투에서 이겼습니다. 하나를 고르세요.')),
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
          h('span', { class: 'reward-glyph' }, r.glyph),
          h('h3', {}, r.name),
          h('p', {}, r.desc),
        );
      }),
    ),
  );
}
