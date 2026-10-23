import * as THREE from 'three';
import { MAX_ATTUNE, STACK_MAX, cloneBattle, executeRound, getFocus, isAlive, planCost, setFocus, statusStacks } from '../../core/battle';
import { previewChain } from '../../core/link';
import { sound } from '../../audio/sound';
import { finishBattle } from '../../core/run';
import type { Ally, BattleEvent, BattleState, Element, Enemy, PlannedCast, SkillTag, Stack } from '../../core/types';
import { ELEMENTS, STATUS_META, reactionById } from '../../data/elements';
import { FLOORS } from '../../data/encounters';
import { TRAIT_DESC, enemyById } from '../../data/enemies';
import { spellById } from '../../data/spells';
import { unitById } from '../../data/units';
import { floorPreset } from '../../render/three/environment';
import { getStage } from '../../render/three/stage';
import type { App } from '../app';
import { h, sleep } from '../dom';
import { cycleGraphics, graphicsLabel } from '../graphics';
import { showHelp } from '../help';
import type { LinkHint } from '../widgets';
import { TAG_EN, TAG_NAMES } from '../../data/spells';
import { characterBust, characterSvg } from '../../render/characters';
import { characterMotion } from '../../render/rig';
import { cornerStars, guillocheSvg, sealSvg, sigilRingSvg } from '../arcane';
import { glyph } from '../glyphs';
import { NUM, allyName, button, elBadge, elColor, hpBar, intentView, modal, spellFlow, statusRow, updateHpBar } from '../widgets';

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
    case 'death':
      return `${unitLabel(state, ev.uid)} 쓰러짐`;
    case 'seal':
      return `성식: 다음 턴 ${ELEMENTS[ev.element].name} 링크 봉인`;
    case 'skip':
      return `${unitLabel(state, ev.allyUid)}: ${ev.reason === 'cost' ? '성진 부족' : '시전 불가'}`;
    case 'round':
      return `— ${ev.round} 라운드 —`;
    case 'release':
      return `공명 해방: ${ELEMENTS[ev.element].name} ${ev.stacks}중첩`;
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

  const place = floor.name;

  const root = h('main', { class: 'battle-wrap' });
  const scene = h('section', { class: `scene floor-${floor.kind}`, 'aria-label': '전장' });
  const actorLayer = h('div', { class: 'actor-layer' });
  const callout = h('div', { class: 'callout-layer', 'aria-live': 'polite' });
  const hudSlot = h('div', { class: 'hud-slot' });
  const peekSlot = h('div', { class: 'peek-slot', 'aria-live': 'polite' });
  const dockSlot = h('div', { class: 'dock-slot' });
  scene.append(actorLayer, hudSlot, peekSlot, callout);
  root.append(scene, dockSlot);

  const actorEls = new Map<string, HTMLElement>();
  /** 하단 분대 막대의 아군 칸(HP 갱신용) */
  const squadEls = new Map<string, HTMLElement>();
  const hpTargets = (uid: string) => [actorEls.get(uid), squadEls.get(uid)].filter((x): x is HTMLElement => !!x && !!x.querySelector('.hp'));
  let previewArcs: THREE.Mesh[] = [];
  let queueEl: HTMLElement;
  let meter: HTMLElement;
  /** 설명 패널에 띄울 카드(시전자 uid, 스킬 id) */
  let peek: { uid: string; spellId: string } | null = null;

  const wait = (ms: number) => sleep(ms / app.speed);
  const remaining = () => battle.stardust - planCost(plan);
  /** 고유 중첩을 소모하는 주문이면 그 중첩과 1당 배율 */
  const consumeOf = (spellId: string): { stack: Stack; per: number } | null => {
    for (const e of spellById(spellId).effects) if (e.kind === 'damage' && e.consume) return e.consume;
    return null;
  };
  /** 술사의 고유 중첩(게이지·오라로 보여 준다) */
  const stackOf = (a: Ally) => unitById(a.defId).stack ?? null;
  const SUPPORT_TAGS = new Set<SkillTag>(['heal', 'shield', 'buff', 'utility']);
  /** 타격마다 한 번씩 연출하는 주문 유형(광역 베기·관통 광선·지연 폭격은 시전 때 한 번에) */
  const PER_HIT_TAGS = new Set<SkillTag>(['strike', 'execute', 'multi', 'mark', 'drain', 'dot', 'finisher', 'resonance', 'debuff', 'aoe']);
  /** 의성어: 무기마다 다른 소리를 화면에 크게 쓴다 */
  const ONOMA: Record<string, [string, string]> = {
    thrust: ['푸욱!', '꿰뚫는다!'],
    slash: ['촤악!', '베어낸다!'],
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
  /** 고유 중첩 오라를 지금 상태에 맞춘다 */
  const syncAuras = () => {
    for (const a of battle.allies) {
      const st = stackOf(a);
      stage.setAura(a.uid, isAlive(a) && st ? statusStacks(a, st.id) : 0, elColor(unitById(a.defId).element), st?.max ?? 6);
    }
  };

  // ── 무대 준비 ────────────────────────────────────────────
  stage.mount(scene, 'battle');
  stage.setScene(floorPreset(run.floor));
  stage.setActors([
    ...battle.allies.map((a) => ({ uid: a.uid, side: 'ally' as const, defId: a.defId, dead: !isAlive(a) })),
    ...battle.enemies.map((e) => ({ uid: e.uid, side: 'enemy' as const, defId: e.defId, dead: !isAlive(e), boss: !!enemyById(e.defId).traits?.length })),
  ]);

  // 손패 오버레이가 덮는 높이만큼 무대 화면을 위로 밀어 캐릭터가 가려지지 않게 한다.
  const dockObserver = new ResizeObserver(() => stage.setSafeArea(Math.max(0, dockSlot.offsetHeight - 48)));
  dockObserver.observe(dockSlot);

  // 이름표·예고·순서·피해 숫자 같은 DOM 오버레이를 매 프레임 액터 위치에 맞춘다.
  const off = stage.onFrame(() => {
    if (!root.isConnected) {
      off();
      dockObserver.disconnect();
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
    if (idx >= 0 && plan[idx].spellId === spellId) {
      plan.splice(idx, 1);
      sound.ui('card_remove', 0.5);
    } else {
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
    const steps = previewChain(plan.map((p) => spellById(p.spellId)), battle.seal);
    plan.forEach((p, i) => {
      if (i === 0 || !steps[i].linked) return;
      const prevOut = steps[i - 1].outElement;
      previewArcs.push(stage.fx!.arc(stage.actorPos(plan[i - 1].allyUid), stage.actorPos(p.allyUid), prevOut ? elColor(prevOut) : '#ffffff', true));
    });
  };

  // ── 예측 ────────────────────────────────────────────────
  /** 지금 계획대로 시전하면 각 시전이 어떻게 이어지는지 */
  const steps = () => previewChain(plan.map((p) => spellById(p.spellId)), battle.seal);

  /** 이 카드를 지금 계획에 넣었을 때의 링크 예고 */
  const linkHint = (allyUid: string, spellId: string): LinkHint | undefined => {
    const idx = plan.findIndex((p) => p.allyUid === allyUid);
    const trial = plan.slice();
    if (idx >= 0) trial[idx] = { allyUid, spellId };
    else trial.push({ allyUid, spellId });
    const at = idx >= 0 ? idx : trial.length - 1;
    const st = previewChain(trial.map((p) => spellById(p.spellId)), battle.seal)[at];
    if (at === 0) return plan.length ? { kind: 'start', text: '체인 시작' } : undefined;
    if (st.reactionId) return { kind: 'reaction', text: `${reactionById(st.reactionId).name} ×${st.mult}` };
    if (st.linked) return { kind: 'link', text: `LINK ${st.chain} ×${st.mult}` };
    if (spellById(spellId).input === 'none') return { kind: 'start', text: '새 체인' };
    return { kind: 'break', text: st.sealed ? '봉인됨' : '끊김' };
  };

  /** 계획을 복제한 전투에 실제로 돌려 본 결과. 적은 우리 차례 이후, 아군은 라운드 끝 HP. */
  const forecast = (): Map<string, number> => {
    const out = new Map<string, number>();
    try {
      const sim = cloneBattle(battle);
      for (const ev of executeRound(sim, plan)) {
        if (ev.type === 'damage' || ev.type === 'heal') out.set(ev.targetUid, ev.hpAfter);
      }
    } catch {
      // 계획이 유효하지 않으면 예측을 생략한다.
    }
    return out;
  };

  // ── 화면 구성 ────────────────────────────────────────────
  const threatCount = (a: Ally) =>
    battle.enemies.filter((e) => isAlive(e) && e.intent && ((e.intent.kind === 'attack' && e.intent.targetId === a.uid) || e.intent.kind === 'attackAll')).length;

  const allyActor = (a: Ally, i: number, fc: Map<string, number>) => {
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
      // 머리 위 상태: 강화(초록 ▲)와 약화(빨강 ▼), 보호막
      isAlive(a) && (a.statuses.length || a.shield)
        ? h('div', { class: 'actor-status' }, a.shield ? h('span', { class: 'status shield-chip', title: `보호막 ${a.shield}` }, '⛨', h('small', {}, a.shield)) : null, statusRow(a.statuses))
        : null,
    );
    void fc;
    void i;
    actorEls.set(a.uid, el);
    return el;
  };

  const enemyActor = (e: Enemy, focusUid: string | null, fc: Map<string, number>) => {
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
        hpBar(e.hp, e.maxHp, e.shield, alive && plan.length ? fc.get(e.uid) : undefined),
        statusRow(e.statuses),
        boss ? def.traits!.map((t) => h('p', { class: 'trait' }, TRAIT_DESC[t])) : null,
      ),
    );
    actorEls.set(e.uid, el);
    return el;
  };

  /** 체인 트랙: 마름모 노드 넷을 선으로 잇는다. 노드를 누르면 뺀다. */
  const chainTrack = () => {
    const st = steps();
    const last = st[st.length - 1];
    const nextIn = last?.outElement ?? null;
    return h(
      'div',
      { class: 'chain-track', 'aria-label': '시전 순서' },
      Array.from({ length: 4 }, (_, i) => {
        const p = plan[i];
        const link =
          i === 0
            ? null
            : h(
                'div',
                { class: `cn-link ${p ? (st[i].reactionId ? 'react' : st[i].linked ? 'ok' : 'broken') : ''}` },
                p ? h('span', {}, st[i].reactionId ? reactionById(st[i].reactionId!).name : st[i].linked ? `×${st[i].mult}` : st[i].sealed ? '봉인' : '끊김') : null,
              );
        if (!p) return [link, h('div', { class: `q-slot cn empty ${i === plan.length ? 'next' : ''}` }, h('i', {}, NUM[i]))];
        const ally = battle.allies.find((x) => x.uid === p.allyUid)!;
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

  const hotkeys: { uid: string; spellId: string }[] = [];

  /**
   * 주문 카드: 리버스 1999 전투 카드처럼 세로 카드.
   * 위에 비용 별, 가운데 금선 리본 위 인장, 아래 이름과 영문 표식. 고른 카드는 순서 도장이 찍힌다.
   */
  const skillButton = (a: Ally, id: string, planIdx: number, myCost: number) => {
    const unit = unitById(a.defId);
    const sp = spellById(id);
    const chosen = planIdx >= 0 && plan[planIdx].spellId === id;
    const tooCostly = !chosen && sp.cost > remaining() + myCost;
    hotkeys.push({ uid: a.uid, spellId: id });
    const hint = busy || tooCostly ? undefined : linkHint(a.uid, id);
    const hintText = !hint ? null : hint.kind === 'link' ? `×${hint.text.split('×')[1]}` : hint.kind === 'reaction' ? hint.text.split(' ')[0] : hint.kind === 'break' ? '끊김' : null;
    const art = h('span', { class: 'sk-art' });
    art.innerHTML = guillocheSvg(id.length * 1.3 + id.charCodeAt(0) * 0.07);
    art.append(sigilDisc(sp.tag, null));
    const b = h(
      'button',
      {
        type: 'button',
        class: `sk ${chosen ? 'on' : ''} ${hint ? `hint-${hint.kind}` : ''}`,
        style: { '--el': elColor(unit.element) },
        disabled: busy || tooCostly,
        'aria-label': `${unit.name} ${sp.name}, ${TAG_NAMES[sp.tag]}, 성진 ${sp.cost}${hint ? `, ${hint.text}` : ''}`,
        'data-sfx': 'none',
        onclick: () => pickSpell(a, id),
        onmouseenter: () => {
          sound.ui('ui_hover');
          showPeek(a.uid, id);
        },
        onfocus: () => showPeek(a.uid, id),
      },
      h('span', { class: 'sk-top' }, h('span', { class: 'sk-cost', 'aria-hidden': 'true' }, Array.from({ length: sp.cost }, () => h('i'))), h('kbd', { class: 'sk-key', 'aria-hidden': 'true' }, `${hotkeys.length}`)),
      art,
      h('span', { class: 'sk-name' }, sp.name),
      h('span', { class: 'sk-en' }, TAG_EN[sp.tag]),
      hintText ? h('span', { class: 'sk-hint' }, hintText) : null,
      kindleChip(a, id),
      chosen ? h('span', { class: 'sk-order' }, NUM[planIdx]) : null,
    );
    b.dataset.peek = `${a.uid}:${id}`;
    return b;
  };

  /** 극딜 카드: 지금 쌓인 고유 중첩과 그만큼의 배율 */
  const kindleChip = (a: Ally, spellId: string) => {
    const c = consumeOf(spellId);
    if (!c) return null;
    const k = statusStacks(a, c.stack);
    const meta = STATUS_META[c.stack];
    const mult = Math.round((1 + k * c.per) * 10) / 10;
    const ready = k >= Math.ceil(STACK_MAX[c.stack] / 2);
    return h('span', { class: `sk-kindle ${ready ? 'ready' : k ? 'warm' : ''}`, title: `${meta.name} ${k} → 피해 ×${mult}` }, `${meta.glyph}${k} ×${mult}`);
  };

  /** 고유 중첩 게이지: 술사마다 이름과 칸 수가 다르다. 절반부터 준비됨. */
  const kindleGauge = (a: Ally) => {
    const st = stackOf(a);
    if (!st) return null;
    const k = statusStacks(a, st.id);
    const meta = STATUS_META[st.id];
    const ready = k >= Math.ceil(st.max / 2);
    return h(
      'div',
      { class: `sq-kindle ${ready ? 'ready' : ''}`, title: `${meta.name} ${k} / ${st.max} — ${meta.desc}` },
      h('span', { class: 'sq-stack-name' }, meta.name),
      Array.from({ length: st.max }, (_, i) => h('i', { class: i < k ? 'on' : '' })),
      ready ? h('b', {}, 'READY') : null,
    );
  };

  /** 인장 원판: 눈금 고리 + 유형 아이콘 */
  const sigilDisc = (tag: Parameters<typeof glyph>[0], order: string | null) => {
    const disc = h('span', { class: 'sk-disc' });
    disc.innerHTML = sigilRingSvg();
    disc.append(glyph(tag, 'sk-glyph'));
    if (order) disc.append(h('span', { class: 'sk-order' }, order));
    return disc;
  };

  /** 분대 막대: 아군 한 명당 초상·이름·HP 한 칸, 그 위에 이번 라운드 스킬 두 개 */
  const squadBar = (fc: Map<string, number>) => {
    hotkeys.length = 0;
    squadEls.clear();
    return h(
      'div',
      {
        class: 'squad',
        'aria-label': '아군과 이번 라운드 스킬',
        onmouseleave: () => {
          peek = null;
          peekSlot.replaceChildren();
        },
      },
      battle.allies.map((a, i) => {
        const unit = unitById(a.defId);
        const alive = isAlive(a);
        const planIdx = plan.findIndex((p) => p.allyUid === a.uid);
        const myCost = planIdx >= 0 ? spellById(plan[planIdx].spellId).cost : 0;
        const bust = h('div', { class: 'sq-medal' });
        bust.innerHTML = characterBust(a.defId);
        const cell = h(
          'div',
          { class: 'sq-unit', style: { '--el': elColor(unit.element) } },
          bust,
          h(
            'div',
            { class: 'sq-info' },
            h('div', { class: 'sq-name' }, h('b', {}, unit.name), h('small', {}, unit.code)),
            hpBar(a.hp, a.maxHp, a.shield, alive ? fc.get(a.uid) : undefined),
            statusRow(a.statuses),
            kindleGauge(a),
          ),
          h('span', { class: 'sq-num' }, NUM[i]),
          alive && threatCount(a) ? h('span', { class: 'sq-threat', title: '이번 턴 공격받을 예정' }, '!') : null,
        );
        squadEls.set(a.uid, cell);
        return h(
          'div',
          { class: `sq ${alive ? '' : 'dead'} ${planIdx >= 0 ? 'picked' : ''}` },
          h('div', { class: 'sq-skills' }, alive ? (battle.hands[a.uid] ?? []).map((id) => skillButton(a, id, planIdx, myCost)) : h('div', { class: 'sq-down' }, '전투 불능')),
          cell,
        );
      }),
    );
  };

  /** 설명 패널: 고르기 전에 스킬을 자세히 본다 */
  const peekView = () => {
    if (!peek || busy) return null;
    const ally = battle.allies.find((a) => a.uid === peek!.uid);
    if (!ally || !isAlive(ally) || !(battle.hands[ally.uid] ?? []).includes(peek.spellId)) return null;
    const unit = unitById(ally.defId);
    const sp = spellById(peek.spellId);
    const hint = linkHint(ally.uid, sp.id);
    const st = (() => {
      const idx = plan.findIndex((p) => p.allyUid === ally.uid);
      const trial = plan.slice();
      if (idx >= 0) trial[idx] = { allyUid: ally.uid, spellId: sp.id };
      else trial.push({ allyUid: ally.uid, spellId: sp.id });
      return previewChain(trial.map((p) => spellById(p.spellId)), battle.seal)[idx >= 0 ? idx : trial.length - 1];
    })();
    const reaction = st.reactionId ? reactionById(st.reactionId) : null;
    const idx = plan.findIndex((p) => p.allyUid === ally.uid);
    const affordable = (idx >= 0 && plan[idx].spellId === sp.id) || sp.cost <= remaining() + (idx >= 0 ? spellById(plan[idx].spellId).cost : 0);
    const panel = h(
      'aside',
      { class: 'peek', style: { '--el': elColor(unit.element) } },
      h('div', { class: 'peek-head' }, glyph(sp.tag, 'peek-glyph'), h('span', { class: 'peek-owner' }, `${unit.name} · ${TAG_NAMES[sp.tag]}`), h('span', { class: 'peek-cost' }, Array.from({ length: sp.cost }, () => h('i')))),
      h('h3', {}, sp.name),
      h('div', { class: 'peek-flow' }, spellFlow(sp), h('span', {}, flowText(sp.input, sp.output))),
      h('p', { class: 'peek-desc' }, sp.desc),
      !affordable ? h('p', { class: 'peek-link break' }, `성진이 부족합니다 (남은 성진 ${remaining()})`) : null,
      affordable ? h('p', { class: `peek-link ${hint?.kind ?? 'start'}` }, !hint || hint.kind === 'start' ? (plan.length && sp.input === 'none' ? '기점 스킬: 앞의 체인을 닫고 새 체인을 엽니다.' : '첫 스킬로 체인을 엽니다.') : hint.kind === 'break' ? (st.sealed ? '성식에 막혀 링크가 끊깁니다.' : '앞 스킬과 성속이 맞지 않아 체인이 1로 돌아갑니다.') : `링크 ${st.chain} · 배율 ×${st.mult}`) : null,
      reaction ? h('p', { class: 'peek-reaction' }, h('b', {}, `반응 「${reaction.name}」`), ` ${reaction.desc}`) : null,
    );
    panel.insertAdjacentHTML('beforeend', cornerStars());
    return panel;
  };

  const flowText = (input: string, output: string) => {
    const name = (x: string) => (x === 'none' ? '없음(시작)' : x === 'wild' ? '아무 성속' : x === 'echo' ? '받은 그대로' : ELEMENTS[x as Element].name);
    return `받음 ${name(input)} · 넘김 ${name(output)}`;
  };

  function showPeek(uid: string, spellId: string) {
    if (busy) return;
    peek = { uid, spellId };
    peekSlot.replaceChildren(...[peekView()].filter((x): x is HTMLElement => !!x));
    placePeek();
  }

  /** 설명 패널을 가리킨 카드 바로 위에 띄운다(좁은 화면은 손패 영역 위 전체 폭) */
  function placePeek() {
    const panel = peekSlot.firstElementChild as HTMLElement | null;
    if (!panel || !peek) return;
    const box = root.getBoundingClientRect();
    const dock = dockSlot.querySelector('.squad')?.getBoundingClientRect();
    if (window.matchMedia('(max-width: 980px)').matches || !dock) {
      peekSlot.style.left = '8px';
      peekSlot.style.right = '8px';
      peekSlot.style.bottom = `${box.bottom - (dock?.top ?? box.bottom) + 6}px`;
      return;
    }
    const card = dockSlot.querySelector(`[data-peek="${peek.uid}:${peek.spellId}"]`)?.getBoundingClientRect();
    const w = panel.offsetWidth || 300;
    const cx = card ? card.left + card.width / 2 - box.left : box.width / 2;

    peekSlot.style.right = 'auto';
    peekSlot.style.left = `${Math.max(12, Math.min(box.width - w - 12, cx - w / 2))}px`;
    peekSlot.style.bottom = `${box.bottom - dock.top + 12}px`;
    
  }

  const showToast = (text: string) => {
    const t = h('div', { class: 'toast', role: 'status' }, text);
    scene.append(t);
    setTimeout(() => t.remove(), 1800);
  };

  const showLog = () => modal('전투 기록', h('ol', { class: 'log-list' }, log.slice(-60).reverse().map((l) => h('li', {}, l))), () => {});

  /** 하단: 분대 막대(왼쪽~가운데) + 시전 블록(오른쪽) */
  const dockView = (fc: Map<string, number>) => {
    const st = steps();
    const last = st[st.length - 1];
    const full = last?.chain === 4;
    const left = remaining();
    return h(
      'section',
      { class: 'dock' },
      squadBar(fc),
      h(
        'div',
        { class: 'cast' },
        castSeal(last?.chain ?? 0, last?.mult ?? 1, full, left),
        h(
          'div',
          { class: 'seal-foot' },
          (meter = h('span', { class: 'seal-count', title: `성진 ${battle.stardust} / ${battle.maxStardust} (매 턴 +${battle.mods.stardustPerTurn})` }, h('i', {}, '✦'), ` 성진 `, h('b', {}, `${left}`), ` / ${battle.stardust}`)),
          h(
            'button',
            {
              type: 'button',
              class: 'cast-reset',
              disabled: busy || plan.length === 0,
              title: '초기화 (R)',
              onclick: () => {
                plan = [];
                render();
              },
            },
            '초기화',
          ),
        ),
      ),
    );
  };

  /** 시전 인장: 도는 마법진 + 둘레의 성진 별 + 가운데 체인 수치 */
  const castSeal = (chain: number, mult: number, full: boolean, left: number) => {
    const ring = h('span', { class: 'seal-ring' });
    ring.innerHTML = sealSvg();
    const n = battle.maxStardust;
    return h(
      'button',
      { type: 'button', class: `seal ${plan.length ? '' : 'pass'} ${full ? 'full' : ''}`, disabled: busy, onclick: () => void execute(), 'aria-label': plan.length ? `시전, 체인 ${chain}` : '대기: 성진만 모으기' },
      ring,
      h(
        'span',
        { class: 'seal-dust', 'aria-hidden': 'true' },
        Array.from({ length: n }, (_, i) => h('i', { class: i < left ? 'on' : i < battle.stardust ? 'spend' : '', style: { '--a': `${(i / n) * 300 - 150}deg` } }, '✦')),
      ),
      h(
        'span',
        { class: 'seal-core' },
        h('small', {}, 'CHAIN'),
        h('b', {}, plan.length ? chain : 0),
        h('em', {}, full ? '성좌 완성' : plan.length ? `×${mult}` : ''),
        h('strong', {}, plan.length ? '시전' : '대기'),
      ),
    );
  };

  /** 속성 공명: 이번 전투에서 각 속성으로 이어진 시전 수(공명 주문이 이 값을 쓴다) */
  function attuneRow(): HTMLElement {
    const els = (Object.keys(battle.attune) as Element[]).filter((e) => battle.attune[e] > 0);
    return h(
      'div',
      { class: 'attune-row', title: '속성 공명: 시전마다 내보낸 속성이 1씩 쌓입니다. 공명 주문이 이 값만큼 강해지거나, 해방해 소모합니다.' },
      els.map((e) => h('span', { class: `attune-chip ${battle.attune[e] >= MAX_ATTUNE ? 'max' : ''}`, 'data-el': e, style: { '--el': ELEMENTS[e].color } }, elBadge(e, 'sm'), h('b', {}, battle.attune[e]))),
    );
  }

  function render() {
    actorEls.clear();
    const focus = getFocus(battle);
    const fc = busy ? new Map<string, number>() : forecast();
    queueEl = chainTrack();
    actorLayer.replaceChildren(...battle.allies.map((a, i) => allyActor(a, i, fc)), ...battle.enemies.map((e) => enemyActor(e, focus?.uid ?? null, fc)));
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
          h('div', { class: 'plaque' }, h('span', { class: 'plaque-sub' }, `${run.floor + 1}층 · ${place}`), h('b', {}, `ROUND ${battle.round}`)),
          attuneRow(),
        ),
        h(
          'div',
          { class: 'hud-right' },
          button(app.speed > 1 ? '×2' : '×1', () => {
            app.setSpeed(app.speed > 1 ? 1 : 2);
            render();
          }, { class: 'btn-hud', title: '연출 속도' }),
          button('GFX', () => {
            const label = cycleGraphics();
            showToast(`그래픽: ${label}`);
          }, { class: 'btn-hud', title: `그래픽 품질: ${graphicsLabel()}` }),
          button(sound.preference === 'off' ? '♪̸' : '♪', () => {
            const label = sound.cycle();
            showToast(`소리: ${label}`);
            render();
          }, { class: 'btn-hud', title: `소리: ${sound.label()}` }),
          button('LOG', showLog, { class: 'btn-hud', title: '전투 기록 (L)' }),
          button('?', () => showHelp(), { class: 'btn-hud', title: '플레이 방법' }),
        ),
      ),
      queueEl,
      ...(battle.seal ? [h('div', { class: 'seal-banner' }, '⊘ 성식 — ', elBadge(battle.seal, 'sm'), ` ${ELEMENTS[battle.seal].name}(으)로 가는 링크가 끊깁니다`)] : []),
    );
    dockSlot.replaceChildren(dockView(fc));
    peekSlot.replaceChildren(...[peekView()].filter((x): x is HTMLElement => !!x));
    placePeek();
    drawPreview();
    syncAuras();
  }

  // ── 단축키: 1~8 카드, Space 시전, Backspace 마지막 취소, R 초기화, Tab 대상 전환 ──
  const onKey = (e: KeyboardEvent) => {
    if (!root.isConnected) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (busy || document.querySelector('.modal-backdrop') || battle.outcome !== 'ongoing') return;
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= hotkeys.length) {
      const k = hotkeys[n - 1];
      const ally = battle.allies.find((a) => a.uid === k.uid)!;
      const sp = spellById(k.spellId);
      const idx = plan.findIndex((p) => p.allyUid === ally.uid);
      const myCost = idx >= 0 ? spellById(plan[idx].spellId).cost : 0;
      const chosen = idx >= 0 && plan[idx].spellId === sp.id;
      if (chosen || sp.cost <= remaining() + myCost) {
        showPeek(k.uid, k.spellId);
        pickSpell(ally, k.spellId);
      }
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return;
      e.preventDefault();
      void execute();
    } else if (e.key === 'Backspace') {
      plan.pop();
      render();
    } else if (e.key === 'r' || e.key === 'R') {
      plan = [];
      render();
    } else if (e.key === 'l' || e.key === 'L') {
      showLog();
    }
  };
  document.addEventListener('keydown', onKey);

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
      // 성좌 반응은 시전과 피해 사이에 끼므로 건너뛰고 센다
      if (ev.type === 'cast' || ev.type === 'enemyAct' || ev.type === 'enemyStunned' || ev.type === 'fullChain') break;
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
  const castFx = (tag: SkillTag, caster: string, targets: string[], color: string, focusUid: string | null, element: string) => {
    const fx = stage.fx;
    if (!fx) return;
    const from = chest(caster);
    const motion = characterMotion(battle.allies.find((a) => a.uid === caster)?.defId ?? '');
    // 총잡이와 혜성 성속은 꼬리 긴 혜성탄으로 쏜다
    const shot = (t: string, travel = 0.24, arc = 0.6, delay = 0) =>
      motion === 'shoot' || element === 'comet' ? fx.comet(from, chest(t), color, travel * 0.8, delay) : fx.projectile(from, chest(t), color, travel, arc, delay);
    const uniq = [...new Set(targets)];
    sound.whoosh(tag === 'pierce' || tag === 'finisher' ? 'beam' : tag === 'aoe' || tag === 'resonance' ? 'sweep' : tag === 'mark' ? 'mark' : 'projectile');
    switch (tag) {
      case 'strike':
      case 'execute':
      case 'dot':
      case 'debuff':
      case 'drain':
        uniq.forEach((t) => shot(t));
        break;
      case 'multi':
        targets.forEach((t, i) => shot(t, 0.22, 0.3 + (i % 2) * 0.6, i * 0.09));
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
      case 'charge':
        // 예열: 발밑에 고리가 조여 들고 몸에 빛이 모인다
        fx.ring(feet(caster), color, 2.4, 0.4, 0.7);
        fx.flare(from, color, 1.1, 0.5);
        break;
      case 'finisher':
        // 극딜: 하늘에서 별창이 내리꽂힌다
        for (const t of uniq) {
          const top = stage.actorPos(t, 'top');
          fx.beam(top.clone().add(new THREE.Vector3(0, 9, 0)), chest(t), color);
          fx.flare(chest(t), color, 2.2, 0.5);
        }
        fx.sweep(enemyCenter(), color, 3.5);
        break;
      case 'mark':
        targets.forEach((t, i) => shot(t, 0.18, 0.5, i * 0.07));
        if (focusUid) fx.mark(stage.actorPos(focusUid, 'top'), color);
        break;
      case 'resonance':
        fx.ring(feet(caster), color, 0.4, 4.5, 0.6);
        if (uniq.length > 1) fx.sweep(enemyCenter(), color, 6.5);
        else uniq.forEach((t) => shot(t));
        break;
    }
  };

  /** 한 시전이 만든 결과: 다음 시전·적 차례 전까지의 이벤트를 모은다 */
  const castSummary = (events: BattleEvent[], from: number) => {
    let dmg = 0;
    let hits = 0;
    let heal = 0;
    let shield = 0;
    let dust = 0;
    let reaction: string | null = null;
    const buffs = new Map<string, number>();
    const debuffs = new Map<string, number>();
    for (let i = from + 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'cast' || ev.type === 'enemyAct' || ev.type === 'enemyStunned' || ev.type === 'round') break;
      if (ev.type === 'damage' && ev.source !== 'enemy') {
        dmg += ev.amount;
        hits++;
      } else if (ev.type === 'heal') heal += ev.amount;
      else if (ev.type === 'shield' && !ev.targetUid.startsWith('e')) shield += ev.amount;
      else if (ev.type === 'stardust' && ev.amount > 0) dust += ev.amount;
      else if (ev.type === 'reaction') reaction = reactionById(ev.reactionId).name;
      else if (ev.type === 'status') {
        const meta = STATUS_META[ev.status];
        const label = meta.keyword ? `${meta.name} ${ev.stacks ?? ''}·${ev.turns}` : ev.stacks ? `${meta.name} ${ev.stacks}` : meta.name;
        (meta.debuff ? debuffs : buffs).set(label, 1);
      }
    }
    const chips: HTMLElement[] = [];
    if (dmg) chips.push(h('span', { class: 'rc dmg' }, `피해 ${dmg}`, hits > 1 ? h('small', {}, ` ${hits}타`) : null));
    if (heal) chips.push(h('span', { class: 'rc heal' }, `회복 ${heal}`));
    if (shield) chips.push(h('span', { class: 'rc shield' }, `⛨ 보호막 ${shield}`));
    for (const b of buffs.keys()) chips.push(h('span', { class: 'rc buff' }, `▲ ${b}`));
    for (const d of debuffs.keys()) chips.push(h('span', { class: 'rc debuff' }, `▼ ${d}`));
    if (dust) chips.push(h('span', { class: 'rc dust' }, `✦ 성진 +${dust}`));
    if (reaction) chips.push(h('span', { class: 'rc react' }, `반응 ${reaction}`));
    return chips;
  };

  /** 시전 이름표(스타레일·리버스 1999처럼 위쪽에 크게): 초상, 주문 이름, 유형, 링크, 결과 */
  const plateSlot = h('div', { class: 'plate-slot', 'aria-live': 'polite' });
  const railSlot = h('div', { class: 'rail-slot' });
  const hitSlot = h('div', { class: 'hit-slot' });
  scene.append(plateSlot, railSlot, hitSlot);

  const showSkillPlate = (allyUid: string, spellId: string, chainText: string, linked: boolean, chips: HTMLElement[], step: string) => {
    const ally = battle.allies.find((a) => a.uid === allyUid)!;
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
    const def = enemyById(battle.enemies.find((e) => e.uid === enemyUid)!.defId);
    plateSlot.replaceChildren(h('div', { class: 'skill-plate enemy' }, h('div', { class: 'sp-body' }, h('small', { class: 'sp-who' }, 'ENEMY'), h('b', { class: 'sp-name' }, def.name), h('div', { class: 'sp-meta' }, h('span', { class: 'sp-tag' }, text)))));
  };

  /** 행동 순서 레일: 이번 턴 계획한 시전 넷. 진행 중·완료·실패를 표시한다. */
  const buildRail = (casts: PlannedCast[]) => {
    railSlot.replaceChildren(
      h(
        'ol',
        { class: 'action-rail', 'aria-label': '이번 턴 시전 순서' },
        casts.map((c, i) => {
          const ally = battle.allies.find((a) => a.uid === c.allyUid)!;
          const unit = unitById(ally.defId);
          const bust = h('span', { class: 'ar-bust' });
          bust.innerHTML = characterBust(ally.defId);
          return h('li', { class: 'ar-item', 'data-uid': c.allyUid, style: { '--el': elColor(unit.element) } }, h('span', { class: 'ar-num' }, NUM[i]), bust, h('span', { class: 'ar-name' }, spellById(c.spellId).name), h('span', { class: 'ar-state' }));
        }),
      ),
    );
  };
  const railMark = (uid: string, state: 'active' | 'done' | 'fail', note = '') => {
    const li = railSlot.querySelector<HTMLElement>(`.ar-item[data-uid="${uid}"]`);
    if (!li) return;
    railSlot.querySelectorAll('.ar-item.active').forEach((x) => {
      x.classList.remove('active');
      x.classList.add('done');
    });
    li.classList.remove('active', 'done', 'fail');
    li.classList.add(state);
    const st = li.querySelector('.ar-state');
    if (st) st.textContent = state === 'fail' ? note : state === 'done' ? '✓' : '';
  };

  /** 타격 합계: 연타일수록 숫자가 쌓여 올라간다 */
  let hitTotal = { n: 0, dmg: 0 };
  const bumpHits = (amount: number, color: string) => {
    hitTotal = { n: hitTotal.n + 1, dmg: hitTotal.dmg + amount };
    hitSlot.replaceChildren(h('div', { class: 'hit-total', style: { '--el': color } }, h('b', {}, `${hitTotal.dmg}`), h('small', {}, `${hitTotal.n} HIT${hitTotal.n > 1 ? 'S' : ''} · 총 피해`)));
  };
  const resetHits = () => {
    hitTotal = { n: 0, dmg: 0 };
    hitSlot.querySelector('.hit-total')?.classList.add('out');
  };

  /** 집중선: 화면 가장자리에서 가운데로 모이는 선(만화식 강조) */
  const speedLines = (color: string) => {
    const el = h('div', { class: 'speedlines', style: { '--el': color } });
    scene.append(el);
    setTimeout(() => el.remove(), 650);
  };

  /**
   * 극딜 컷인: 화면이 어두워지고 술사 그림이 사선 띠와 함께 밀려 들어온다.
   * 예열을 몇 중첩 터뜨리는지와 배율을 크게 보여 주고, 시간을 잠깐 늦춘다.
   */
  async function finisherCutIn(uid: string, spellName: string, un: { stack: Stack; stacks: number; mult: number } | null, color: string, target: string | null) {
    const ally = battle.allies.find((a) => a.uid === uid)!;
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
        un
          ? h('span', { class: 'ci-kindle' }, h('i', {}, STATUS_META[un.stack].glyph.repeat(Math.min(un.stacks, 10))), ` ${STATUS_META[un.stack].name} ${un.stacks} 해방 · 피해 ×${un.mult}`)
          : h('span', { class: 'ci-kindle' }, '모은 힘 없이 발동'),
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

  async function play(events: BattleEvent[]) {
    let prevCaster: string | null = null;
    let prevOut: Element | null = null;
    let enemyPhase = false;
    let castIdx = -1;
    let lastTag: SkillTag = 'strike';
    let lastColor = '#ffffff';
    let lastCaster = '';
    let lastTargets: string[] = [];
    const castTotal = events.filter((x) => x.type === 'cast' || x.type === 'skip').length;
    const stats = { dmg: 0, casts: 0, reactions: 0, chain: 0 };
    /** 우리 차례가 끝나면 이번 턴 성과를 잠깐 보여 준다 */
    const turnSummary = async () => {
      if (!stats.casts) return;
      showCallout(
        h(
          'div',
          { class: 'banner turn-summary' },
          h('small', {}, 'YOUR TURN'),
          h('b', {}, `총 피해 ${stats.dmg}`),
          h('span', {}, `시전 ${stats.casts} · 최대 체인 ${stats.chain}${stats.reactions ? ` · 성좌 반응 ${stats.reactions}` : ''}`),
        ),
        'summary',
      );
      await wait(1000);
      clearCallout();
    };
    /**
     * 지금 진행 중인 시전의 연출 상태. 근접 술사는 대상 앞으로 돌진해 타격마다 다른 자세로 베고,
     * 원거리 술사는 타격마다 한 발씩 쏜다. 시전이 끝나면 제자리로 돌아온다.
     */
    let choreo: { caster: string; color: string; motion: string; melee: boolean; dashed: boolean; hits: number; idx: number; tag: SkillTag } | null = null;
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
    /** 이번 시전이 예열을 터뜨렸는지(피해 숫자를 크게) */
    let unleashed = false;
    let lastElement: string = 'star';
    for (let k = 0; k < events.length; k++) {
      const ev = events[k];
      const text = eventText(battle, ev);
      if (text) log.push(text);
      switch (ev.type) {
        case 'cast': {
          await endCast();
          castIdx++;
          unleashed = false;
          stats.chain = Math.max(stats.chain, ev.chain);
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
          const unleash = events.slice(k + 1).find((x): x is Extract<BattleEvent, { type: 'unleash' }> => x.type === 'unleash' && x.allyUid === ev.allyUid);
          const nextCast = events.findIndex((x, j) => j > k && x.type === 'cast');
          const isFinisher = sp.tag === 'finisher' || (!!unleash && (nextCast < 0 || events.indexOf(unleash) < nextCast));
          if (isFinisher) await finisherCutIn(ev.allyUid, sp.name, unleash && (nextCast < 0 || events.indexOf(unleash) < nextCast) ? unleash : null, color, focusAt(events, k));
          // 준비 동작을 먼저 보여 주고 휘두른다
          stage.focus(chest(ev.allyUid), 0.7);
          stage.fx?.castCircle(chest(ev.allyUid), color, sp.cost >= 2 ? 3.8 : 3);
          stage.fx?.gather(chest(ev.allyUid).add(new THREE.Vector3(0.7, 0.1, 0)), color, sp.cost >= 2 ? 26 : 16, 0.42);
          const motion = characterMotion(unit.id);
          const hitCount = lastTargets.length;
          const perHit = hitCount > 0 && PER_HIT_TAGS.has(sp.tag);
          const melee = perHit && (motion === 'thrust' || motion === 'slash' || motion === 'bash');
          // 연출 배경: 무대 뒤가 어두워지고 성속 색 무늬가 깔린다
          stage.setBackdrop(color, SUPPORT_TAGS.has(sp.tag) || sp.tag === 'charge' ? 0.55 : sp.cost >= 2 ? 0.9 : 0.8);
          await wait(360);
          choreo = { caster: ev.allyUid, color, motion, melee, dashed: false, hits: hitCount, idx: 0, tag: sp.tag };
          if (melee) {
            // 대상 앞으로 돌진
            stage.anim(ev.allyUid, 'dash');
            stage.dash(ev.allyUid, lastTargets[0], 0.16);
            stage.afterimage(ev.allyUid, color, 4);
            sound.whoosh('sweep');
            choreo.dashed = true;
          } else stage.anim(ev.allyUid, sp.tag === 'charge' ? 'charge' : SUPPORT_TAGS.has(sp.tag) ? 'channel' : perHit ? (motion === 'shoot' ? 'fire' : 'cast1') : 'cast');
          sound.cast(unit.element, ev.chain, characterMotion(unit.id));
          if (ev.linked) sound.link(ev.chain, prevOut ?? unit.element);
          stage.fx?.magicCircle(feet(ev.allyUid), color, 2.6, 1.1, 'magic_01');
          if (ev.linked && prevCaster) stage.fx?.arc(chest(prevCaster), chest(ev.allyUid), prevOut ? elColor(prevOut) : color);
          resetHits();
          railMark(ev.allyUid, 'active');
          showSkillPlate(
            ev.allyUid,
            ev.spellId,
            ev.linked ? `LINK ${ev.chain} · ×${ev.mult}` : ev.sealed ? '성식 — 링크 끊김' : prevCaster ? '링크 끊김 · 새 체인' : `CHAIN 1${ev.mult !== 1 ? ` · ×${ev.mult}` : ''}`,
            ev.linked,
            castSummary(events, k),
            `${castIdx + 1} / ${castTotal}`,
          );
          stats.casts++;
          await wait(melee ? 180 : 260);
          lastElement = unit.element;
          // 타격마다 따로 그리는 주문은 여기서 투사체를 날리지 않는다(피해 이벤트에서 한 타씩)
          if (!perHit) castFx(sp.tag, ev.allyUid, lastTargets, color, focusAt(events, k), unit.element);
          // 시선이 대상으로 넘어간다
          const tgt = lastTargets[0] ?? focusAt(events, k);
          if (tgt && !SUPPORT_TAGS.has(sp.tag)) stage.focus(lastTargets.length > 1 && new Set(lastTargets).size > 1 ? enemyCenter() : chest(tgt), 0.55);
          else stage.focus(null);
          if (!perHit) stage.glowPulse(sp.cost >= 2 ? 0.18 : 0.1);
          await wait(perHit ? 120 : 460);
          prevCaster = ev.allyUid;
          prevOut = ev.outElement;
          break;
        }
        case 'reaction': {
          const r = reactionById(ev.reactionId);
          const target = focusAt(events, k);
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
          stage.glowPulse(0.5);
          speedLines('#ffd27a');
          showCallout(h('div', { class: 'banner complete-banner' }, h('small', {}, 'CONSTELLATION COMPLETE'), h('b', {}, '성좌 완성')), 'complete');
          await wait(1400);
          break;
        }
        case 'damage': {
          const unit = [...battle.allies, ...battle.enemies].find((u) => u.uid === ev.targetUid)!;
          for (const t of hpTargets(ev.targetUid)) updateHpBar(t, ev.hpAfter, unit.maxHp, ev.shieldAfter);
          const crit = unleashed && ev.source === 'ally';
          // 세게 맞을수록 크게 밀리고 잠깐 멈춘다(역경직)
          const power = crit ? 2.4 : Math.min(2, Math.max(0.6, ev.amount / 14));
          stage.anim(ev.targetUid, 'hit', power);
          if (crit) stage.hitStop(0.14);
          else if (ev.source !== 'burn' && ev.amount >= 12) stage.hitStop(0.06);
          const fx = stage.fx;
          const p = chest(ev.targetUid);
          let finale = false;
          if (ev.source === 'ally' && choreo && choreo.idx < choreo.hits) {
            const c = choreo;
            const i = c.idx++;
            const last = i === c.hits - 1;
            finale = last && (c.hits > 1 || ev.amount >= 12 || crit);
            const col = c.color;
            if (c.melee) {
              // 근접: 타격마다 자세를 바꿔 벤다(내려베기 → 올려베기 → 찌르기 …, 마지막은 뛰어올라 내리꽂기)
              const pose = last && c.hits > 1 ? 'finish' : (['combo1', 'combo2', 'combo3'] as const)[i % 3];
              if (c.tag !== 'aoe') stage.dash(c.caster, ev.targetUid, 0.08);
              stage.anim(c.caster, pose);
              await wait(pose === 'finish' ? 200 : 75);
              const roll = { combo1: -0.9, combo2: 2.3, combo3: 0.1, finish: -1.35 }[pose];
              stage.toon.slash(p, col, pose === 'finish' ? 4.6 : 3.4, roll);
              if (pose === 'finish') stage.toon.slash(p, '#ffffff', 3.8, roll + 0.5, 0.04);
              stage.afterimage(c.caster, col, 2);
            } else {
              // 원거리: 타격마다 한 발
              stage.anim(c.caster, c.motion === 'shoot' ? 'fire' : i % 2 ? 'cast2' : 'cast1');
              stage.toon.shot(chest(c.caster).add(new THREE.Vector3(0.7, 0.15, 0)), p, col, 0.12);
              sound.whoosh(c.motion === 'shoot' ? 'projectile' : 'mark');
              await wait(115);
            }
            stage.toon.hit(p, col, last ? 1.3 : 1);
            stage.kick((i % 2 ? 1 : -1) * (0.025 + 0.01 * Math.min(i, 3)), last ? 1.1 : 0.55);
            stage.hitStop(last ? 0.09 : 0.045);
            onomatopoeia(ev.targetUid, c.motion, finale);
            if (finale) {
              stage.toon.finale(p, col, crit ? 1.5 : 1.1);
              stage.slowMo(0.35, 0.28);
              if (c.hits >= 3 || crit) speedLines(col);
            }
          }
          if (fx) {
            if (ev.source === 'enemy') {
              stage.toon.slash(p, '#e0584a', 2.8, Math.random() * 3);
              stage.toon.hit(p, '#e0584a', 0.9);
              stage.kick(-0.03, 0.4);
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
            } else {
              fx.flare(p, lastColor, 1.3, 0.22);
              fx.sparks(p, lastColor, 8, 6, 0.2);
              fx.light(p, lastColor, 2.4, 0.35);
            }
            // 성속마다 다른 타격 모양(마무리와 큰 일격에만)
            if (ev.source === 'ally' && ev.amount > 0 && (finale || crit)) fx.signature(lastElement, p, lastColor, crit ? 1.4 : 0.9);
          }
          if (crit && stage.fx) {
            stage.impactFrame(lastColor);
            speedLines(lastColor);
            stage.fx.impact(p, lastColor, 2);
            stage.fx.ring(feet(ev.targetUid), lastColor, 1, 8, 0.8, 'circle_03');
            stage.shake(0.55);
            stage.flashScreen(0.18);
          }
          const big = crit || ev.source === 'chain' || ev.source === 'doom' || lastTag === 'execute';
          if (ev.source !== 'enemy' && !enemyPhase) {
            bumpHits(ev.amount, lastColor);
            stats.dmg += ev.amount;
          }
          sound.hit(crit ? 'crit' : ev.amount === 0 && ev.absorbed ? 'blocked' : ev.source === 'ally' ? (lastTag === 'execute' || (lastCaster.length && characterMotion(battle.allies.find((a) => a.uid === lastCaster)?.defId ?? '') === 'slash') ? 'slash' : 'ally') : ev.source === 'erosion' ? 'burn' : ev.source === 'burst' ? 'doom' : ev.source);
          floatText(ev.targetUid, ev.amount > 0 ? `${ev.amount}` : `⛨${ev.absorbed}`, ev.source === 'enemy' ? 'dmg-ally' : ev.source === 'burn' ? 'dmg-burn' : crit ? 'dmg-crit' : big ? 'dmg-big' : 'dmg');
          if (big && !finale) stage.glowPulse(crit ? 0.35 : 0.15);
          await wait(finale ? 420 : crit ? 520 : lastTag === 'multi' ? 170 : 230);
          break;
        }
        case 'heal': {
          const unit = battle.allies.find((u) => u.uid === ev.targetUid);
          if (unit) for (const t of hpTargets(ev.targetUid)) updateHpBar(t, ev.hpAfter, unit.maxHp, unit.shield);
          if (lastTag === 'drain' && ev.targetUid === lastCaster) {
            if (lastTargets[0]) stage.fx?.drainReturn(chest(lastTargets[0]), chest(ev.targetUid), lastColor);
          }
          stage.fx?.heal(chest(ev.targetUid), feet(ev.targetUid), '#8fe0a5');
          sound.heal();
          floatText(ev.targetUid, `+${ev.amount}`, 'heal');
          await wait(130);
          break;
        }
        case 'shield': {
          const unit = [...battle.allies, ...battle.enemies].find((u) => u.uid === ev.targetUid);
          if (unit) for (const t of hpTargets(ev.targetUid)) updateHpBar(t, Number(t.querySelector('.hp-num')?.textContent ?? unit.hp), unit.maxHp, ev.shieldAfter);
          stage.fx?.shield(chest(ev.targetUid), ev.targetUid.startsWith('e') ? '#e0685a' : '#8ec5e0');
          sound.shield();
          floatText(ev.targetUid, `⛨ ${ev.amount}`, 'shield');
          await wait(120);
          break;
        }
        case 'status': {
          const meta = STATUS_META[ev.status];
          const isEnemy = ev.targetUid.startsWith('e');
          if (isEnemy && meta.debuff && ev.status !== 'doom') {
            stage.fx?.debuff(chest(ev.targetUid), lastColor);
            sound.debuff();
          }
          if (!isEnemy && (ev.status === 'atkUp' || ev.status === 'counter' || ev.status === 'taunt')) stage.fx?.buff(chest(ev.targetUid), feet(ev.targetUid), lastColor);
          const ally = battle.allies.find((a) => a.uid === ev.targetUid);
          const sig = ally ? stackOf(ally) : null;
          if (ally && sig && ev.status === sig.id) {
            // 고유 중첩: 오라가 커지고 발밑에서 불길이 솟는다
            const c = elColor(unitById(ally.defId).element);
            const n = ev.stacks ?? 1;
            const max = sig.max;
            stage.setAura(ev.targetUid, n, c, max);
            sound.kindle(Math.round((n / max) * 6), 6);
            stage.fx?.ring(feet(ev.targetUid), c, 2.6, 0.5, 0.5);
            stage.fx?.burn(chest(ev.targetUid).add(new THREE.Vector3(0, -0.6, 0)), c);
            if (ev.targetUid !== lastCaster) stage.anim(ev.targetUid, 'charge');
            floatText(ev.targetUid, n >= max ? `${meta.name} MAX ${meta.glyph}${n}` : `${meta.name} ${meta.glyph}${n}`, n >= Math.ceil(max / 2) ? 'kindle ready' : 'kindle');
            stage.glowPulse(0.08 + (n / max) * 0.2);
            const gauge = squadEls.get(ev.targetUid)?.querySelector('.sq-kindle');
            if (gauge) gauge.replaceWith(kindleGauge(ally) ?? h('span'));
            else squadEls.get(ev.targetUid)?.querySelector('.sq-info')?.append(kindleGauge(ally) ?? h('span'));
            await wait(220);
            break;
          }
          // 각인은 위력·횟수까지, 공명파동은 중첩까지 보여 준다
          const label = meta.keyword ? `${meta.name} ${ev.stacks ?? ''}·${ev.turns}` : ev.stacks ? `${meta.name} ${ev.stacks}` : meta.name;
          floatText(ev.targetUid, `${meta.debuff ? '▼' : '▲'} ${label}`, meta.debuff ? 'debuff' : 'buff');
          await wait(110);
          break;
        }
        case 'purge':
          floatText(ev.targetUid, '정화', 'buff');
          stage.fx?.ring(feet(ev.targetUid), '#ffffff', 0.5, 3, 0.5);
          await wait(110);
          break;
        case 'stardust': {
          if (ev.amount > 0) sound.stardust();
          const f = h('span', { class: 'float stardust-gain' }, `+${ev.amount}`);
          meter.append(f);
          setTimeout(() => f.remove(), 1300);
          await wait(140);
          break;
        }
        case 'skip':
          floatText(ev.allyUid, ev.reason === 'cost' ? '성진 부족' : '시전 불가', 'debuff');
          railMark(ev.allyUid, 'fail', ev.reason === 'cost' ? '성진 부족' : ev.reason === 'stun' ? '기절' : '불가');
          await wait(420);
          break;
        case 'enemyAct':
        case 'enemyStunned': {
          if (!enemyPhase) {
            await endCast();
            enemyPhase = true;
            stage.focus(null);
            stage.fx?.fadeArcs();
            queueEl.querySelectorAll('.q-slot').forEach((q) => q.classList.add('spent'));
            await turnSummary();
            plateSlot.replaceChildren();
            railSlot.replaceChildren();
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
          // 예고 동작: 적이 붉게 빛을 모았다가 덮친다
          stage.focus(chest(ev.enemyUid), 0.35);
          showEnemyPlate(ev.enemyUid, { attack: `공격${ev.intent.kind === 'attack' && ev.intent.targetId ? ` → ${unitLabel(battle, ev.intent.targetId)}` : ''}`, attackAll: '전체 공격', defend: '방어 태세', buff: '힘을 모은다', seal: '성식 — 성속 봉인', charge: '큰 공격 준비' }[ev.intent.kind]);
          stage.fx?.gather(chest(ev.enemyUid), '#ff5a4a', 16, 0.36);
          await wait(320);
          stage.anim(ev.enemyUid, 'act');
          sound.enemyAct();
          await wait(360);
          stage.focus(null);
          break;
        }
        case 'unleash':
          stage.setAura(ev.allyUid, 0, '#ffffff');
          squadEls.get(ev.allyUid)?.querySelector('.sq-kindle')?.replaceWith(h('span'));
          unleashed = true;
          break;
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
          showCallout(h('div', { class: 'banner release-banner', style: { '--el': ELEMENTS[ev.element].color } }, h('small', {}, 'RESONANCE RELEASE'), h('b', {}, `${ELEMENTS[ev.element].name} 공명 해방 ×${ev.stacks}`)));
          await wait(520);
          clearCallout();
          hudSlot.querySelector('.attune-row')?.replaceWith(attuneRow());
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
    railSlot.replaceChildren();
    resetHits();
    await wait(250);
  }

  async function execute() {
    if (busy) return;
    busy = true;
    const toRun = plan;
    root.classList.add('busy', 'executing');
    peek = null;
    peekSlot.replaceChildren();
    render();
    clearPreview();
    buildRail(toRun);
    const events = executeRound(battle, toRun);
    plan = [];
    await play(events);
    app.save();
    busy = false;
    root.classList.remove('busy', 'executing');
    clearCallout();
    if (battle.outcome === 'ongoing') {
      render();
      // 새 손패가 한 장씩 날아든다
      dockSlot.querySelectorAll<HTMLElement>('.sk').forEach((el, i) => {
        el.classList.add('deal');
        el.style.animationDelay = `${i * 45}ms`;
      });
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
