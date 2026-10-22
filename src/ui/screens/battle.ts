import { executeRound, getFocus, isAlive, planCost, setFocus } from '../../core/battle';
import { previewChain } from '../../core/link';
import { finishBattle } from '../../core/run';
import type { Ally, BattleEvent, BattleState, Element, Enemy, PlannedCast } from '../../core/types';
import { ELEMENTS, STATUS_META, reactionById } from '../../data/elements';
import { FLOORS } from '../../data/encounters';
import { TRAIT_DESC, enemyById } from '../../data/enemies';
import { spellById } from '../../data/spells';
import { unitById } from '../../data/units';
import { allyFigure, enemyFigure } from '../../render/figures';
import type { App } from '../app';
import { h, s, sleep } from '../dom';
import { showHelp } from '../help';
import { NUM, allyName, button, elBadge, elColor, hpBar, intentView, modal, reactionChip, spellCard, statusRow, updateHpBar } from '../widgets';

/** 무대 위 아군 위치: [가로 %, 발끝 세로 %] */
const ALLY_POS: [number, number][] = [
  [10, 80], [21, 91], [32, 80], [43, 91],
];

function enemyPositions(n: number): [number, number][] {
  if (n === 1) return [[74, 86]];
  if (n === 2) return [[65, 82], [86, 90]];
  return Array.from({ length: n }, (_, i) => [58 + (i * 30) / (n - 1), i % 2 ? 90 : 82] as [number, number]);
}

function unitLabel(state: BattleState, uid: string): string {
  const ally = state.allies.find((a) => a.uid === uid);
  if (ally) return allyName(ally);
  const enemy = state.enemies.find((e) => e.uid === uid);
  return enemy ? enemyById(enemy.defId).name : uid;
}

function eventText(state: BattleState, ev: BattleEvent): string | null {
  switch (ev.type) {
    case 'cast': {
      const link = ev.linked ? ` · 링크 ${ev.chain} (×${ev.mult})` : ev.sealed ? ' · 성식에 끊김' : '';
      return `${unitLabel(state, ev.allyUid)}: ${spellById(ev.spellId).name}${link}`;
    }
    case 'reaction':
      return `성좌 반응 「${reactionById(ev.reactionId).name}」`;
    case 'fullChain':
      return '성좌 완성!';
    case 'damage':
      return `${unitLabel(state, ev.targetUid)} 피해 ${ev.amount}${ev.absorbed ? ` (보호막 ${ev.absorbed})` : ''}${ev.source === 'burn' ? ' [연소]' : ''}`;
    case 'heal':
      return `${unitLabel(state, ev.targetUid)} 회복 ${ev.amount}`;
    case 'enemyStunned':
      return `${unitLabel(state, ev.enemyUid)}은(는) 기절해 움직이지 못한다`;
    case 'death':
      return `${unitLabel(state, ev.uid)} 쓰러짐`;
    case 'seal':
      return `성식: 다음 턴 ${ELEMENTS[ev.element].name} 링크 봉인`;
    case 'skip':
      return `${unitLabel(state, ev.allyUid)}: ${ev.reason === 'cost' ? '성진 부족' : '시전 불가'}`;
    case 'round':
      return `— ${ev.round} 라운드 —`;
    default:
      return null;
  }
}

export function battleScreen(app: App): HTMLElement {
  const run = app.run!;
  const battle = run.battle!;
  const floor = FLOORS[run.floor];
  let plan: PlannedCast[] = [];
  let busy = false;
  const log: string[] = [`— ${battle.round} 라운드 —`];

  const root = h('main', { class: 'battle-wrap' });
  const fighters = new Map<string, HTMLElement>();
  let scene: HTMLElement;
  let skySvg: SVGSVGElement;
  let fxSvg: SVGSVGElement;
  let callout: HTMLElement;
  let queueEl: HTMLElement;
  let meter: HTMLElement;

  const wait = (ms: number) => sleep(ms / app.speed);
  const remaining = () => battle.stardust - planCost(plan);

  // ── 계획 조작 ────────────────────────────────────────────
  const pickSpell = (ally: Ally, spellId: string) => {
    if (busy) return;
    const idx = plan.findIndex((p) => p.allyUid === ally.uid);
    if (idx >= 0 && plan[idx].spellId === spellId) plan.splice(idx, 1);
    else if (idx >= 0) plan[idx] = { allyUid: ally.uid, spellId };
    else plan.push({ allyUid: ally.uid, spellId });
    render();
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= plan.length) return;
    [plan[i], plan[j]] = [plan[j], plan[i]];
    render();
  };

  // ── 좌표 ─────────────────────────────────────────────────
  /** 장면 기준 % 좌표로 변환한 형상의 '심장' 위치 */
  const heart = (uid: string): [number, number] | null => {
    const el = fighters.get(uid)?.querySelector('.fighter-fig');
    if (!el || !scene) return null;
    const r = el.getBoundingClientRect();
    const sr = scene.getBoundingClientRect();
    const isAlly = uid.startsWith('a');
    return [((r.left + r.width / 2 - sr.left) / sr.width) * 100, ((r.top + r.height * (isAlly ? 0.36 : 0.5) - sr.top) / sr.height) * 100];
  };

  const line = (svg: SVGSVGElement, a: [number, number], b: [number, number], cls: string, color: string) => {
    const l = s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls, style: { '--el': color }, 'vector-effect': 'non-scaling-stroke' });
    svg.append(l);
    return l;
  };

  const drawPreview = () => {
    if (!skySvg) return;
    for (const n of skySvg.querySelectorAll('.preview')) n.remove();
    const steps = previewChain(plan.map((p) => spellById(p.spellId)), battle.seal);
    plan.forEach((p, i) => {
      if (i === 0) return;
      const a = heart(plan[i - 1].allyUid);
      const b = heart(p.allyUid);
      const prevOut = steps[i - 1].outElement;
      if (a && b) line(skySvg, a, b, `sky-line preview ${steps[i].linked ? 'ok' : 'broken'}`, prevOut ? elColor(prevOut) : '#888');
    });
  };

  // ── 화면 구성 ────────────────────────────────────────────
  const stardustMeter = () => {
    const left = remaining();
    return h(
      'div',
      { class: 'gauge', title: `성진 ${battle.stardust} / ${battle.maxStardust} (매 턴 +${battle.mods.stardustPerTurn})` },
      h('span', { class: 'gauge-label' }, '성진'),
      h('span', { class: 'pips' }, Array.from({ length: battle.maxStardust }, (_, i) => h('i', { class: i < left ? 'on' : i < battle.stardust ? 'planned' : '' }))),
      h('b', { class: 'gauge-num' }, `${left}`),
    );
  };

  const threatCount = (a: Ally) =>
    battle.enemies.filter((e) => isAlive(e) && e.intent && ((e.intent.kind === 'attack' && e.intent.targetId === a.uid) || e.intent.kind === 'attackAll')).length;

  const allyFighter = (a: Ally, i: number) => {
    const unit = unitById(a.defId);
    const color = elColor(unit.element);
    const planIdx = plan.findIndex((p) => p.allyUid === a.uid);
    const threat = isAlive(a) ? threatCount(a) : 0;
    const el = h(
      'div',
      {
        class: `fighter ally ${isAlive(a) ? '' : 'dead'} ${planIdx >= 0 ? 'queued' : ''}`,
        'data-uid': a.uid,
        style: { left: `${ALLY_POS[i][0]}%`, top: `${ALLY_POS[i][1]}%`, '--el': color, '--z': String(ALLY_POS[i][1]) },
      },
      planIdx >= 0 ? h('span', { class: 'fighter-order' }, NUM[planIdx]) : null,
      threat ? h('span', { class: 'fighter-threat', title: '이번 턴 공격받을 예정' }, h('span', {}, '⚔')) : null,
      h('div', { class: 'fighter-fig' }),
      h('div', { class: 'fighter-floor' }),
      h(
        'div',
        { class: 'plate' },
        h('div', { class: 'plate-name' }, h('span', { class: 'plate-num' }, NUM[i]), h('span', { class: 'plate-text' }, unit.name)),
        hpBar(a.hp, a.maxHp, a.shield),
        statusRow(a.statuses),
      ),
    );
    el.querySelector('.fighter-fig')!.innerHTML = allyFigure(unit.role, color, unit.element === 'star');
    fighters.set(a.uid, el);
    return el;
  };

  const enemyFighter = (e: Enemy, pos: [number, number], focusUid: string | null) => {
    const def = enemyById(e.defId);
    const alive = isAlive(e);
    const boss = !!def.traits?.length;
    const el = h(
      'button',
      {
        type: 'button',
        class: `fighter enemy ${alive ? '' : 'dead'} ${focusUid === e.uid ? 'focused' : ''} ${boss ? 'boss' : ''}`,
        'data-uid': e.uid,
        disabled: !alive,
        title: alive ? `${def.name} — 눌러서 집중 대상으로 지정` : def.name,
        style: { left: `${pos[0]}%`, top: `${pos[1]}%`, '--z': String(pos[1]) },
        onclick: () => {
          if (busy) return;
          setFocus(battle, e.uid);
          render();
        },
      },
      alive ? intentView(e.intent, e, battle.allies) : null,
      h('div', { class: 'fighter-fig' }, focusUid === e.uid && alive ? h('span', { class: 'reticle' }) : null),
      h('div', { class: 'fighter-floor' }),
      h(
        'div',
        { class: 'plate' },
        h('div', { class: 'plate-name' }, def.name),
        hpBar(e.hp, e.maxHp, e.shield),
        statusRow(e.statuses),
        boss ? def.traits!.map((t) => h('p', { class: 'trait' }, TRAIT_DESC[t])) : null,
      ),
    );
    el.querySelector('.fighter-fig')!.insertAdjacentHTML('afterbegin', enemyFigure(e.defId));
    fighters.set(e.uid, el);
    return el;
  };

  const queueView = () => {
    const steps = previewChain(plan.map((p) => spellById(p.spellId)), battle.seal);
    return h(
      'div',
      { class: 'queue', 'aria-label': '시전 순서' },
      Array.from({ length: 4 }, (_, i) => {
        const p = plan[i];
        const connector =
          i === 0
            ? null
            : h(
                'div',
                { class: `q-link ${p ? (steps[i].linked ? 'ok' : 'broken') : ''}` },
                p && steps[i].reactionId ? reactionChip(steps[i].reactionId!) : null,
                h('span', { class: 'q-link-mark' }, p ? (steps[i].linked ? `×${steps[i].mult}` : steps[i].sealed ? '⊘' : '✕') : ''),
              );
        if (!p) return [connector, h('div', { class: 'q-slot empty' }, h('span', {}, NUM[i]))];
        const ally = battle.allies.find((a) => a.uid === p.allyUid)!;
        const unit = unitById(ally.defId);
        return [
          connector,
          h(
            'div',
            { class: 'q-slot', 'data-i': String(i) },
            spellCard(spellById(p.spellId), { element: unit.element, numeral: NUM[battle.allies.indexOf(ally)], size: 'mini' }),
            h(
              'div',
              { class: 'q-ctrl' },
              button('‹', () => move(i, -1), { class: 'btn-q', disabled: i === 0 || busy, title: '앞으로' }),
              button('✕', () => {
                plan.splice(i, 1);
                render();
              }, { class: 'btn-q', disabled: busy, title: '빼기' }),
              button('›', () => move(i, 1), { class: 'btn-q', disabled: i === plan.length - 1 || busy, title: '뒤로' }),
            ),
          ),
        ];
      }).flat(),
    );
  };

  const handView = () => {
    const steps = previewChain(plan.map((p) => spellById(p.spellId)), battle.seal);
    const last = steps[steps.length - 1];
    return h(
      'section',
      { class: 'hand', 'aria-label': '마법 카드' },
      h(
        'div',
        { class: 'hand-cards' },
        battle.allies.map((a, i) => {
          const unit = unitById(a.defId);
          const alive = isAlive(a);
          const planIdx = plan.findIndex((p) => p.allyUid === a.uid);
          const myCost = planIdx >= 0 ? spellById(plan[planIdx].spellId).cost : 0;
          return h(
            'div',
            { class: `hand-group ${alive ? '' : 'dead'}`, style: { '--el': elColor(unit.element) } },
            h('div', { class: 'hand-owner' }, h('span', { class: 'plate-num' }, NUM[i]), elBadge(unit.element, 'sm'), h('span', {}, unit.name)),
            h(
              'div',
              { class: 'hand-pair' },
              unit.spells.map((id) => {
                const sp = spellById(id);
                const chosen = planIdx >= 0 && plan[planIdx].spellId === id;
                return spellCard(sp, {
                  element: unit.element,
                  numeral: NUM[i],
                  chosen,
                  order: chosen ? planIdx : undefined,
                  disabled: !alive || busy || (!chosen && sp.cost > remaining() + myCost),
                  onClick: () => pickSpell(a, id),
                });
              }),
            ),
          );
        }),
      ),
      h(
        'div',
        { class: 'cast-zone' },
        h(
          'div',
          { class: 'chain-readout' },
          h('span', { class: 'chain-label' }, '체인'),
          h('b', { class: last?.chain === 4 ? 'full' : '' }, plan.length ? last.chain : 0),
          h('small', {}, last?.chain === 4 ? '성좌 완성' : plan.length ? `×${last.mult}` : '대기 시 성진만 모입니다'),
        ),
        h(
          'button',
          { type: 'button', class: 'cast-btn', disabled: busy, onclick: () => void execute() },
          plan.length ? '시전' : '대기',
        ),
        button('초기화', () => {
          plan = [];
          render();
        }, { class: 'btn-sm btn-reset', disabled: busy || plan.length === 0 }),
      ),
    );
  };

  const showLog = () => modal('전투 기록', h('ol', { class: 'log-list' }, log.slice(-60).reverse().map((l) => h('li', {}, l))), () => {});

  function render() {
    fighters.clear();
    const focus = getFocus(battle);
    meter = stardustMeter();
    queueEl = queueView();
    skySvg = s('svg', { class: 'sky-lines', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    fxSvg = s('svg', { class: 'fx-lines', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    callout = h('div', { class: 'callout-layer', 'aria-live': 'polite' });
    const ePos = enemyPositions(battle.enemies.length);
    scene = h(
      'section',
      { class: `scene floor-${floor.kind}`, 'aria-label': '전장' },
      h('div', { class: 'scene-bg' }),
      skySvg,
      h(
        'header',
        { class: 'hud' },
        h(
          'div',
          { class: 'hud-left' },
          button('‹', () => {
            if (busy) return;
            app.save();
            app.go('title');
          }, { class: 'btn-hud', title: '메인으로 (진행 상황은 저장됩니다)' }),
          h('div', { class: 'plaque' }, h('span', { class: 'plaque-sub' }, `${run.floor + 1}층 · ${floor.name}`), h('b', {}, `${battle.round} 라운드`)),
        ),
        queueEl,
        h(
          'div',
          { class: 'hud-right' },
          meter,
          button(app.speed > 1 ? '×2' : '×1', () => {
            app.setSpeed(app.speed > 1 ? 1 : 2);
            render();
          }, { class: 'btn-hud', title: '연출 속도' }),
          button('기록', showLog, { class: 'btn-hud', title: '전투 기록' }),
          button('?', () => showHelp(), { class: 'btn-hud', title: '플레이 방법' }),
        ),
      ),
      battle.allies.map(allyFighter),
      battle.enemies.map((e, i) => enemyFighter(e, ePos[i], focus?.uid ?? null)),
      fxSvg,
      battle.seal ? h('div', { class: 'seal-banner' }, '⊘ 성식 — ', elBadge(battle.seal, 'sm'), ` ${ELEMENTS[battle.seal].name}(으)로 가는 링크가 끊깁니다`) : null,
      callout,
    );
    root.replaceChildren(scene, handView());
    requestAnimationFrame(drawPreview);
  }

  // ── 연출 ────────────────────────────────────────────────
  const floatText = (uid: string, text: string, kind: string) => {
    const f = fighters.get(uid);
    if (!f) return;
    const n = h('span', { class: `float ${kind}` }, text);
    n.style.setProperty('--x', `${Math.round(Math.random() * 50 - 25)}px`);
    f.append(n);
    setTimeout(() => n.remove(), 1500);
  };

  const burst = (uid: string, kind: string) => {
    const f = fighters.get(uid)?.querySelector('.fighter-fig');
    if (!f) return;
    const b = h('span', { class: `burst ${kind}` });
    f.append(b);
    setTimeout(() => b.remove(), 700);
  };

  const showCallout = (content: Node, kind = '') => {
    callout.replaceChildren(h('div', { class: `callout ${kind}` }, content));
  };

  const clearCallout = () => callout.replaceChildren();

  const bolt = (from: string, to: string, color: string) => {
    const a = heart(from);
    const b = heart(to);
    if (!a || !b) return;
    const l = line(fxSvg, a, b, 'bolt', color);
    setTimeout(() => l.remove(), 650);
  };

  /** cast 이벤트 직후 이어지는, 이 시전이 만든 피해 대상들 */
  const castTargets = (events: BattleEvent[], from: number): string[] => {
    const out = new Set<string>();
    for (let i = from + 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'cast' || ev.type === 'enemyAct' || ev.type === 'enemyStunned' || ev.type === 'fullChain') break;
      if (ev.type === 'damage' && ev.source === 'ally') out.add(ev.targetUid);
    }
    return [...out];
  };

  async function play(events: BattleEvent[]) {
    let prevCaster: string | null = null;
    let prevOut: Element | null = null;
    let enemyPhase = false;
    let castIdx = -1;
    for (let k = 0; k < events.length; k++) {
      const ev = events[k];
      const text = eventText(battle, ev);
      if (text) log.push(text);
      switch (ev.type) {
        case 'cast': {
          castIdx++;
          const f = fighters.get(ev.allyUid);
          const unit = unitById(battle.allies.find((a) => a.uid === ev.allyUid)!.defId);
          const color = elColor(unit.element);
          queueEl.querySelectorAll('.q-slot').forEach((q, i) => q.classList.toggle('active', i === castIdx));
          queueEl.querySelectorAll('.q-slot').forEach((q, i) => i < castIdx && q.classList.add('spent'));
          f?.classList.add('casting');
          if (ev.linked && prevCaster) {
            const a = heart(prevCaster);
            const b = heart(ev.allyUid);
            if (a && b) line(skySvg, a, b, 'sky-line live', prevOut ? elColor(prevOut) : color);
          } else if (prevCaster) {
            for (const l of skySvg.querySelectorAll('.live')) l.classList.add('faded');
          }
          const sp = spellById(ev.spellId);
          showCallout(
            h(
              'div',
              { class: 'cast-callout', style: { '--el': color } },
              spellCard(sp, { element: unit.element, size: 'mini' }),
              h('div', { class: 'cast-text' }, h('b', {}, sp.name), h('span', {}, ev.linked ? `체인 ${ev.chain} · ×${ev.mult}` : ev.sealed ? '성식으로 링크 끊김' : prevCaster ? '링크 끊김' : '체인 1')),
            ),
            ev.linked ? 'linked' : '',
          );
          await wait(380);
          for (const t of castTargets(events, k)) bolt(ev.allyUid, t, color);
          await wait(300);
          f?.classList.remove('casting');
          prevCaster = ev.allyUid;
          prevOut = ev.outElement;
          break;
        }
        case 'reaction': {
          const r = reactionById(ev.reactionId);
          showCallout(
            h('div', { class: 'banner reaction-banner', style: { '--from': elColor(r.from), '--to': elColor(r.to) } }, h('small', {}, '성좌 반응'), h('b', {}, r.name), h('span', {}, r.desc)),
            'reaction',
          );
          await wait(850);
          break;
        }
        case 'fullChain':
          scene.classList.add('complete');
          showCallout(h('div', { class: 'banner complete-banner' }, h('small', {}, '체인 4'), h('b', {}, '성좌 완성')), 'complete');
          await wait(1150);
          break;
        case 'damage': {
          const f = fighters.get(ev.targetUid);
          if (f) {
            const unit = [...battle.allies, ...battle.enemies].find((u) => u.uid === ev.targetUid)!;
            updateHpBar(f, ev.hpAfter, unit.maxHp, ev.shieldAfter);
            f.classList.remove('hit');
            void f.offsetWidth;
            f.classList.add('hit');
          }
          burst(ev.targetUid, ev.source === 'enemy' ? 'slash' : ev.source === 'burn' ? 'ember' : 'impact');
          floatText(ev.targetUid, ev.amount > 0 ? `${ev.amount}` : `⛨${ev.absorbed}`, ev.source === 'enemy' ? 'dmg-ally' : ev.source === 'burn' ? 'dmg-burn' : ev.source === 'chain' ? 'dmg-chain' : 'dmg');
          await wait(180);
          break;
        }
        case 'heal': {
          const f = fighters.get(ev.targetUid);
          const unit = battle.allies.find((u) => u.uid === ev.targetUid);
          if (f && unit) updateHpBar(f, ev.hpAfter, unit.maxHp, unit.shield);
          burst(ev.targetUid, 'heal');
          floatText(ev.targetUid, `+${ev.amount}`, 'heal');
          await wait(140);
          break;
        }
        case 'shield': {
          const f = fighters.get(ev.targetUid);
          const unit = [...battle.allies, ...battle.enemies].find((u) => u.uid === ev.targetUid);
          if (f && unit) updateHpBar(f, Number(f.querySelector('.hp-num')?.textContent ?? unit.hp), unit.maxHp, ev.shieldAfter);
          burst(ev.targetUid, 'ward');
          floatText(ev.targetUid, `⛨ ${ev.amount}`, 'shield');
          await wait(130);
          break;
        }
        case 'status':
          floatText(ev.targetUid, STATUS_META[ev.status].name, STATUS_META[ev.status].debuff ? 'debuff' : 'buff');
          await wait(120);
          break;
        case 'purge':
          floatText(ev.targetUid, '정화', 'buff');
          await wait(120);
          break;
        case 'stardust': {
          const f = h('span', { class: 'float stardust-gain' }, `+${ev.amount} ✦`);
          meter.append(f);
          setTimeout(() => f.remove(), 1300);
          await wait(160);
          break;
        }
        case 'skip':
          floatText(ev.allyUid, ev.reason === 'cost' ? '성진 부족' : '시전 불가', 'debuff');
          await wait(260);
          break;
        case 'enemyAct':
        case 'enemyStunned': {
          if (!enemyPhase) {
            enemyPhase = true;
            for (const l of skySvg.querySelectorAll('.live')) l.classList.add('faded');
            queueEl.querySelectorAll('.q-slot').forEach((q) => q.classList.add('spent'));
            scene.classList.remove('complete');
            showCallout(h('div', { class: 'banner phase-banner' }, h('b', {}, '적의 차례')), 'enemy');
            await wait(650);
            clearCallout();
          }
          const f = fighters.get(ev.enemyUid);
          if (ev.type === 'enemyStunned') {
            floatText(ev.enemyUid, '기절', 'debuff');
            await wait(380);
            break;
          }
          f?.classList.add('acting');
          await wait(420);
          f?.classList.remove('acting');
          break;
        }
        case 'death':
          fighters.get(ev.uid)?.classList.add('dying');
          await wait(420);
          break;
        case 'seal':
          showCallout(h('div', { class: 'banner phase-banner' }, h('small', {}, '성식'), h('b', {}, `${ELEMENTS[ev.element].name} 봉인`)), 'enemy');
          await wait(750);
          break;
        case 'round':
        case 'outcome':
          break;
      }
    }
    await wait(250);
  }

  async function execute() {
    if (busy) return;
    busy = true;
    const toRun = plan;
    render();
    root.classList.add('busy');
    for (const n of skySvg.querySelectorAll('.preview')) n.remove();
    const events = executeRound(battle, toRun);
    plan = [];
    await play(events);
    app.save();
    busy = false;
    root.classList.remove('busy');
    if (battle.outcome === 'ongoing') render();
    else showOutcome();
  }

  function showOutcome() {
    const won = battle.outcome === 'victory';
    render();
    const proceed = () => {
      finishBattle(run);
      app.save();
      app.go(run.phase === 'reward' ? 'reward' : 'result');
    };
    root.append(
      h(
        'div',
        { class: `outcome-overlay ${won ? 'won' : 'lost'}` },
        h(
          'div',
          { class: 'outcome-card panel' },
          h('p', { class: 'eyebrow' }, won ? '승리' : '패배'),
          h('h2', {}, won ? '성역을 지켜냈다' : '모든 술사가 쓰러졌다'),
          h('p', { class: 'muted' }, `최대 체인 ${battle.stats.maxChain} · 성좌 반응 ${battle.stats.reactions} · ${battle.round} 라운드`),
          button(won ? '계속' : '결과 보기', proceed, { variant: 'primary' }),
        ),
      ),
    );
    requestAnimationFrame(() => root.querySelector<HTMLButtonElement>('.outcome-card .btn')?.focus());
  }

  if (battle.outcome !== 'ongoing') showOutcome();
  else render();
  return root;
}
