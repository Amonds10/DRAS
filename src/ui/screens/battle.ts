import * as THREE from 'three';
import { sound } from '../../audio/sound';
import { MAX_ATTUNE, cloneBattle, currentPattern, executeRound, getFocus, isAlive, planCost, setFocus, statusStacks } from '../../core/battle';
import { previewChain } from '../../core/link';
import { finishBattle } from '../../core/run';
import type { Ally, BattleEvent, BattleState, Element, Enemy, PlannedCast, SkillTag, Stack, Status } from '../../core/types';
import { ELEMENTS, STATUS_META, reactionById } from '../../data/elements';
import { FLOORS } from '../../data/encounters';
import { TRAIT_DESC, enemyById, moveText } from '../../data/enemies';
import { TAG_EN, TAG_NAMES, spellById } from '../../data/spells';
import { ROLE_NAMES, unitById } from '../../data/units';
import { characterBust, characterSvg } from '../../render/characters';
import { characterMotion } from '../../render/rig';
import { floorPreset } from '../../render/three/environment';
import { getStage } from '../../render/three/stage';
import type { App } from '../app';
import { h, sleep } from '../dom';
import { glyph } from '../glyphs';
import { cycleGraphics, graphicsLabel } from '../graphics';
import { showHelp } from '../help';
import { NUM, allyName, button, elBadge, elColor, highlight, hpBar, intentView, modal, spellFlow, statusRow, updateHpBar } from '../widgets';

/*
 * 전투 화면 v4: 라운드 계획 + 링크.
 * - 아래: 술사마다 이번 라운드 손패 2장(장착한 5장 중에서 뽑음). 카드마다 지금 계획 뒤에 붙였을 때의 링크 예고가 붙는다.
 * - 위 가운데: 체인 트랙. 앞 스킬이 넘긴 성속을 다음 스킬이 받으면 링크, 특정 조합이면 성좌 반응.
 * - 체력·상태는 캐릭터 발밑에. 캐릭터를 누르면 강조되고 오른쪽에 상세 정보가 뜬다.
 */

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
      const tag = { burn: ' [화상]', erosion: ' [잠식]', burst: ' [각인 폭발]', doom: ' [폭격]', counter: ' [반격]', chain: ' [성좌]', ally: '', enemy: '' }[ev.source];
      return `${unitLabel(state, ev.targetUid)} 피해 ${ev.amount}${ev.absorbed ? ` (보호막 ${ev.absorbed})` : ''}${tag}`;
    }
    case 'heal':
      return `${unitLabel(state, ev.targetUid)} 회복 ${ev.amount}`;
    case 'enemyStunned':
      return `${unitLabel(state, ev.enemyUid)}은(는) 기절해 움직이지 못한다`;
    case 'enemyAct':
      return `${unitLabel(state, ev.enemyUid)}: 「${ev.intent.name}」${ev.intent.targetId ? ` → ${unitLabel(state, ev.intent.targetId)}` : ''}`;
    case 'phase':
      return `${unitLabel(state, ev.enemyUid)}의 2단계 「${ev.name}」: 패턴이 바뀌고 공격이 오른다`;
    case 'shatter':
      return `${unitLabel(state, ev.targetUid)}의 보호막이 부서졌다`;
    case 'resist':
      return `${unitLabel(state, ev.targetUid)}은(는) 버팀 중이라 기절하지 않았다`;
    case 'steal':
      return `${unitLabel(state, ev.enemyUid)}이(가) 성진 ${ev.amount}을(를) 빼앗았다`;
    case 'status':
      return state.allies.some((a) => a.uid === ev.targetUid) && STATUS_META[ev.status].debuff ? `${unitLabel(state, ev.targetUid)}: ${STATUS_META[ev.status].name}` : null;
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

const SUPPORT_TAGS = new Set<SkillTag>(['heal', 'shield', 'buff', 'utility', 'charge']);
const STACKS: Stack[] = ['solarCore', 'aim', 'tide', 'hunger', 'fortitude', 'wave'];

type Hint = { kind: 'link' | 'reaction' | 'break' | 'start'; text: string };

export function battleScreen(app: App): HTMLElement {
  const run = app.run!;
  const battle = run.battle!;
  const floor = FLOORS[run.floor];
  const stage = getStage();
  let plan: PlannedCast[] = [];
  let busy = false;
  const log: string[] = [`— ${battle.round} 라운드 —`];
  /** 상세 정보를 보는 유닛 */
  let inspect: string | null = null;

  const root = h('main', { class: 'battle-wrap bx v5' });
  const scene = h('section', { class: `scene floor-${floor.kind}`, 'aria-label': '전장' });
  const actorLayer = h('div', { class: 'actor-layer' });
  const callout = h('div', { class: 'callout-layer', 'aria-live': 'polite' });
  const hudSlot = h('div', { class: 'hud-slot' });
  const infoSlot = h('div', { class: 'bx-info-slot' });
  const plateSlot = h('div', { class: 'plate-slot', 'aria-live': 'polite' });
  const hitSlot = h('div', { class: 'hit-slot' });
  const dockSlot = h('div', { class: 'dock5-slot' });
  scene.append(actorLayer, hudSlot, plateSlot, hitSlot, callout, infoSlot);
  root.append(scene, dockSlot);

  const actorEls = new Map<string, HTMLElement>();
  let previewArcs: THREE.Mesh[] = [];
  const wait = (ms: number) => sleep(ms / app.speed);
  const remaining = () => battle.stardust - planCost(plan);
  const stackOf = (a: Ally) => unitById(a.defId).stack ?? null;
  const allyOf = (uid: string) => battle.allies.find((a) => a.uid === uid);
  const enemyOf = (uid: string) => battle.enemies.find((e) => e.uid === uid);

  // ── 무대 ────────────────────────────────────────────────
  stage.mount(scene, 'battle');
  stage.setScene(floorPreset(run.floor));
  stage.setActors([
    ...battle.allies.map((a) => ({ uid: a.uid, side: 'ally' as const, defId: a.defId, dead: !isAlive(a) })),
    ...battle.enemies.map((e) => ({ uid: e.uid, side: 'enemy' as const, defId: e.defId, dead: !isAlive(e), boss: !!enemyById(e.defId).traits?.length })),
  ]);
  const fitSafeArea = () => stage.setSafeArea(window.matchMedia('(max-width: 760px)').matches ? 380 : 340);
  fitSafeArea();
  const resizeObs = new ResizeObserver(fitSafeArea);
  resizeObs.observe(root);
  const off = stage.onFrame(() => {
    if (!root.isConnected) {
      off();
      resizeObs.disconnect();
      return;
    }
    for (const [uid, el] of actorEls) {
      const box = stage.actorBox(uid);
      if (!box) continue;
      el.style.transform = `translate(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px)`;
      el.style.width = `${box.width.toFixed(1)}px`;
      el.style.height = `${box.height.toFixed(1)}px`;
      // 가운데에서 좌우로 half만큼 퍼지는 예고·정보판이 화면 밖으로 나가지 않게 민다
      const half = window.innerWidth < 760 ? 62 : 120;
      const cx = box.left + box.width / 2;
      const nudge = Math.min(0, window.innerWidth - 6 - (cx + half)) + Math.max(0, 6 - (cx - half));
      el.style.setProperty('--nudge', `${Math.round(nudge)}px`);
    }
  });
  const syncAuras = () => {
    for (const a of battle.allies) {
      const st = stackOf(a);
      stage.setAura(a.uid, isAlive(a) && st ? statusStacks(a, st.id) : 0, elColor(unitById(a.defId).element), st?.max ?? 6);
    }
    // 2단계에 들어간 적은 붉은 기운을 두른다
    for (const e of battle.enemies) stage.setAura(e.uid, isAlive(e) && e.enraged ? 6 : 0, '#e0685a', 6);
  };

  // ── 계획 ────────────────────────────────────────────────
  const steps = () => previewChain(plan.map((p) => spellById(p.spellId)), battle.seal);

  /** 이 스킬을 지금 계획에 넣으면 어떻게 이어지는지 */
  const linkHint = (allyUid: string, spellId: string): Hint => {
    const idx = plan.findIndex((p) => p.allyUid === allyUid);
    const trial = plan.slice();
    if (idx >= 0) trial[idx] = { allyUid, spellId };
    else trial.push({ allyUid, spellId });
    const at = idx >= 0 ? idx : trial.length - 1;
    const st = previewChain(trial.map((p) => spellById(p.spellId)), battle.seal)[at];
    if (at === 0) return { kind: 'start', text: '체인 시작' };
    if (st.reactionId) return { kind: 'reaction', text: `${reactionById(st.reactionId).name} ×${st.mult}` };
    if (st.linked) return { kind: 'link', text: `LINK ${st.chain} ×${st.mult}` };
    if (spellById(spellId).input === 'none') return { kind: 'start', text: '새 체인' };
    return { kind: 'break', text: st.sealed ? '봉인됨' : '끊김' };
  };

  const pickSpell = (ally: Ally, spellId: string) => {
    if (busy || !isAlive(ally)) return;
    const idx = plan.findIndex((p) => p.allyUid === ally.uid);
    if (idx >= 0 && plan[idx].spellId === spellId) {
      plan.splice(idx, 1);
      sound.ui('card_remove', 0.5);
    } else {
      const sp = spellById(spellId);
      const myCost = idx >= 0 ? spellById(plan[idx].spellId).cost : 0;
      if (sp.cost > remaining() + myCost) return;
      if (idx >= 0) plan[idx] = { allyUid: ally.uid, spellId };
      else plan.push({ allyUid: ally.uid, spellId });
      sound.ui('card_place', 0.55);
      const st = steps()[plan.findIndex((p) => p.allyUid === ally.uid)];
      if (st?.linked) sound.link(st.chain, st.outElement ?? 'star');
    }
    render();
  };

  const clearPreview = () => {
    for (const m of previewArcs) stage.fx?.removeMesh(m);
    previewArcs = [];
  };
  const drawPreview = () => {
    clearPreview();
    if (!stage.fx) return;
    const st = steps();
    plan.forEach((p, i) => {
      if (i === 0 || !st[i].linked) return;
      const prevOut = st[i - 1].outElement;
      previewArcs.push(stage.fx!.arc(stage.actorPos(plan[i - 1].allyUid), stage.actorPos(p.allyUid), prevOut ? elColor(prevOut) : '#ffffff', true));
    });
  };

  /** 지금 계획대로면 각 유닛 HP가 어떻게 되는지(적은 우리 차례 뒤) */
  const forecast = (): Map<string, number> => {
    const out = new Map<string, number>();
    if (!plan.length) return out;
    try {
      const sim = cloneBattle(battle);
      for (const ev of executeRound(sim, plan)) {
        if (ev.type === 'enemyAct') break;
        if (ev.type === 'damage' || ev.type === 'heal') out.set(ev.targetUid, ev.hpAfter);
      }
    } catch {
      // 계획이 유효하지 않으면 예측을 생략한다.
    }
    return out;
  };

  const onUnitClick = (uid: string) => {
    if (busy) return;
    if (uid.startsWith('e')) {
      const e = enemyOf(uid);
      if (e && isAlive(e)) setFocus(battle, uid);
    }
    inspect = inspect === uid ? null : uid;
    sound.ui('ui_toggle', 0.35);
    render();
  };

  // ── 발밑 정보판 ──────────────────────────────────────────
  const threatCount = (a: Ally) =>
    battle.enemies.filter((e) => isAlive(e) && e.intent && (((e.intent.kind === 'attack' || e.intent.kind === 'drain') && e.intent.targetId === a.uid) || e.intent.kind === 'attackAll' || (e.intent.kind === 'steal' && !!e.intent.power))).length;

  const stackPips = (a: Ally) => {
    const st = stackOf(a);
    if (!st) return null;
    const n = statusStacks(a, st.id);
    const meta = STATUS_META[st.id];
    return h(
      'div',
      { class: `bx-stack ${n >= Math.ceil(st.max / 2) ? 'ready' : ''}`, title: `${meta.name} ${n}/${st.max} — ${meta.desc}` },
      h('span', {}, `${meta.glyph} ${meta.name}`),
      h('span', { class: 'bx-pips' }, Array.from({ length: st.max }, (_, i) => h('i', { class: i < n ? 'on' : '' }))),
    );
  };

  const allyActor = (a: Ally, i: number) => {
    const unit = unitById(a.defId);
    const alive = isAlive(a);
    const order = plan.findIndex((p) => p.allyUid === a.uid);
    const el = h(
      'button',
      {
        type: 'button',
        class: `actor ally bx-unit bx-i${i % 2} ${alive ? '' : 'dead'} ${order >= 0 ? 'queued' : ''} ${inspect === a.uid ? 'inspected' : ''}`,
        style: { '--el': elColor(unit.element) },
        disabled: !alive,
        'aria-label': `${unit.name} 상세 보기`,
        onclick: () => onUnitClick(a.uid),
      },
      h(
        'div',
        { class: 'actor-top' },
        order >= 0 ? h('span', { class: 'order-tag' }, NUM[order]) : null,
        alive && threatCount(a) ? h('span', { class: 'threat-tag', title: '적이 노리고 있다' }, '!') : null,
      ),
      h(
        'div',
        { class: 'bx-foot' },
        h('div', { class: 'bx-name' }, h('b', {}, unit.name), elBadge(unit.element, 'sm')),
        hpBar(a.hp, a.maxHp, a.shield),
        alive ? stackPips(a) : null,
        alive && a.statuses.some((s) => !STACKS.includes(s.id as Stack) || s.id === 'wave') ? statusRow(a.statuses.filter((s) => !STACKS.includes(s.id as Stack) || s.id === 'wave')) : null,
      ),
    );
    actorEls.set(a.uid, el);
    return el;
  };

  const enemyActor = (e: Enemy, fc: Map<string, number>) => {
    const def = enemyById(e.defId);
    const alive = isAlive(e);
    const focused = alive && getFocus(battle)?.uid === e.uid;
    const el = h(
      'button',
      {
        type: 'button',
        class: `actor enemy bx-unit bx-i${battle.enemies.indexOf(e) % 2} ${alive ? '' : 'dead'} ${focused ? 'focused' : ''} ${inspect === e.uid ? 'inspected' : ''} ${def.traits?.length ? 'boss' : ''}`,
        disabled: !alive,
        'aria-label': `${def.name} — 눌러서 집중 대상 지정·상세 보기`,
        onclick: () => onUnitClick(e.uid),
      },
      h('div', { class: 'actor-top' }, alive ? intentView(e.intent, e, battle.allies) : null),
      focused ? h('span', { class: 'target-bracket', 'aria-label': '집중 대상' }, h('i'), h('i'), h('i'), h('i')) : null,
      h(
        'div',
        { class: 'bx-foot' },
        h('div', { class: 'bx-name' }, focused ? h('span', { class: 'plate-target' }, 'TARGET') : null, h('b', {}, def.name)),
        hpBar(e.hp, e.maxHp, e.shield, alive ? fc.get(e.uid) : undefined),
        alive && e.statuses.length ? statusRow(e.statuses) : null,
      ),
    );
    actorEls.set(e.uid, el);
    return el;
  };

  // ── 체인 트랙(위 가운데) ─────────────────────────────────
  const chainTrack = () => {
    const st = steps();
    const last = st[st.length - 1];
    const nextIn = last?.outElement ?? null;
    return h(
      'div',
      { class: 'chain-track v4-track', 'aria-label': '시전 순서' },
      Array.from({ length: 4 }, (_, i) => {
        const p = plan[i];
        const link =
          i === 0
            ? null
            : h('div', { class: `cn-link ${p ? (st[i].reactionId ? 'react' : st[i].linked ? 'ok' : 'broken') : ''}` }, p ? h('span', {}, st[i].reactionId ? reactionById(st[i].reactionId!).name : st[i].linked ? `×${st[i].mult}` : st[i].sealed ? '봉인' : '끊김') : null);
        if (!p) return [link, h('div', { class: `q-slot cn empty ${i === plan.length ? 'next' : ''}` }, h('i', {}, NUM[i]))];
        const ally = allyOf(p.allyUid)!;
        const unit = unitById(ally.defId);
        const sp = spellById(p.spellId);
        const node = h(
          'button',
          {
            type: 'button',
            class: 'q-slot cn',
            style: { '--el': elColor(unit.element) },
            title: `${i + 1}. ${unit.name} · ${sp.name} (눌러서 빼기)`,
            disabled: busy,
            'data-sfx': 'none',
            onclick: () => {
              plan.splice(i, 1);
              sound.ui('card_remove', 0.5);
              render();
            },
          },
          glyph(sp.tag, 'cn-glyph'),
        );
        return [link, h('div', { class: 'cn-wrap' }, node, h('small', { class: 'cn-name' }, sp.name))];
      }).flat(),
      h('div', { class: 'cn-next', title: '다음 스킬이 이 성속을 받으면 링크가 이어집니다' }, h('small', {}, 'NEXT'), nextIn ? elBadge(nextIn, 'sm') : h('span', {}, '—')),
    );
  };

  function attuneRow(): HTMLElement {
    const els = (Object.keys(battle.attune) as Element[]).filter((e) => battle.attune[e] > 0);
    return h(
      'div',
      { class: 'attune-row', title: '속성 공명: 시전마다 내보낸 속성이 1씩 쌓입니다.' },
      els.map((e) => h('span', { class: `attune-chip ${battle.attune[e] >= MAX_ATTUNE ? 'max' : ''}`, 'data-el': e, style: { '--el': ELEMENTS[e].color } }, elBadge(e, 'sm'), h('b', {}, battle.attune[e]))),
    );
  }

  // ── 상세 정보 ────────────────────────────────────────────
  const statusList = (statuses: Status[]) =>
    statuses.length
      ? h(
          'ul',
          { class: 'bx-status-list' },
          statuses.map((st) => {
            const meta = STATUS_META[st.id];
            const amount = meta.keyword ? `위력 ${st.value ?? 0} · 횟수 ${st.turns}` : st.turns >= 90 ? (st.value ? `${st.value}` : '지속') : `${st.value ? `${st.value} · ` : ''}${st.turns}턴`;
            return h('li', { class: meta.debuff ? 'debuff' : 'buff' }, h('b', {}, `${meta.debuff ? '▼' : '▲'} ${meta.glyph} ${meta.name}`, h('small', {}, ` ${amount}`)), h('span', {}, meta.desc));
          }),
        )
      : h('p', { class: 'bx-empty' }, '걸린 효과 없음');

  const infoView = () => {
    if (!inspect) return null;
    const ally = allyOf(inspect);
    const enemy = enemyOf(inspect);
    const close = button('✕', () => {
      inspect = null;
      render();
    }, { class: 'bx-info-close', title: '닫기 (Esc)' });
    if (ally) {
      const unit = unitById(ally.defId);
      const bust = h('div', { class: 'bx-info-bust' });
      bust.innerHTML = characterBust(ally.defId);
      return h(
        'aside',
        { class: 'bx-info', style: { '--el': elColor(unit.element) } },
        close,
        h('header', {}, bust, h('div', {}, h('small', {}, `${unit.code} · ${ROLE_NAMES[unit.role]}`), h('h3', {}, unit.name, ' ', elBadge(unit.element, 'sm')), h('p', {}, unit.concept))),
        h(
          'dl',
          { class: 'bx-stats' },
          h('div', {}, h('dt', {}, 'HP'), h('dd', {}, `${ally.hp}/${ally.maxHp}`)),
          h('div', {}, h('dt', {}, '공격'), h('dd', {}, ally.atk)),
          h('div', {}, h('dt', {}, '방어'), h('dd', {}, ally.def)),
          ally.shield ? h('div', {}, h('dt', {}, '보호막'), h('dd', {}, ally.shield)) : null,
        ),
        h('section', {}, h('h4', {}, '상태'), statusList(ally.statuses)),
        h('section', {}, h('h4', {}, `패시브 · ${unit.passive.name}`), h('p', { class: 'ab-desc' }, highlight(unit.passive.desc))),
        h(
          'section',
          {},
          h('h4', {}, '장착 주문 5장 · 매 라운드 2장을 뽑는다'),
          (ally.spells ?? unit.spells).map((id) => {
            const sp = spellById(id);
            const inHand = battle.hands[ally.uid]?.includes(id);
            return h(
              'div',
              { class: `bx-ab ${inHand ? 'in-hand' : ''}` },
              h('div', { class: 'bx-ab-head' }, h('small', {}, inHand ? '이번 손패' : TAG_NAMES[sp.tag]), h('b', {}, sp.name), spellFlow(sp), h('span', {}, `성진 ${sp.cost}`)),
              h('p', { class: 'ab-desc' }, highlight(sp.desc)),
            );
          }),
        ),
      );
    }
    if (enemy) {
      const def = enemyById(enemy.defId);
      return h(
        'aside',
        { class: 'bx-info enemy', style: { '--el': '#e0685a' } },
        close,
        h('header', {}, h('div', { class: 'bx-info-bust glyph' }, def.glyph), h('div', {}, h('small', {}, 'ENEMY'), h('h3', {}, def.name))),
        h(
          'dl',
          { class: 'bx-stats' },
          h('div', {}, h('dt', {}, 'HP'), h('dd', {}, `${enemy.hp}/${enemy.maxHp}`)),
          h('div', {}, h('dt', {}, '공격'), h('dd', {}, enemy.atk)),
          h('div', {}, h('dt', {}, '방어'), h('dd', {}, enemy.def)),
        ),
        h('section', {}, h('h4', {}, '다음 행동'), isAlive(enemy) ? intentView(enemy.intent, enemy, battle.allies) : h('p', {}, '쓰러짐')),
        isAlive(enemy) ? patternList(enemy) : null,
        h('section', {}, h('h4', {}, '상태'), statusList(enemy.statuses)),
        def.traits?.length ? h('section', {}, h('h4', {}, '특성'), def.traits.map((t) => h('p', {}, TRAIT_DESC[t]))) : null,
      );
    }
    return null;
  };

  /** 적 행동 패턴: 지금 단계의 순서와(다음 행동 표시) 남은 2단계 예고 */
  const patternList = (e: Enemy) => {
    const def = enemyById(e.defId);
    const pattern = currentPattern(e);
    const now = e.patternIndex % pattern.length;
    return h(
      'section',
      { class: 'bx-pattern' },
      h('h4', {}, e.enraged && def.phase2 ? `행동 패턴 · 2단계 「${def.phase2.name}」` : '행동 패턴 · 순서대로 되풀이'),
      h('ol', {}, pattern.map((m, i) => h('li', { class: i === now ? 'now' : '' }, h('b', {}, m.name), h('span', {}, moveText(m))))),
      def.phase2 && !e.enraged
        ? h('p', { class: 'bx-phase-note' }, `체력 ${Math.round(def.phase2.at * 100)}% 이하가 되면 2단계 「${def.phase2.name}」: 공격 +${def.phase2.atk}, ${def.phase2.pattern.map((m) => m.name).join(' → ')}`)
        : null,
    );
  };

  // ── 카드 패(아래): 술사마다 이번 라운드 손패 2장 ─────────────
  const card = (a: Ally, id: string, n: number) => {
    const sp = spellById(id);
    const unit = unitById(a.defId);
    const idx = plan.findIndex((p) => p.allyUid === a.uid);
    const chosen = idx >= 0 && plan[idx].spellId === id;
    const myCost = idx >= 0 ? spellById(plan[idx].spellId).cost : 0;
    const tooCostly = !chosen && sp.cost > remaining() + myCost;
    const hint = linkHint(a.uid, id);
    return h(
      'button',
      {
        type: 'button',
        class: `card5 ${chosen ? 'on' : ''} hint-${hint.kind}`,
        style: { '--el': elColor(unit.element) },
        disabled: busy || tooCostly,
        'data-sfx': 'none',
        onclick: () => pickSpell(a, id),
        onmouseenter: () => showDesc(a.uid, id),
        onfocus: () => showDesc(a.uid, id),
        'aria-label': `${unit.name} ${sp.name}, 성진 ${sp.cost}, ${hint.text}`,
      },
      h('span', { class: 'c5-top' }, h('span', { class: 'c5-cost', title: `성진 ${sp.cost}` }, `✦${sp.cost}`), h('kbd', {}, String(n))),
      h('span', { class: 'c5-flow' }, spellFlow(sp)),
      h('b', { class: 'c5-name' }, sp.name),
      h('span', { class: 'c5-tag' }, TAG_NAMES[sp.tag]),
      h('span', { class: `c5-hint ${hint.kind}` }, hint.text),
      chosen ? h('span', { class: 'c5-order' }, NUM[idx]) : null,
    );
  };

  /** 설명 카드: 가리킨 카드(없으면 마지막으로 고른 카드)를 문장으로 */
  let descFor: { uid: string; id: string } | null = null;
  const showDesc = (uid: string, id: string) => {
    descFor = { uid, id };
    dockSlot.querySelector('.desc5')?.replaceWith(descCard());
  };
  const descCard = () => {
    const pick = descFor ?? (plan.length ? { uid: plan[plan.length - 1].allyUid, id: plan[plan.length - 1].spellId } : null);
    const a = pick ? allyOf(pick.uid) : null;
    if (!pick || !a) return h('div', { class: 'desc5 empty' }, h('p', {}, '카드를 가리키면 설명이 나옵니다. 앞 카드가 넘긴 성속을 다음 카드가 받으면 링크가 이어집니다.'));
    const sp = spellById(pick.id);
    const unit = unitById(a.defId);
    return h(
      'div',
      { class: 'desc5', style: { '--el': elColor(unit.element) } },
      h('div', { class: 'd5-head' }, h('b', {}, sp.name), spellFlow(sp), h('span', {}, `${unit.name} · ${TAG_NAMES[sp.tag]} · 성진 ${sp.cost}`)),
      h('p', { class: 'ab-desc' }, highlight(sp.desc)),
    );
  };

  const castButton = () => {
    const st = steps();
    const last = st[st.length - 1];
    const chain = last?.chain ?? 0;
    const full = chain === 4;
    return h(
      'button',
      { type: 'button', class: `cast5 ${plan.length ? '' : 'pass'} ${full ? 'full' : ''}`, disabled: busy, onclick: () => void execute(), title: plan.length ? '시전 (Space)' : '아무것도 하지 않고 성진만 모은다 (Space)' },
      h('b', {}, plan.length ? '시전' : '대기'),
      h('small', {}, full ? '성좌 완성' : plan.length ? `체인 ${chain} · ×${last?.mult ?? 1}` : '성진만 모으기'),
    );
  };

  const dockView = () => {
    const left = remaining();
    let n = 0;
    return h(
      'div',
      { class: 'dock5' },
      descCard(),
      h(
        'div',
        { class: 'd5-row' },
        h(
          'div',
          { class: 'd5-hands' },
          battle.allies.map((a) => {
            const unit = unitById(a.defId);
            const face = h('span', { class: 'h5-face' });
            face.innerHTML = characterBust(a.defId);
            return h(
              'div',
              { class: `hand5 ${isAlive(a) ? '' : 'dead'}`, style: { '--el': elColor(unit.element) } },
              h('div', { class: 'h5-who' }, face, h('b', {}, unit.name)),
              h('div', { class: 'h5-cards' }, isAlive(a) ? (battle.hands[a.uid] ?? []).map((id) => card(a, id, ++n)) : h('p', { class: 'h5-down' }, '전투 불능')),
            );
          }),
        ),
        h(
          'div',
          { class: 'd5-side' },
          h('div', { class: 'd5-dust', title: `성진 ${battle.stardust}/${battle.maxStardust}` }, h('small', {}, '남은 성진'), h('b', {}, `${left}`), h('span', {}, ` / ${battle.stardust}`)),
          castButton(),
        ),
      ),
    );
  };

  function render() {
    actorEls.clear();
    const fc = busy ? new Map<string, number>() : forecast();
    actorLayer.replaceChildren(...battle.allies.map((a, i) => allyActor(a, i)), ...battle.enemies.map((e) => enemyActor(e, fc)));
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
          h('div', { class: 'plaque' }, h('span', { class: 'plaque-sub' }, `${run.floor + 1}층 · ${floor.name}`), h('b', {}, `ROUND ${battle.round}`)),
          attuneRow(),
        ),
        h(
          'div',
          { class: 'hud-right' },
          button(app.speed > 1 ? '×2' : '×1', () => {
            app.setSpeed(app.speed > 1 ? 1 : 2);
            render();
          }, { class: 'btn-hud', title: '연출 속도' }),
          button('GFX', () => showToast(`그래픽: ${cycleGraphics()}`), { class: 'btn-hud', title: `그래픽 품질: ${graphicsLabel()}` }),
          button(sound.preference === 'off' ? '♪̸' : '♪', () => {
            showToast(`소리: ${sound.cycle()}`);
            render();
          }, { class: 'btn-hud', title: `소리: ${sound.label()}` }),
          button('LOG', showLog, { class: 'btn-hud', title: '전투 기록 (L)' }),
          button('?', () => showHelp(), { class: 'btn-hud', title: '플레이 방법' }),
        ),
      ),
      chainTrack(),
      ...(battle.seal ? [h('div', { class: 'seal-banner' }, '⊘ 성식 — ', elBadge(battle.seal, 'sm'), ` ${ELEMENTS[battle.seal].name}(으)로 가는 링크가 끊깁니다`)] : []),
    );
    infoSlot.replaceChildren(...[infoView()].filter((x): x is HTMLElement => !!x));
    root.classList.toggle('inspecting', !!inspect);
    dockSlot.replaceChildren(dockView());
    drawPreview();
    syncAuras();
  }

  const showToast = (text: string) => {
    const t = h('div', { class: 'toast', role: 'status' }, text);
    root.append(t);
    setTimeout(() => t.remove(), 1600);
  };
  const showLog = () => modal('전투 기록', h('ol', { class: 'log-list' }, log.slice(-80).reverse().map((l) => h('li', {}, l))), () => {});

  // ── 단축키: 1~8 카드, Space 시전, Backspace 마지막 취소, Tab 대상, Esc 상세 닫기 ──
  const onKey = (e: KeyboardEvent) => {
    if (!root.isConnected) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (document.querySelector('.modal-backdrop')) return;
    if (e.key === 'Escape') {
      inspect = null;
      render();
      return;
    }
    if (busy || battle.outcome !== 'ongoing') return;
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    const n = Number(e.key);
    const order = battle.allies.flatMap((a) => (isAlive(a) ? (battle.hands[a.uid] ?? []).map((id) => ({ a, id })) : []));
    if (n >= 1 && n <= order.length) {
      showDesc(order[n - 1].a.uid, order[n - 1].id);
      pickSpell(order[n - 1].a, order[n - 1].id);
    } else if (k === ' ' || k === 'enter') {
      if (e.target instanceof HTMLButtonElement && k === 'enter') return;
      e.preventDefault();
      void execute();
    } else if (k === 'backspace') {
      plan.pop();
      render();
    } else if (k === 'tab') {
      e.preventDefault();
      const living = battle.enemies.filter(isAlive);
      const i = living.findIndex((x) => x.uid === getFocus(battle)?.uid);
      const next = living[(i + 1) % living.length];
      if (next) setFocus(battle, next.uid);
      render();
    } else if (k === 'l') showLog();
  };
  document.addEventListener('keydown', onKey);

  // ── 연출 도우미 ──────────────────────────────────────────
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
  const enemyCenter = () => {
    const living = battle.enemies.filter((e) => !actorEls.get(e.uid)?.classList.contains('dying'));
    const pts = (living.length ? living : battle.enemies).map((e) => chest(e.uid));
    return pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
  };
  const ONOMA: Record<string, [string, string]> = {
    thrust: ['푹!', '꿰뚫는다!'],
    slash: ['샥!', '스가각!'],
    bash: ['쿵!', '콰앙!'],
    shoot: ['탕!', '타아앙!'],
    raise: ['파앗!', '쏟아진다!'],
  };
  const onomatopoeia = (uid: string, motion: string, big: boolean) => {
    const el = actorEls.get(uid);
    if (!el) return;
    const [small, large] = ONOMA[motion] ?? ONOMA.raise;
    const n = h('span', { class: `onoma ${big ? 'big' : ''}` }, big ? large : small);
    n.style.setProperty('--r', `${Math.round(Math.random() * 20 - 10)}deg`);
    n.style.setProperty('--x', `${Math.round(Math.random() * 60 - 30)}px`);
    el.append(n);
    setTimeout(() => n.remove(), 900);
  };
  const speedLines = (color: string) => {
    const el = h('div', { class: 'speedlines', style: { '--el': color } });
    scene.append(el);
    setTimeout(() => el.remove(), 650);
  };
  let hitTotal = { n: 0, dmg: 0 };
  const bumpHits = (amount: number, color: string) => {
    hitTotal = { n: hitTotal.n + 1, dmg: hitTotal.dmg + amount };
    hitSlot.replaceChildren(h('div', { class: 'hit-total', style: { '--el': color } }, h('b', {}, `${hitTotal.dmg}`), h('small', {}, `${hitTotal.n} HIT${hitTotal.n > 1 ? 'S' : ''} · 총 피해`)));
  };
  const resetHits = () => {
    hitTotal = { n: 0, dmg: 0 };
    hitSlot.querySelector('.hit-total')?.classList.add('out');
  };
  const refreshFoot = (uid: string) => {
    const el = actorEls.get(uid);
    const u = allyOf(uid) ?? enemyOf(uid);
    if (!el || !u) return;
    const foot = el.querySelector('.bx-foot');
    const fresh = (u.uid.startsWith('e') ? enemyActor(u as Enemy, new Map()) : allyActor(u as Ally, battle.allies.indexOf(u as Ally))).querySelector('.bx-foot');
    actorEls.set(uid, el);
    if (foot && fresh) foot.replaceWith(fresh);
  };

  const castSummary = (events: BattleEvent[], from: number) => {
    let dmg = 0;
    let hits = 0;
    let heal = 0;
    let shield = 0;
    let reaction: string | null = null;
    const buffs = new Set<string>();
    const debuffs = new Set<string>();
    for (let i = from + 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'cast' || ev.type === 'enemyAct' || ev.type === 'enemyStunned' || ev.type === 'round') break;
      if (ev.type === 'damage' && ev.source !== 'enemy') {
        dmg += ev.amount;
        hits++;
      } else if (ev.type === 'heal') heal += ev.amount;
      else if (ev.type === 'shield' && !ev.targetUid.startsWith('e')) shield += ev.amount;
      else if (ev.type === 'reaction') reaction = reactionById(ev.reactionId).name;
      else if (ev.type === 'status') (STATUS_META[ev.status].debuff ? debuffs : buffs).add(STATUS_META[ev.status].name);
    }
    const chips: HTMLElement[] = [];
    if (dmg) chips.push(h('span', { class: 'rc dmg' }, `피해 ${dmg}`, hits > 1 ? h('small', {}, ` ${hits}타`) : null));
    if (reaction) chips.push(h('span', { class: 'rc react' }, `반응 ${reaction}`));
    if (heal) chips.push(h('span', { class: 'rc heal' }, `회복 ${heal}`));
    if (shield) chips.push(h('span', { class: 'rc shield' }, `⛨ ${shield}`));
    for (const b of buffs) chips.push(h('span', { class: 'rc buff' }, `▲ ${b}`));
    for (const d of debuffs) chips.push(h('span', { class: 'rc debuff' }, `▼ ${d}`));
    return chips;
  };

  const showSkillPlate = (allyUid: string, spellId: string, chainText: string, linked: boolean, chips: HTMLElement[], step: string) => {
    const ally = allyOf(allyUid)!;
    const unit = unitById(ally.defId);
    const sp = spellById(spellId);
    const bust = h('div', { class: 'sp-bust' });
    bust.innerHTML = characterBust(ally.defId);
    plateSlot.replaceChildren(
      h(
        'div',
        { class: `skill-plate ${linked ? 'linked' : ''}`, style: { '--el': elColor(unit.element) } },
        bust,
        h(
          'div',
          { class: 'sp-body' },
          h('small', { class: 'sp-who' }, `${step} · ${unit.name} `, h('span', {}, unit.code)),
          h('b', { class: 'sp-name' }, glyph(sp.tag, 'sp-glyph'), sp.name),
          h('div', { class: 'sp-meta' }, h('span', { class: 'sp-tag' }, `${TAG_NAMES[sp.tag]} · ${TAG_EN[sp.tag]}`), h('span', { class: `sp-link ${linked ? 'on' : ''}` }, chainText)),
          chips.length ? h('div', { class: 'sp-result' }, chips) : null,
        ),
      ),
    );
  };
  const showEnemyPlate = (enemyUid: string, text: string) => {
    const def = enemyById(enemyOf(enemyUid)!.defId);
    plateSlot.replaceChildren(h('div', { class: 'skill-plate enemy' }, h('div', { class: 'sp-body' }, h('small', { class: 'sp-who' }, 'ENEMY'), h('b', { class: 'sp-name' }, def.name), h('div', { class: 'sp-meta' }, h('span', { class: 'sp-tag' }, text)))));
  };

  /** 극딜 컷인 */
  async function finisherCutIn(uid: string, spellName: string, un: { stack: Stack; stacks: number; mult: number } | null, color: string, target: string | null) {
    const ally = allyOf(uid)!;
    const unit = unitById(ally.defId);
    const fig = h('div', { class: 'ci-fig' });
    fig.innerHTML = characterSvg(ally.defId);
    const el = h(
      'div',
      { class: 'cutin', style: { '--el': color } },
      h('div', { class: 'ci-band' }),
      fig,
      h(
        'div',
        { class: 'ci-text' },
        h('small', {}, `${unit.code} · CODA`),
        h('b', {}, spellName),
        un ? h('span', { class: 'ci-kindle' }, h('i', {}, STATUS_META[un.stack].glyph.repeat(Math.min(un.stacks, 10))), ` ${STATUS_META[un.stack].name} ${un.stacks} 해방 · 피해 ×${un.mult}`) : h('span', { class: 'ci-kindle' }, '모은 힘 없이 발동'),
      ),
    );
    scene.append(el);
    stage.flashScreen(0.25);
    sound.unleash(un?.stacks ?? 0);
    sound.duck(2);
    if (target) stage.punch(chest(target), 1.1);
    stage.slowMo(0.35, 0.5);
    await wait(un ? 1050 : 700);
    speedLines(color);
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }

  // ── 재생 ────────────────────────────────────────────────
  async function play(events: BattleEvent[]) {
    let prevCaster: string | null = null;
    let prevOut: Element | null = null;
    let enemyPhase = false;
    let castIdx = -1;
    let lastTag: SkillTag = 'strike';
    let lastColor = '#ffffff';
    let lastCaster = '';
    let lastElement = 'star';
    let unleashed = false;
    let startShown = false;
    const castTotal = events.filter((x) => x.type === 'cast' || x.type === 'skip').length;
    const stats = { dmg: 0, casts: 0, reactions: 0, chain: 0 };
    let choreo: { caster: string; color: string; motion: string; melee: boolean; dashed: boolean; hits: number; idx: number; tag: SkillTag; pending: boolean; firstHit: boolean; last: boolean; big: boolean } | null = null;
    const trackSlots = () => hudSlot.querySelectorAll('.q-slot');
    const stageTargets = (from: number): string[] => {
      const out: string[] = [];
      for (let i = from + 1; i < events.length; i++) {
        const x = events[i];
        if (x.type === 'stage' || x.type === 'cast' || x.type === 'enemyAct' || x.type === 'enemyStunned' || x.type === 'fullChain') break;
        if (x.type === 'damage' && x.source === 'ally') out.push(x.targetUid);
      }
      return out;
    };
    const laterStage = (from: number): boolean => {
      for (let i = from + 1; i < events.length; i++) {
        const x = events[i];
        if (x.type === 'cast' || x.type === 'enemyAct' || x.type === 'fullChain') return false;
        if (x.type === 'stage' && !x.skipped) return true;
      }
      return false;
    };
    const turnSummary = async () => {
      if (!stats.casts) return;
      showCallout(h('div', { class: 'banner turn-summary' }, h('small', {}, 'YOUR TURN'), h('b', {}, `총 피해 ${stats.dmg}`), h('span', {}, `시전 ${stats.casts} · 최대 체인 ${stats.chain}${stats.reactions ? ` · 성좌 반응 ${stats.reactions}` : ''}`)), 'summary');
      await wait(1000);
      clearCallout();
    };
    const endCast = async () => {
      if (!choreo) return;
      const c = choreo;
      choreo = null;
      if (c.dashed) {
        stage.anim(c.caster, 'dash');
        stage.dash(c.caster, null, 0.22);
        await wait(230);
      }
      stage.anim(c.caster, 'recover');
      stage.setBackdrop(null);
    };

    for (let k = 0; k < events.length; k++) {
      const ev = events[k];
      const text = eventText(battle, ev);
      if (text) log.push(text);
      switch (ev.type) {
        case 'trigger': {
          if (ev.phase === 'start') {
            if (!startShown) {
              startShown = true;
              showCallout(h('div', { class: 'banner phase-banner start-banner' }, h('small', {}, 'ROUND START'), h('b', {}, '라운드 시작 효과')), 'start');
              await wait(420);
              clearCallout();
            }
            const col = elColor(unitById(allyOf(ev.allyUid)!.defId).element);
            stage.anim(ev.allyUid, 'channel');
            stage.fx?.magicCircle(feet(ev.allyUid), col, 2.2, 0.9, 'magic_01');
            floatText(ev.allyUid, spellById(ev.spellId).name, 'trigger t-start');
            await wait(460);
          } else if (ev.phase === 'kill') {
            floatText(ev.allyUid, '처치 효과', 'trigger t-kill');
            await wait(260);
          }
          break;
        }
        case 'cast': {
          await endCast();
          castIdx++;
          unleashed = false;
          stats.chain = Math.max(stats.chain, ev.chain);
          const unit = unitById(allyOf(ev.allyUid)!.defId);
          const color = elColor(unit.element);
          const sp = spellById(ev.spellId);
          lastTag = sp.tag;
          lastColor = color;
          lastCaster = ev.allyUid;
          lastElement = unit.element;
          trackSlots().forEach((q, i) => {
            q.classList.toggle('active', i === castIdx);
            if (i < castIdx) q.classList.add('spent');
          });
          const nextCast = events.findIndex((x, j) => j > k && (x.type === 'cast' || x.type === 'enemyAct' || x.type === 'fullChain'));
          const slice = events.slice(k + 1, nextCast < 0 ? events.length : nextCast);
          const unleash = slice.find((x): x is Extract<BattleEvent, { type: 'unleash' }> => x.type === 'unleash') ?? null;
          const targets = slice.filter((x): x is Extract<BattleEvent, { type: 'damage' }> => x.type === 'damage' && x.source === 'ally').map((x) => x.targetUid);
          if (sp.tag === 'finisher' || unleash) await finisherCutIn(ev.allyUid, sp.name, unleash, color, targets[0] ?? null);
          stage.focus(chest(ev.allyUid), 0.7);
          stage.fx?.castCircle(chest(ev.allyUid), color, sp.cost >= 2 ? 3.8 : 3);
          stage.fx?.gather(chest(ev.allyUid).add(new THREE.Vector3(0.7, 0.1, 0)), color, sp.cost >= 2 ? 26 : 16, 0.42);
          const motion = characterMotion(unit.id);
          const staged = slice.some((x) => x.type === 'stage');
          const melee = staged && (motion === 'thrust' || motion === 'slash' || motion === 'bash');
          stage.setBackdrop(color, SUPPORT_TAGS.has(sp.tag) ? 0.55 : sp.cost >= 2 ? 0.9 : 0.75);
          showSkillPlate(ev.allyUid, ev.spellId, ev.linked ? `LINK ${ev.chain} · ×${ev.mult}` : ev.sealed ? '성식 — 링크 끊김' : prevCaster ? '링크 끊김 · 새 체인' : `CHAIN 1${ev.mult !== 1 ? ` · ×${ev.mult}` : ''}`, ev.linked, castSummary(events, k), `${castIdx + 1} / ${castTotal}`);
          await wait(420);
          choreo = { caster: ev.allyUid, color, motion, melee, dashed: false, hits: targets.length, idx: 0, tag: sp.tag, pending: false, firstHit: false, last: false, big: sp.cost >= 2 };
          if (melee && targets[0]) {
            stage.anim(ev.allyUid, 'dash');
            stage.dash(ev.allyUid, targets[0], 0.16);
            stage.afterimage(ev.allyUid, color, 4);
            sound.whoosh('sweep');
            choreo.dashed = true;
          } else stage.anim(ev.allyUid, sp.tag === 'charge' ? 'charge' : SUPPORT_TAGS.has(sp.tag) ? 'channel' : staged ? (motion === 'shoot' ? 'fire' : 'cast1') : 'cast');
          sound.cast(unit.element, ev.chain, motion);
          if (ev.linked) sound.link(ev.chain, prevOut ?? unit.element);
          stage.fx?.magicCircle(feet(ev.allyUid), color, 2.6, 1.1, 'magic_01');
          if (ev.linked && prevCaster) stage.fx?.arc(chest(prevCaster), chest(ev.allyUid), prevOut ? elColor(prevOut) : color);
          resetHits();
          stats.casts++;
          if (!staged) {
            stage.fx?.flare(chest(ev.allyUid), color, 1.4, 0.35);
            stage.fx?.ring(feet(ev.allyUid), color, 0.4, 4.2, 0.6);
            stage.focus(null);
          } else if (targets[0]) stage.focus(new Set(targets).size > 1 ? enemyCenter() : chest(targets[0]), 0.55);
          await wait(staged ? 140 : 420);
          prevCaster = ev.allyUid;
          prevOut = ev.outElement;
          break;
        }
        case 'stage': {
          const c = choreo;
          if (!c || c.caster !== ev.allyUid) break;
          c.hits = ev.total;
          c.idx = ev.index;
          if (ev.skipped) {
            c.pending = false;
            await wait(140);
            break;
          }
          const here = stageTargets(k);
          const tgt = here[0] ?? getFocus(battle)?.uid ?? null;
          const last = !laterStage(k);
          c.pending = true;
          c.firstHit = true;
          c.last = last;
          const col = c.color;
          const p = tgt ? chest(tgt) : enemyCenter();
          if (c.melee) {
            const pose = last && ev.total > 1 ? 'finish' : (['combo1', 'combo2', 'combo3'] as const)[ev.index % 3];
            if (tgt && c.tag !== 'aoe') stage.dash(c.caster, tgt, 0.1);
            stage.anim(c.caster, pose);
            sound.whoosh('sweep');
            await wait(pose === 'finish' ? 300 : 150);
            const roll = { combo1: -0.9, combo2: 2.3, combo3: 0.1, finish: -1.35 }[pose];
            stage.toon.slash(p, col, pose === 'finish' ? 4.6 : 3.4, roll);
            if (ev.index % 3 === 1) stage.toon.slash(p, col, 3.1, roll + 1.7, 0.06);
            if (pose === 'finish') stage.toon.slash(p, '#ffffff', 4, roll + 0.5, 0.04);
            stage.afterimage(c.caster, col, last ? 4 : 2);
          } else {
            stage.anim(c.caster, c.motion === 'shoot' ? 'fire' : ev.index % 2 ? 'cast2' : 'cast1');
            const from = chest(c.caster).add(new THREE.Vector3(0.7, 0.15, 0));
            const aims = here.length ? [...new Set(here)] : tgt ? [tgt] : [];
            aims.forEach((t, j) => {
              if (last && ev.total > 1 && c.big) stage.toon.beam(from, chest(t), col, 0.4, 0.28, j * 0.04);
              else stage.toon.shot(from, chest(t), col, 0.15, j * 0.05);
            });
            if (c.tag === 'aoe' && last) stage.fx?.sweep(enemyCenter(), col, 6.5);
            sound.whoosh(c.motion === 'shoot' ? 'projectile' : 'mark');
            await wait(last && ev.total > 1 ? 240 : 170);
          }
          break;
        }
        case 'reaction': {
          const r = reactionById(ev.reactionId);
          const target = getFocus(battle)?.uid ?? null;
          const at = target ? chest(target) : enemyCenter();
          stage.fx?.nova(at, elColor(r.from), elColor(r.to), 0.8);
          sound.reaction(r.from, r.to);
          stats.reactions++;
          stage.flashScreen(0.15);
          stage.punch(at, 0.7);
          stage.glowPulse(0.4);
          stage.fx?.signature(r.from, at, elColor(r.from), 1.3);
          stage.fx?.signature(r.to, at, elColor(r.to), 1.1);
          showCallout(h('div', { class: 'banner reaction-banner', style: { '--from': elColor(r.from), '--to': elColor(r.to) } }, h('small', {}, `REACTION · ${r.en}`), h('b', {}, r.name), h('span', {}, r.desc)), 'reaction');
          await wait(1050);
          clearCallout();
          break;
        }
        case 'fullChain': {
          await endCast();
          stage.fx?.goldArcs();
          sound.fullChain();
          sound.duck(1.5);
          const c = enemyCenter();
          stage.fx?.magicCircle(new THREE.Vector3(-3.6, 0, 0.1), '#ffd27a', 8, 1.6, 'magic_02');
          stage.fx?.nova(c, '#ffd27a', '#ffffff', 1.05);
          stage.flashScreen(0.3);
          stage.shake(0.35);
          stage.punch(c, 1);
          speedLines('#ffd27a');
          showCallout(h('div', { class: 'banner complete-banner' }, h('small', {}, 'CONSTELLATION COMPLETE'), h('b', {}, '성좌 완성')), 'complete');
          await wait(1400);
          clearCallout();
          break;
        }
        case 'damage': {
          const unit = allyOf(ev.targetUid) ?? enemyOf(ev.targetUid);
          const el = actorEls.get(ev.targetUid);
          if (el && unit && el.querySelector('.hp')) updateHpBar(el, ev.hpAfter, unit.maxHp, ev.shieldAfter);
          const crit = unleashed && ev.source === 'ally';
          stage.anim(ev.targetUid, 'hit', crit ? 2.4 : Math.min(2, Math.max(0.6, ev.amount / 14)));
          if (crit) stage.hitStop(0.14);
          else if (ev.source !== 'burn' && ev.amount >= 12) stage.hitStop(0.06);
          const fx = stage.fx;
          const p = chest(ev.targetUid);
          let finale = false;
          if (ev.source === 'ally' && choreo && choreo.pending) {
            const c = choreo;
            const first = c.firstHit;
            c.firstHit = false;
            finale = c.last && first && (c.hits > 1 || ev.amount >= 12 || crit);
            stage.toon.hit(p, c.color, c.last ? 1.3 : first ? 1 : 0.8);
            if (first) {
              stage.kick((c.idx % 2 ? 1 : -1) * (0.025 + 0.01 * Math.min(c.idx, 3)), c.last ? 1.1 : 0.55);
              stage.hitStop(c.last ? 0.1 : 0.05);
              onomatopoeia(ev.targetUid, c.motion, finale);
            }
            if (finale) {
              stage.toon.finale(p, c.color, crit ? 1.5 : 1.1);
              stage.slowMo(0.35, 0.3);
              if (c.hits >= 3 || crit) speedLines(c.color);
            }
          }
          if (fx) {
            if (ev.source === 'enemy') {
              stage.toon.slash(p, '#e0584a', 2.8, Math.random() * 3);
              stage.toon.hit(p, '#e0584a', 0.9);
              stage.kick(-0.03, 0.4);
              stage.shake(0.18);
            } else if (ev.source === 'burn' || ev.source === 'erosion') fx.burn(p, ev.source === 'burn' ? '#ff8a3a' : '#a891e6');
            else if (ev.source === 'doom') {
              fx.meteor(feet(ev.targetUid).add(new THREE.Vector3(0, 0.8, 0)), elColor('comet'));
              stage.shake(0.5);
            } else if (ev.source === 'chain') fx.impact(p, '#ffd27a', 1.2);
            else if (ev.source === 'counter') fx.slash(p, elColor('star'), 2);
            else {
              fx.flare(p, lastColor, 1.2, 0.2);
              fx.sparks(p, lastColor, 8, 6, 0.2);
            }
            if (ev.source === 'ally' && ev.amount > 0 && (finale || crit)) fx.signature(lastElement, p, lastColor, crit ? 1.4 : 0.9);
          }
          if (crit && stage.fx) {
            stage.impactFrame(lastColor);
            speedLines(lastColor);
            stage.fx.impact(p, lastColor, 2);
            stage.shake(0.55);
            stage.flashScreen(0.18);
          }
          if (ev.source !== 'enemy' && !enemyPhase) {
            bumpHits(ev.amount, lastColor);
            stats.dmg += ev.amount;
          }
          sound.hit(crit ? 'crit' : ev.amount === 0 && ev.absorbed ? 'blocked' : ev.source === 'ally' ? (characterMotion(allyOf(lastCaster)?.defId ?? '') === 'slash' ? 'slash' : 'ally') : ev.source === 'erosion' ? 'burn' : ev.source === 'burst' ? 'doom' : ev.source);
          floatText(ev.targetUid, ev.amount > 0 ? `${ev.amount}` : `⛨${ev.absorbed}`, ev.source === 'enemy' ? 'dmg-ally' : ev.source === 'burn' || ev.source === 'erosion' ? 'dmg-burn' : crit ? 'dmg-crit' : ev.source === 'chain' || ev.source === 'doom' ? 'dmg-big' : 'dmg');
          await wait(finale ? 480 : crit ? 560 : lastTag === 'multi' ? 190 : 250);
          break;
        }
        case 'heal': {
          const unit = allyOf(ev.targetUid) ?? enemyOf(ev.targetUid);
          const el = actorEls.get(ev.targetUid);
          if (unit && el) updateHpBar(el, ev.hpAfter, unit.maxHp, unit.shield);
          stage.fx?.heal(chest(ev.targetUid), feet(ev.targetUid), ev.targetUid.startsWith('e') ? '#e0685a' : '#8fe0a5');
          sound.heal();
          floatText(ev.targetUid, `+${ev.amount}`, 'heal');
          await wait(130);
          break;
        }
        case 'shield':
          stage.fx?.shield(chest(ev.targetUid), ev.targetUid.startsWith('e') ? '#e0685a' : '#8ec5e0');
          sound.shield();
          floatText(ev.targetUid, `⛨ ${ev.amount}`, 'shield');
          refreshFoot(ev.targetUid);
          await wait(120);
          break;
        case 'status': {
          const meta = STATUS_META[ev.status];
          const isEnemy = ev.targetUid.startsWith('e');
          if (isEnemy && meta.debuff && ev.status !== 'doom') {
            stage.fx?.debuff(chest(ev.targetUid), lastColor);
            sound.debuff();
          }
          const ally = allyOf(ev.targetUid);
          const sig = ally ? stackOf(ally) : null;
          if (ally && sig && ev.status === sig.id) {
            const c = elColor(unitById(ally.defId).element);
            const n = ev.stacks ?? 1;
            stage.setAura(ev.targetUid, n, c, sig.max);
            sound.kindle(Math.round((n / sig.max) * 6), 6);
            stage.fx?.ring(feet(ev.targetUid), c, 2.6, 0.5, 0.5);
            floatText(ev.targetUid, `${meta.name} ${meta.glyph}${n}`, n >= Math.ceil(sig.max / 2) ? 'kindle ready' : 'kindle');
          } else {
            const label = meta.keyword ? `${meta.name} ${ev.stacks ?? ''}·${ev.turns}` : ev.stacks ? `${meta.name} ${ev.stacks}` : meta.name;
            floatText(ev.targetUid, `${meta.debuff ? '▼' : '▲'} ${label}`, meta.debuff ? 'debuff' : 'buff');
          }
          refreshFoot(ev.targetUid);
          await wait(110);
          break;
        }
        case 'unleash':
          stage.setAura(ev.allyUid, 0, '#ffffff');
          unleashed = true;
          refreshFoot(ev.allyUid);
          break;
        case 'purge':
          floatText(ev.targetUid, '강화 해제', 'debuff');
          await wait(110);
          break;
        case 'resist':
          floatText(ev.targetUid, '버팀 — 기절 안 됨', 'buff');
          await wait(260);
          break;
        case 'shatter':
          stage.fx?.debuff(chest(ev.targetUid), '#e0685a');
          sound.hit('blocked');
          floatText(ev.targetUid, '보호막 파괴', 'debuff');
          refreshFoot(ev.targetUid);
          await wait(260);
          break;
        case 'steal': {
          floatText(ev.enemyUid, ev.amount ? `성진 −${ev.amount}` : '성진 없음', 'debuff');
          stage.fx?.gather(chest(ev.enemyUid), '#f2c14e', 18, 0.4);
          sound.debuff();
          const dust = root.querySelector('.d5-dust b');
          if (dust) dust.textContent = String(battle.stardust);
          await wait(420);
          break;
        }
        case 'phase': {
          const def = enemyById(enemyOf(ev.enemyUid)!.defId);
          stage.lightning();
          stage.shake(0.5);
          stage.setAura(ev.enemyUid, 6, '#e0685a', 6);
          sound.seal();
          showCallout(h('div', { class: 'banner phase-banner rage-banner' }, h('small', {}, 'PHASE 2'), h('b', {}, `${def.name} — ${ev.name}`), h('span', {}, '패턴이 바뀌고 공격이 오릅니다')), 'enemy');
          await wait(1100);
          clearCallout();
          refreshFoot(ev.enemyUid);
          break;
        }
        case 'stardust':
          if (ev.amount > 0) sound.stardust();
          break;
        case 'skip':
          floatText(ev.allyUid, ev.reason === 'cost' ? '성진 부족' : '시전 불가', 'debuff');
          await wait(420);
          break;
        case 'enemyAct':
        case 'enemyStunned': {
          if (!enemyPhase) {
            await endCast();
            enemyPhase = true;
            stage.focus(null);
            stage.fx?.fadeArcs();
            trackSlots().forEach((q) => q.classList.add('spent'));
            await turnSummary();
            plateSlot.replaceChildren();
            resetHits();
            showCallout(h('div', { class: 'banner phase-banner' }, h('small', {}, 'ENEMY PHASE'), h('b', {}, '적의 차례')), 'enemy');
            await wait(700);
            clearCallout();
          }
          if (ev.type === 'enemyStunned') {
            floatText(ev.enemyUid, '기절', 'debuff');
            await wait(360);
            break;
          }
          stage.focus(chest(ev.enemyUid), 0.35);
          showEnemyPlate(ev.enemyUid, `「${ev.intent.name}」 ${moveText(ev.intent)}${ev.intent.targetId ? ` → ${unitLabel(battle, ev.intent.targetId)}` : ''}`);
          stage.fx?.gather(chest(ev.enemyUid), '#ff5a4a', 16, 0.36);
          await wait(320);
          stage.anim(ev.enemyUid, 'act');
          sound.enemyAct();
          await wait(360);
          stage.focus(null);
          break;
        }
        case 'death':
          stage.setAura(ev.uid, 0, '#ffffff');
          sound.death(ev.uid.startsWith('e'));
          stage.fx?.death(chest(ev.uid), ev.uid.startsWith('e') ? '#e0685a' : '#ffffff');
          stage.anim(ev.uid, 'die');
          actorEls.get(ev.uid)?.classList.add('dying');
          await wait(380);
          break;
        case 'seal':
          stage.lightning();
          sound.seal();
          showCallout(h('div', { class: 'banner phase-banner' }, h('small', {}, 'OCCULTATION'), h('b', {}, `성식 — ${ELEMENTS[ev.element].name} 봉인`)), 'enemy');
          await wait(720);
          clearCallout();
          break;
        case 'attune': {
          sound.attune(ev.element);
          const chip = hudSlot.querySelector(`.attune-chip[data-el="${ev.element}"] b`);
          if (chip) chip.textContent = String(ev.total);
          else hudSlot.querySelector('.attune-row')?.replaceWith(attuneRow());
          break;
        }
        case 'release':
          sound.release(ev.element);
          break;
        case 'round':
        case 'outcome':
          break;
      }
    }
    await endCast();
    if (!enemyPhase) await turnSummary();
    stage.fx?.fadeArcs();
    stage.focus(null);
    plateSlot.replaceChildren();
    resetHits();
    await wait(250);
  }

  async function execute() {
    if (busy) return;
    busy = true;
    const toRun = plan;
    root.classList.add('busy', 'executing');
    inspect = null;
    render();
    clearPreview();
    const events = executeRound(battle, toRun);
    plan = [];
    await play(events);
    app.save();
    busy = false;
    root.classList.remove('busy', 'executing');
    clearCallout();
    descFor = null;
    if (battle.outcome === 'ongoing') {
      render();
      sound.ui('card_fan', 0.5);
    } else showOutcome();
  }

  function showOutcome() {
    const won = battle.outcome === 'victory';
    if (won) stage.victory();
    if (won) sound.victory();
    else sound.defeat();
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
          h('h2', {}, won ? '전투 승리' : '작전 실패'),
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
