import * as THREE from 'three';
import { executeRound, getFocus, isAlive, planCost, setFocus } from '../../core/battle';
import { previewChain } from '../../core/link';
import { finishBattle } from '../../core/run';
import type { Ally, BattleEvent, BattleState, Element, Enemy, PlannedCast, SkillTag } from '../../core/types';
import { ELEMENTS, STATUS_META, reactionById } from '../../data/elements';
import { FLOORS } from '../../data/encounters';
import { TRAIT_DESC, enemyById } from '../../data/enemies';
import { spellById } from '../../data/spells';
import { unitById } from '../../data/units';
import { floorPreset } from '../../render/three/environment';
import { getStage } from '../../render/three/stage';
import type { App } from '../app';
import { h, sleep } from '../dom';
import { showHelp } from '../help';
import { NUM, allyName, button, elBadge, elColor, hpBar, intentView, modal, reactionChip, spellCard, statusRow, updateHpBar } from '../widgets';

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
    case 'damage': {
      const tag = { burn: ' [연소]', doom: ' [폭격]', counter: ' [반격]', chain: ' [성좌]', ally: '', enemy: '' }[ev.source];
      return `${unitLabel(state, ev.targetUid)} 피해 ${ev.amount}${ev.absorbed ? ` (보호막 ${ev.absorbed})` : ''}${tag}`;
    }
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
  const stage = getStage();
  let plan: PlannedCast[] = [];
  let busy = false;
  const log: string[] = [`— ${battle.round} 라운드 —`];

  const root = h('main', { class: 'battle-wrap' });
  const scene = h('section', { class: `scene floor-${floor.kind}`, 'aria-label': '전장' });
  const actorLayer = h('div', { class: 'actor-layer' });
  const callout = h('div', { class: 'callout-layer', 'aria-live': 'polite' });
  const hudSlot = h('div', { class: 'hud-slot' });
  const handSlot = h('div', { class: 'hand-slot' });
  scene.append(actorLayer, hudSlot, callout);
  root.append(scene, handSlot);

  const actorEls = new Map<string, HTMLElement>();
  let previewArcs: THREE.Mesh[] = [];
  let queueEl: HTMLElement;
  let meter: HTMLElement;

  const wait = (ms: number) => sleep(ms / app.speed);
  const remaining = () => battle.stardust - planCost(plan);

  // ── 무대 준비 ────────────────────────────────────────────
  stage.mount(scene, 'battle');
  stage.setScene(floorPreset(run.floor));
  stage.setActors([
    ...battle.allies.map((a) => ({ uid: a.uid, side: 'ally' as const, defId: a.defId, dead: !isAlive(a) })),
    ...battle.enemies.map((e) => ({ uid: e.uid, side: 'enemy' as const, defId: e.defId, dead: !isAlive(e), boss: !!enemyById(e.defId).traits?.length })),
  ]);

  // 이름표·예고·순서·피해 숫자 같은 DOM 오버레이를 매 프레임 액터 위치에 맞춘다.
  const off = stage.onFrame(() => {
    if (!root.isConnected) {
      off();
      return;
    }
    for (const [uid, el] of actorEls) {
      const box = stage.actorBox(uid);
      if (!box) continue;
      el.style.transform = `translate(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px)`;
      el.style.width = `${box.width.toFixed(1)}px`;
      el.style.height = `${box.height.toFixed(1)}px`;
    }
  });

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

  const clearPreview = () => {
    for (const m of previewArcs) stage.fx?.removeMesh(m);
    previewArcs = [];
  };

  const drawPreview = () => {
    clearPreview();
    if (!stage.fx) return;
    const steps = previewChain(plan.map((p) => spellById(p.spellId)), battle.seal);
    plan.forEach((p, i) => {
      if (i === 0 || !steps[i].linked) return;
      const prevOut = steps[i - 1].outElement;
      previewArcs.push(stage.fx!.arc(stage.actorPos(plan[i - 1].allyUid), stage.actorPos(p.allyUid), prevOut ? elColor(prevOut) : '#ffffff', true));
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

  const allyActor = (a: Ally, i: number) => {
    const unit = unitById(a.defId);
    const planIdx = plan.findIndex((p) => p.allyUid === a.uid);
    const el = h(
      'div',
      { class: `actor ally ${isAlive(a) ? '' : 'dead'} ${planIdx >= 0 ? 'queued' : ''}`, style: { '--el': elColor(unit.element) } },
      h(
        'div',
        { class: 'actor-top' },
        planIdx >= 0 ? h('span', { class: 'order-tag' }, NUM[planIdx]) : null,
        isAlive(a) && threatCount(a) ? h('span', { class: 'threat-tag', title: '이번 턴 공격받을 예정' }, '!') : null,
      ),
      h(
        'div',
        { class: 'plate' },
        h('div', { class: 'plate-name' }, h('span', { class: 'plate-num' }, NUM[i]), h('span', { class: 'plate-text' }, unit.name)),
        hpBar(a.hp, a.maxHp, a.shield),
        statusRow(a.statuses),
      ),
    );
    actorEls.set(a.uid, el);
    return el;
  };

  const enemyActor = (e: Enemy, focusUid: string | null) => {
    const def = enemyById(e.defId);
    const alive = isAlive(e);
    const boss = !!def.traits?.length;
    const focused = focusUid === e.uid && alive;
    const el = h(
      'button',
      {
        type: 'button',
        class: `actor enemy ${alive ? '' : 'dead'} ${focused ? 'focused' : ''} ${boss ? 'boss' : ''}`,
        disabled: !alive,
        title: alive ? `${def.name} — 눌러서 집중 대상으로 지정` : def.name,
        onclick: () => {
          if (busy) return;
          setFocus(battle, e.uid);
          render();
        },
      },
      h('div', { class: 'actor-top' }, alive ? intentView(e.intent, e, battle.allies) : null),
      focused ? h('span', { class: 'target-bracket', 'aria-label': '집중 대상' }, h('i'), h('i'), h('i'), h('i')) : null,
      h(
        'div',
        { class: 'plate' },
        h('div', { class: 'plate-name' }, focused ? h('span', { class: 'plate-target' }, 'TARGET') : null, h('span', { class: 'plate-text' }, def.name)),
        hpBar(e.hp, e.maxHp, e.shield),
        statusRow(e.statuses),
        boss ? def.traits!.map((t) => h('p', { class: 'trait' }, TRAIT_DESC[t])) : null,
      ),
    );
    actorEls.set(e.uid, el);
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
                h('span', { class: 'q-link-mark' }, p ? (steps[i].linked ? `×${steps[i].mult}` : steps[i].sealed ? '봉인' : '끊김') : ''),
              );
        if (!p) return [connector, h('div', { class: 'q-slot empty' }, h('span', {}, NUM[i]))];
        const ally = battle.allies.find((a) => a.uid === p.allyUid)!;
        const unit = unitById(ally.defId);
        return [
          connector,
          h(
            'div',
            { class: 'q-slot' },
            spellCard(spellById(p.spellId), { element: unit.element, owner: unit.name, size: 'mini' }),
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
      { class: 'hand', 'aria-label': '이번 라운드 스킬' },
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
            h('div', { class: 'hand-owner' }, h('span', { class: 'plate-num' }, NUM[i]), h('b', {}, unit.name), h('span', { class: 'hand-code' }, unit.code)),
            h(
              'div',
              { class: 'hand-pair' },
              alive
                ? (battle.hands[a.uid] ?? []).map((id) => {
                    const sp = spellById(id);
                    const chosen = planIdx >= 0 && plan[planIdx].spellId === id;
                    return spellCard(sp, {
                      element: unit.element,
                      chosen,
                      order: chosen ? planIdx : undefined,
                      disabled: busy || (!chosen && sp.cost > remaining() + myCost),
                      onClick: () => pickSpell(a, id),
                    });
                  })
                : h('div', { class: 'hand-down' }, '전투 불능'),
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
          h('span', { class: 'chain-label' }, 'CHAIN'),
          h('b', { class: last?.chain === 4 ? 'full' : '' }, plan.length ? last.chain : 0),
          h('small', {}, last?.chain === 4 ? '성좌 완성' : plan.length ? `배율 ×${last.mult}` : '대기하면 성진만 모입니다'),
        ),
        h('button', { type: 'button', class: 'cast-btn', disabled: busy, onclick: () => void execute() }, h('b', {}, plan.length ? '시전' : '대기'), h('small', {}, plan.length ? 'EXECUTE' : 'PASS')),
        button('초기화', () => {
          plan = [];
          render();
        }, { class: 'btn-sm btn-reset', disabled: busy || plan.length === 0 }),
      ),
    );
  };

  const showLog = () => modal('전투 기록', h('ol', { class: 'log-list' }, log.slice(-60).reverse().map((l) => h('li', {}, l))), () => {});

  function render() {
    actorEls.clear();
    const focus = getFocus(battle);
    meter = stardustMeter();
    queueEl = queueView();
    actorLayer.replaceChildren(...battle.allies.map(allyActor), ...battle.enemies.map((e) => enemyActor(e, focus?.uid ?? null)));
    hudSlot.replaceChildren(
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
          h('div', { class: 'plaque' }, h('span', { class: 'plaque-sub' }, `${run.floor + 1}-${battle.round} · ${floor.name}`), h('b', {}, `ROUND ${battle.round}`)),
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
          button('LOG', showLog, { class: 'btn-hud', title: '전투 기록' }),
          button('?', () => showHelp(), { class: 'btn-hud', title: '플레이 방법' }),
        ),
      ),
      ...(battle.seal ? [h('div', { class: 'seal-banner' }, '⊘ 성식 — ', elBadge(battle.seal, 'sm'), ` ${ELEMENTS[battle.seal].name}(으)로 가는 링크가 끊깁니다`)] : []),
    );
    handSlot.replaceChildren(handView());
    drawPreview();
  }

  // ── 연출 ────────────────────────────────────────────────
  const floatText = (uid: string, text: string, kind: string) => {
    const el = actorEls.get(uid);
    if (!el) return;
    const n = h('span', { class: `float ${kind}` }, text);
    n.style.setProperty('--x', `${Math.round(Math.random() * 50 - 25)}px`);
    el.append(n);
    setTimeout(() => n.remove(), 1500);
  };

  const showCallout = (content: Node, kind = '') => callout.replaceChildren(h('div', { class: `callout ${kind}` }, content));
  const clearCallout = () => callout.replaceChildren();
  const chest = (uid: string) => stage.actorPos(uid, 'chest');
  const feet = (uid: string) => stage.actorPos(uid, 'feet');

  /** cast 이벤트 뒤에 이어지는, 이 시전이 만든 피해 대상(연타는 중복 포함) */
  const castTargets = (events: BattleEvent[], from: number): string[] => {
    const out: string[] = [];
    for (let i = from + 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'cast' || ev.type === 'enemyAct' || ev.type === 'enemyStunned' || ev.type === 'fullChain' || ev.type === 'reaction') break;
      if (ev.type === 'damage' && ev.source === 'ally') out.push(ev.targetUid);
    }
    return out;
  };

  /** 이벤트 시점의 집중 대상: 이후 처음 영향을 받는 적 */
  const focusAt = (events: BattleEvent[], from: number): string | null => {
    for (let i = from + 1; i < events.length; i++) {
      const ev = events[i];
      if ((ev.type === 'damage' || ev.type === 'status' || ev.type === 'purge') && ev.targetUid.startsWith('e')) return ev.targetUid;
      if (ev.type === 'cast' || ev.type === 'enemyAct') break;
    }
    return getFocus(battle)?.uid ?? null;
  };

  const enemyCenter = () => {
    const living = battle.enemies.filter((e) => !actorEls.get(e.uid)?.classList.contains('dying'));
    const pts = (living.length ? living : battle.enemies).map((e) => chest(e.uid));
    return pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
  };

  /** 스킬 유형별 시전 연출. 피해 자체는 damage 이벤트에서 터진다. */
  const castFx = (tag: SkillTag, caster: string, targets: string[], color: string, focusUid: string | null) => {
    const fx = stage.fx;
    if (!fx) return;
    const from = chest(caster);
    const uniq = [...new Set(targets)];
    switch (tag) {
      case 'strike':
      case 'execute':
      case 'dot':
      case 'debuff':
      case 'drain':
        uniq.forEach((t) => fx.projectile(from, chest(t), color));
        break;
      case 'multi':
        targets.forEach((t, i) => fx.projectile(from, chest(t), color, 0.22, 0.3 + (i % 2) * 0.6, i * 0.09));
        break;
      case 'aoe':
        fx.sweep(enemyCenter(), color, 6.5);
        break;
      case 'pierce':
        if (uniq[0]) fx.beam(from, chest(uniq[0]), color);
        break;
      case 'delayed':
        if (focusUid) fx.mark(stage.actorPos(focusUid, 'top'), color);
        fx.flare(from, color, 1.6, 0.4);
        break;
      case 'heal':
      case 'shield':
      case 'buff':
        fx.flare(from, color, 1.4, 0.35);
        break;
      case 'utility':
        fx.motes(from, color);
        break;
    }
  };

  async function play(events: BattleEvent[]) {
    let prevCaster: string | null = null;
    let prevOut: Element | null = null;
    let enemyPhase = false;
    let castIdx = -1;
    let lastTag: SkillTag = 'strike';
    let lastColor = '#ffffff';
    let lastCaster = '';
    let lastTargets: string[] = [];
    for (let k = 0; k < events.length; k++) {
      const ev = events[k];
      const text = eventText(battle, ev);
      if (text) log.push(text);
      switch (ev.type) {
        case 'cast': {
          castIdx++;
          const unit = unitById(battle.allies.find((a) => a.uid === ev.allyUid)!.defId);
          const color = elColor(unit.element);
          const sp = spellById(ev.spellId);
          lastTag = sp.tag;
          lastColor = color;
          lastCaster = ev.allyUid;
          lastTargets = castTargets(events, k);
          queueEl.querySelectorAll('.q-slot').forEach((q, i) => {
            q.classList.toggle('active', i === castIdx);
            if (i < castIdx) q.classList.add('spent');
          });
          stage.anim(ev.allyUid, 'cast');
          stage.fx?.magicCircle(feet(ev.allyUid), color, 2.2, 0.9, 'magic_01');
          if (ev.linked && prevCaster) stage.fx?.arc(chest(prevCaster), chest(ev.allyUid), prevOut ? elColor(prevOut) : color);
          showCallout(
            h(
              'div',
              { class: 'cast-callout', style: { '--el': color } },
              h('span', { class: 'cc-owner' }, `${unit.code} · ${unit.name}`),
              h('b', {}, sp.name),
              h('span', { class: 'cc-chain' }, ev.linked ? `LINK ${ev.chain} · ×${ev.mult}` : ev.sealed ? '성식 — 링크 끊김' : prevCaster ? 'LINK BROKEN' : `CHAIN 1${ev.mult !== 1 ? ` · ×${ev.mult}` : ''}`),
            ),
            ev.linked ? 'linked' : '',
          );
          await wait(260);
          castFx(sp.tag, ev.allyUid, lastTargets, color, focusAt(events, k));
          await wait(300);
          prevCaster = ev.allyUid;
          prevOut = ev.outElement;
          break;
        }
        case 'reaction': {
          const r = reactionById(ev.reactionId);
          const target = focusAt(events, k);
          const at = target ? chest(target) : enemyCenter();
          stage.fx?.nova(at, elColor(r.from), elColor(r.to), 0.8);
          stage.flashScreen(0.15);
          stage.punch(at, 0.7);
          showCallout(h('div', { class: 'banner reaction-banner', style: { '--from': elColor(r.from), '--to': elColor(r.to) } }, h('small', {}, `REACTION · ${r.en}`), h('b', {}, r.name), h('span', {}, r.desc)), 'reaction');
          await wait(780);
          break;
        }
        case 'fullChain': {
          stage.fx?.goldArcs();
          const c = enemyCenter();
          stage.fx?.magicCircle(new THREE.Vector3(-3.6, 0, 0.1), '#ffd27a', 8, 1.6, 'magic_02');
          stage.fx?.nova(c, '#ffd27a', '#ffffff', 1.05);
          stage.flashScreen(0.3);
          stage.shake(0.35);
          stage.punch(c, 1);
          showCallout(h('div', { class: 'banner complete-banner' }, h('small', {}, 'CONSTELLATION COMPLETE'), h('b', {}, '성좌 완성')), 'complete');
          await wait(1050);
          break;
        }
        case 'damage': {
          const el = actorEls.get(ev.targetUid);
          const unit = [...battle.allies, ...battle.enemies].find((u) => u.uid === ev.targetUid)!;
          if (el) updateHpBar(el, ev.hpAfter, unit.maxHp, ev.shieldAfter);
          stage.anim(ev.targetUid, 'hit');
          const fx = stage.fx;
          const p = chest(ev.targetUid);
          if (fx) {
            if (ev.source === 'enemy') {
              fx.slash(p, '#ff5a4a', 2.2);
              stage.shake(0.18);
            } else if (ev.source === 'burn') fx.burn(p, '#ff8a3a');
            else if (ev.source === 'doom') {
              fx.meteor(feet(ev.targetUid).add(new THREE.Vector3(0, 0.8, 0)), elColor('comet'));
              stage.shake(0.5);
              stage.flashScreen(0.15);
            } else if (ev.source === 'chain') fx.impact(p, '#ffd27a', 1.2);
            else if (ev.source === 'counter') fx.slash(p, elColor('star'), 2);
            else if (lastTag === 'execute') {
              fx.slash(p, lastColor, 3);
              fx.impact(p, lastColor, 1.1);
            } else if (lastTag === 'dot') {
              fx.impact(p, lastColor, 0.8);
              fx.burn(p, lastColor);
            } else fx.impact(p, lastColor, lastTag === 'multi' ? 0.7 : lastTag === 'aoe' ? 0.9 : 1);
          }
          const big = ev.source === 'chain' || ev.source === 'doom' || lastTag === 'execute';
          floatText(ev.targetUid, ev.amount > 0 ? `${ev.amount}` : `⛨${ev.absorbed}`, ev.source === 'enemy' ? 'dmg-ally' : ev.source === 'burn' ? 'dmg-burn' : big ? 'dmg-big' : 'dmg');
          await wait(lastTag === 'multi' ? 120 : 170);
          break;
        }
        case 'heal': {
          const el = actorEls.get(ev.targetUid);
          const unit = battle.allies.find((u) => u.uid === ev.targetUid);
          if (el && unit) updateHpBar(el, ev.hpAfter, unit.maxHp, unit.shield);
          if (lastTag === 'drain' && ev.targetUid === lastCaster) {
            if (lastTargets[0]) stage.fx?.drainReturn(chest(lastTargets[0]), chest(ev.targetUid), lastColor);
          }
          stage.fx?.heal(chest(ev.targetUid), feet(ev.targetUid), '#8fe0a5');
          floatText(ev.targetUid, `+${ev.amount}`, 'heal');
          await wait(130);
          break;
        }
        case 'shield': {
          const el = actorEls.get(ev.targetUid);
          const unit = [...battle.allies, ...battle.enemies].find((u) => u.uid === ev.targetUid);
          if (el && unit) updateHpBar(el, Number(el.querySelector('.hp-num')?.textContent ?? unit.hp), unit.maxHp, ev.shieldAfter);
          stage.fx?.shield(chest(ev.targetUid), ev.targetUid.startsWith('e') ? '#e0685a' : '#8ec5e0');
          floatText(ev.targetUid, `⛨ ${ev.amount}`, 'shield');
          await wait(120);
          break;
        }
        case 'status': {
          const meta = STATUS_META[ev.status];
          const isEnemy = ev.targetUid.startsWith('e');
          if (isEnemy && meta.debuff && ev.status !== 'doom') stage.fx?.debuff(chest(ev.targetUid), lastColor);
          if (!isEnemy && (ev.status === 'atkUp' || ev.status === 'counter' || ev.status === 'taunt')) stage.fx?.buff(chest(ev.targetUid), feet(ev.targetUid), lastColor);
          floatText(ev.targetUid, meta.name, meta.debuff ? 'debuff' : 'buff');
          await wait(110);
          break;
        }
        case 'purge':
          floatText(ev.targetUid, '정화', 'buff');
          stage.fx?.ring(feet(ev.targetUid), '#ffffff', 0.5, 3, 0.5);
          await wait(110);
          break;
        case 'stardust': {
          const f = h('span', { class: 'float stardust-gain' }, `+${ev.amount}`);
          meter.append(f);
          setTimeout(() => f.remove(), 1300);
          await wait(140);
          break;
        }
        case 'skip':
          floatText(ev.allyUid, ev.reason === 'cost' ? '성진 부족' : '시전 불가', 'debuff');
          await wait(240);
          break;
        case 'enemyAct':
        case 'enemyStunned': {
          if (!enemyPhase) {
            enemyPhase = true;
            stage.fx?.fadeArcs();
            queueEl.querySelectorAll('.q-slot').forEach((q) => q.classList.add('spent'));
            showCallout(h('div', { class: 'banner phase-banner' }, h('small', {}, 'ENEMY PHASE'), h('b', {}, '적의 차례')), 'enemy');
            await wait(600);
            clearCallout();
          }
          if (ev.type === 'enemyStunned') {
            floatText(ev.enemyUid, '기절', 'debuff');
            await wait(360);
            break;
          }
          stage.anim(ev.enemyUid, 'act');
          await wait(260);
          break;
        }
        case 'death':
          stage.fx?.death(chest(ev.uid), ev.uid.startsWith('e') ? '#e0685a' : '#ffffff');
          stage.anim(ev.uid, 'die');
          actorEls.get(ev.uid)?.classList.add('dying');
          await wait(380);
          break;
        case 'seal':
          stage.lightning();
          showCallout(h('div', { class: 'banner phase-banner' }, h('small', {}, 'OCCULTATION'), h('b', {}, `성식 — ${ELEMENTS[ev.element].name} 봉인`)), 'enemy');
          await wait(720);
          break;
        case 'round':
        case 'outcome':
          break;
      }
    }
    stage.fx?.fadeArcs();
    await wait(250);
  }

  async function execute() {
    if (busy) return;
    busy = true;
    const toRun = plan;
    root.classList.add('busy');
    render();
    clearPreview();
    const events = executeRound(battle, toRun);
    plan = [];
    await play(events);
    app.save();
    busy = false;
    root.classList.remove('busy');
    clearCallout();
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
          h('p', { class: 'eyebrow' }, won ? 'MISSION COMPLETE' : 'MISSION FAILED'),
          h('h2', {}, won ? '성역 확보' : '작전 실패'),
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
