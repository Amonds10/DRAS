import { FLOORS } from '../../data/encounters';
import type { App } from '../app';
import { h } from '../dom';
import { button } from '../widgets';

export function resultScreen(app: App): HTMLElement {
  const run = app.run!;
  const won = run.phase === 'victory';
  const stats: [string, string | number][] = [
    ['도달한 층', `${Math.min(run.floor + (won ? 0 : 1), FLOORS.length)} / ${FLOORS.length}`],
    ['승리한 전투', run.stats.battlesWon],
    ['최대 체인', run.stats.maxChain],
    ['성좌 반응', run.stats.reactions],
    ['성좌 완성', run.stats.fullChains],
    ['총 라운드', run.stats.rounds],
  ];
  return h(
    'main',
    { class: `result-wrap ${won ? 'won' : 'lost'}` },
    h(
      'div',
      { class: 'result-card panel' },
      h('p', { class: 'eyebrow' }, won ? '여정 완료' : '여정 실패'),
      h('h1', {}, won ? '하늘을 되찾았다' : '별빛이 꺼졌다'),
      h('p', { class: 'muted' }, won ? '부서진 하늘섬 위로 다시 별자리가 떠올랐습니다.' : '다음 여정에서는 더 긴 체인을 이어 보세요.'),
      h('dl', { class: 'result-stats' }, stats.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
      h(
        'div',
        { class: 'result-actions' },
        button('메인으로', () => {
          app.run = null;
          app.go('title');
        }),
        button('새 여정', () => {
          app.run = null;
          app.go('team');
        }, { variant: 'primary' }),
      ),
    ),
  );
}
