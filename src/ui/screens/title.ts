import { FLOORS } from '../../data/encounters';
import type { App } from '../app';
import { h } from '../dom';
import { showHelp } from '../help';
import { button, modal } from '../widgets';

function menuItem(label: string, sub: string | null, onClick: () => void, primary = false): HTMLButtonElement {
  return h('button', { type: 'button', class: `menu-item ${primary ? 'primary' : ''}`, onclick: onClick }, h('b', {}, label), sub ? h('small', {}, sub) : null);
}

export function titleScreen(app: App): HTMLElement {
  const saved = app.savedRun();

  const startNew = () => {
    if (!saved) return app.go('team');
    const body = h(
      'div',
      {},
      h('p', {}, '진행 중인 여정이 있습니다. 새로 시작하면 지금 여정은 사라집니다.'),
      h(
        'div',
        { class: 'modal-actions' },
        button('취소', () => dlg.remove()),
        button('새로 시작', () => {
          dlg.remove();
          app.abandon();
          app.go('team');
        }, { variant: 'danger' }),
      ),
    );
    const dlg = modal('새 여정', body, () => {});
  };

  const floorIdx = saved ? Math.min(saved.floor, FLOORS.length - 1) : 0;

  return h(
    'main',
    { class: 'title-wrap' },
    h('div', { class: 'title-hero' }, h('h1', { class: 'title-logo' }, '성좌술사'), h('p', { class: 'title-tag' }, '마법과 마법을 이어 별자리를 완성하는 턴제 전투')),
    h(
      'nav',
      { class: 'title-menu', 'aria-label': '메인 메뉴' },
      saved ? menuItem('이어하기', `${floorIdx + 1}층 · ${FLOORS[floorIdx].name}`, () => app.resume(saved), true) : null,
      menuItem('새 여정', null, startNew, !saved),
      menuItem('플레이 방법', null, () => showHelp()),
    ),
    h('footer', { class: 'title-foot' }, '프로토타입 v0.3'),
  );
}
