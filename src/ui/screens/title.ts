import { FLOORS } from '../../data/encounters';
import type { App } from '../app';
import { h } from '../dom';
import { showHelp } from '../help';
import { ROMAN, button, decoRule, modal } from '../widgets';

function menuItem(label: string, sub: string, onClick: () => void, primary = false): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `menu-item ${primary ? 'primary' : ''}`, onclick: onClick },
    h('span', { class: 'menu-diamond' }, '◆'),
    h('span', { class: 'menu-text' }, h('b', {}, label), h('small', {}, sub)),
  );
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
    h('div', { class: 'title-bg', 'aria-hidden': 'true' }, h('div', { class: 'bg-rays' }), h('div', { class: 'bg-astrolabe big' }, h('i'), h('i'), h('i'), h('i'))),
    h(
      'div',
      { class: 'title-hero' },
      h('p', { class: 'title-kicker' }, 'ANNO STELLARUM'),
      h('h1', { class: 'title-logo' }, '성좌술사'),
      decoRule('STARWEAVER'),
      h('p', { class: 'title-tag' }, 'Weave the stars, one spell at a time.'),
    ),
    h(
      'nav',
      { class: 'title-menu', 'aria-label': '메인 메뉴' },
      saved ? menuItem('이어하기', `${ROMAN[floorIdx]}층 · ${FLOORS[floorIdx].name}`, () => app.resume(saved), true) : null,
      menuItem('새 여정', 'NEW JOURNEY', startNew, !saved),
      menuItem('플레이 방법', 'HOW TO PLAY', () => showHelp()),
    ),
    h('footer', { class: 'title-foot' }, 'PROTOTYPE · v0.2'),
  );
}
