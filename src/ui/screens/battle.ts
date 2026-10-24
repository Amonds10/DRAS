import * as THREE from 'three';
import { sound } from '../../audio/sound';
import { MAX_ATTUNE, STACK_IDS, cloneBattle, currentPattern, executeRound, getFocus, isAlive, planCost, setFocus, statusStacks } from '../../core/battle';
import { previewChain } from '../../core/link';
import { finishBattle } from '../../core/run';
import type { Ally, BattleEvent, BattleState, Element, Enemy, PlannedCast, SkillTag, SpellDef, Stack, Status, StatusId } from '../../core/types';
import { ELEMENTS, STATUS_COLOR, STATUS_META, reactionById } from '../../data/elements';
import { reactionBox, reactionCodex, reactionEmblem, reactionTag, reactionsFrom } from '../reactions';
import { FLOORS } from '../../data/encounters';
import { TRAIT_DESC, enemyById, moveText } from '../../data/enemies';
import { TAG_NAMES, spellById } from '../../data/spells';
import { ROLE_NAMES, unitById } from '../../data/units';
import { characterBust, characterSvg } from '../../render/characters';
import { characterMotion } from '../../render/rig';
import { floorPreset } from '../../render/three/environment';
import { getStage, type ActorAnim, type FrameShot } from '../../render/three/stage';
import { makeUltimates } from './ultimates';
import type { App } from '../app';
import { h, sleep } from '../dom';
import { glyph } from '../glyphs';
import { cycleGraphics, graphicsLabel } from '../graphics';
import { showHelp } from '../help';
import { NUM, allyName, button, elBadge, elColor, highlight, hpBar, intentView, modal, spellFlow, statusRow, tagChip, tagGroup, updateHpBar } from '../widgets';

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
      const tag = { burn: ' [화상]', erosion: ' [잠식]', bleed: ' [출혈]', self: ' [자해]', burst: ' [각인 폭발]', doom: ' [폭격]', counter: ' [반격]', chain: ' [성좌]', ally: '', enemy: '' }[ev.source];
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
/**
 * 공격 스타일: 같은 술사라도 스킬마다 동작·투사체·카메라가 다르다.
 * 근접(단검·창·방패) / 총 / 마법(지팡이·구슬)마다 몇 가지를 두고, 유형으로 먼저 고른 뒤 나머지는 스킬 이름으로 나눈다.
 */
type AtkStyle = 'combo' | 'rush' | 'spin' | 'uppercut' | 'leap' | 'lunge' | 'barrage' | 'snipe' | 'rain' | 'orbs' | 'pillar' | 'eruption' | 'beam' | 'iai' | 'gunkata';

/** 근접 무기 동작(돌진해서 친다) */
const MELEE_MOTIONS = new Set(['thrust', 'slash', 'bash', 'blade']);

const hashId = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function styleFor(sp: SpellDef, motion: string): AtkStyle {
  const pick = (opts: AtkStyle[]) => opts[hashId(sp.id) % opts.length];
  if (motion === 'pistol') {
    // 쌍권총: 두 손을 번갈아 쏘는 건카타가 기본, 처단·관통은 한 발에 건다
    if (sp.tag === 'execute' || sp.tag === 'pierce') return 'snipe';
    if (sp.tag === 'aoe' || sp.tag === 'multi' || sp.tag === 'finisher') return 'gunkata';
    return pick(['gunkata', 'barrage']);
  }
  if (motion === 'blade') {
    // 검: 한 번 스쳐 지나간 뒤 칼자국이 늦게 터지는 발도가 기본
    if (sp.tag === 'aoe') return 'spin';
    if (sp.tag === 'multi') return 'rush';
    if (sp.tag === 'execute' || sp.tag === 'pierce' || sp.tag === 'finisher') return 'iai';
    return pick(['iai', 'combo']);
  }
  if (motion === 'shoot') {
    if (sp.tag === 'multi') return 'barrage';
    if (sp.tag === 'aoe' || sp.tag === 'delayed') return 'rain';
    if (sp.tag === 'pierce' || sp.tag === 'execute' || sp.tag === 'finisher') return 'snipe';
    return pick(['barrage', 'snipe']);
  }
  if (motion === 'raise') {
    if (sp.tag === 'aoe') return 'eruption';
    if (sp.tag === 'multi') return 'orbs';
    if (sp.tag === 'strike' || sp.tag === 'execute' || sp.tag === 'finisher') return 'pillar';
    return pick(['orbs', 'beam', 'eruption']);
  }
  if (sp.tag === 'aoe') return 'spin';
  if (sp.tag === 'pierce') return 'lunge';
  if (sp.tag === 'execute') return 'leap';
  if (sp.tag === 'multi') return 'rush';
  if (sp.tag === 'finisher') return pick(['leap', 'combo']);
  return pick(['combo', 'uppercut', 'leap', 'rush']);
}

/** 한 시전의 연출 상태 */
interface Choreo {
  caster: string;
  color: string;
  motion: string;
  melee: boolean;
  dashed: boolean;
  hits: number;
  idx: number;
  tag: SkillTag;
  pending: boolean;
  firstHit: boolean;
  last: boolean;
  big: boolean;
  ult: boolean;
  style: AtkStyle;
  element: string;
  /** 주문 이름(극딜 마무리 카드용) */
  spell: string;
}

/** 보조 주문(타격 없음)의 동작 */
function supportPose(tag: SkillTag): ActorAnim {
  if (tag === 'heal' || tag === 'drain') return 'heal';
  if (tag === 'shield') return 'guard';
  if (tag === 'debuff' || tag === 'mark' || tag === 'dot' || tag === 'delayed') return 'hex';
  if (tag === 'charge') return 'charge';
  return 'empower';
}

/** 근접 술사가 돌진해 멈추는 거리: 검기가 날아갈 틈을 남긴다 */
const MELEE_GAP = 2.7;
const HEAL_COLOR = '#56c97f';
/** 아군 전체를 돌보는 보조 동작: 컷에 아군을 모두 남긴다 */
const SUPPORT_SPOT = new Set<ActorAnim>(['heal', 'guard']);
const STACKS: Stack[] = STACK_IDS;

type Hint = { kind: 'link' | 'reaction' | 'break' | 'start'; text: string; reactionId?: string };

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

  const root = h('main', { class: 'battle-wrap bx v5 v7' });
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
  // 손패가 덮는 만큼 장면을 올린다. 시전 중에는 손패가 내려가므로 화면 전체를 쓴다.
  const fitSafeArea = () => stage.setSafeArea(busy ? 40 : window.matchMedia('(max-width: 760px)').matches ? 380 : 300);
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
      // 연출 컷 밖으로 물러난 유닛은 정보판을 감춘다(가까운 화면에서 판들이 뒤엉키지 않게)
      el.classList.toggle('offshot', !stage.inShot(uid));
      el.style.transform = `translate(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px)`;
      el.style.width = `${box.width.toFixed(1)}px`;
      el.style.height = `${box.height.toFixed(1)}px`;
      // 가운데에서 좌우로 half만큼 퍼지는 예고·정보판이 화면 밖으로 나가지 않게 민다
      const ally = !uid.startsWith('e');
      const half = window.innerWidth < 760 ? (ally ? 44 : 62) : ally ? 58 : 120;
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
    if (st.reactionId) return { kind: 'reaction', text: `${reactionById(st.reactionId).name} ×${st.mult}`, reactionId: st.reactionId };
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

  // ── 성좌 트랙(위 가운데): 별 네 개를 잇는 선. 링크는 금선, 반응은 문장, 끊김은 점선 ──
  const openCodex = () => {
    const st = steps();
    modal('성좌 반응', reactionCodex(plan.length ? (st[st.length - 1]?.outElement ?? null) : null), () => {});
  };
  const chainTrack = () => {
    const st = steps();
    const last = st[st.length - 1];
    const nextIn = plan.length ? (last?.outElement ?? null) : null;
    const nextRx = reactionsFrom(nextIn);
    return h(
      'div',
      { class: 'track7', 'aria-label': '시전 순서' },
      h(
        'div',
        { class: 't7-line' },
        Array.from({ length: 4 }, (_, i) => {
          const p = plan[i];
          const link =
            i === 0
              ? null
              : h(
                  'div',
                  {
                    class: `t7-link ${p ? (st[i].reactionId ? 'react' : st[i].linked ? 'ok' : 'broken') : i <= plan.length ? 'wait' : ''}`,
                    style: p && st[i].reactionId ? { '--from': elColor(reactionById(st[i].reactionId!).from), '--to': elColor(reactionById(st[i].reactionId!).to) } : {},
                  },
                  p ? (st[i].reactionId ? reactionTag(st[i].reactionId!, 't7-rx') : h('span', {}, st[i].linked ? `×${st[i].mult}` : st[i].sealed ? '봉인' : '끊김')) : null,
                );
          if (!p) return [link, h('div', { class: `q-slot t7-node empty ${i === plan.length ? 'next' : ''}` }, h('i', {}, '✦'))];
          const ally = allyOf(p.allyUid)!;
          const unit = unitById(ally.defId);
          const sp = spellById(p.spellId);
          const face = h('span', { class: 't7-face' });
          face.innerHTML = characterBust(ally.defId);
          const node = h(
            'button',
            {
              type: 'button',
              class: 'q-slot t7-node',
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
            face,
            st[i].outElement ? h('span', { class: 't7-out' }, elBadge(st[i].outElement!, 'sm')) : null,
          );
          return [link, h('div', { class: 't7-wrap' }, node, h('small', { class: 't7-name' }, sp.name))];
        }).flat(),
      ),
      h(
        'button',
        { type: 'button', class: 't7-next', onclick: openCodex, title: '다음 주문이 이 성속을 받으면 링크가 이어집니다. 눌러서 반응 도감 보기', 'data-sfx': 'none' },
        h('small', {}, plan.length ? '다음에 받으면' : '성좌 반응'),
        nextIn
          ? h('span', { class: 't7-hints' }, elBadge(nextIn, 'sm'), nextRx.length ? nextRx.map((r) => h('span', { class: 't7-hint', style: { '--to': elColor(r.to) } }, h('i', {}, '+'), elBadge(r.to, 'sm'), h('b', {}, r.name))) : h('span', { class: 't7-none' }, '링크만'))
          : h('span', { class: 't7-hints' }, h('b', { class: 't7-codex' }, '도감 ✶')),
      ),
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
            return h('li', { class: `${meta.debuff ? 'debuff' : 'buff'} st-${st.id}` }, h('b', {}, `${meta.debuff ? '▼' : '▲'} ${meta.glyph} ${meta.name}`, h('small', {}, ` ${amount}`)), h('span', {}, meta.desc));
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
              h('div', { class: 'bx-ab-head' }, inHand ? h('small', {}, '이번 손패') : tagChip(sp.tag, 'tag-chip'), h('b', {}, sp.name), spellFlow(sp), h('span', {}, `성진 ${sp.cost}`)),
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
  const flowColor = (v: string) => (v === 'none' ? '#d9c8a0' : v === 'wild' || v === 'echo' ? elColor('star') : elColor(v as Element));
  const card = (a: Ally, id: string, n: number) => {
    const sp = spellById(id);
    const unit = unitById(a.defId);
    const idx = plan.findIndex((p) => p.allyUid === a.uid);
    const chosen = idx >= 0 && plan[idx].spellId === id;
    const myCost = idx >= 0 ? spellById(plan[idx].spellId).cost : 0;
    const tooCostly = !chosen && sp.cost > remaining() + myCost;
    const hint = linkHint(a.uid, id);
    const rx = hint.reactionId ? reactionById(hint.reactionId) : null;
    let ribbon: Node;
    if (rx) {
      const em = h('span', { class: 'rx-em' });
      em.innerHTML = reactionEmblem(rx.id);
      ribbon = h('span', { class: 'c7-hint reaction', style: { '--from': elColor(rx.from), '--to': elColor(rx.to) } }, em, h('b', {}, rx.name));
    } else ribbon = h('span', { class: `c7-hint ${hint.kind}` }, hint.kind === 'link' ? `링크 ${hint.text.replace('LINK ', '').replace(' ', ' · ')}` : hint.text);
    const el = h(
      'button',
      {
        type: 'button',
        class: `card7 ${chosen ? 'on' : ''} ${rx ? 'react' : ''} hint-${hint.kind} tg-${tagGroup(sp.tag)}`,
        style: { '--el': elColor(unit.element), '--in': flowColor(sp.input), '--out': flowColor(sp.output), ...(rx ? { '--from': elColor(rx.from), '--to': elColor(rx.to) } : {}) },
        disabled: busy || tooCostly,
        'data-sfx': 'none',
        onclick: () => {
          pickSpell(a, id);
          showDesc(a.uid, id);
        },
        onmouseenter: () => showDesc(a.uid, id),
        onfocus: () => showDesc(a.uid, id),
        'aria-label': `${unit.name} ${sp.name}, 성진 ${sp.cost}, ${hint.text}`,
      },
      h('span', { class: 'c7-art' }, glyph(sp.tag, 'c7-glyph'), h('span', { class: 'c7-flow' }, spellFlow(sp))),
      h('span', { class: 'c7-cost', title: `성진 ${sp.cost}` }, `${sp.cost}`),
      chosen ? h('span', { class: 'c7-order' }, NUM[idx]) : h('kbd', { class: 'c7-key' }, String(n)),
      h('b', { class: 'c7-name' }, sp.name),
      tagChip(sp.tag, 'c7-chip'),
      ribbon,
    );
    el.dataset.key = `${a.uid}:${id}`;
    return el;
  };

  /** 카드 설명(가리킨 카드 위에 뜨는 쪽지): 문장 설명 + 이 카드가 일으키는 반응 + 다음에 이어질 반응 */
  let descFor: { uid: string; id: string } | null = null;
  const showDesc = (uid: string, id: string) => {
    descFor = { uid, id };
    placeTip();
  };
  const hideDesc = () => {
    descFor = null;
    placeTip();
  };
  const tipView = () => {
    const a = descFor ? allyOf(descFor.uid) : null;
    if (!descFor || !a) return null;
    const sp = spellById(descFor.id);
    const unit = unitById(a.defId);
    const hint = linkHint(a.uid, descFor.id);
    const after = reactionsFrom(sp.output === 'echo' ? null : sp.output);
    return h(
      'div',
      { class: 'tip7', style: { '--el': elColor(unit.element) }, onclick: hideDesc },
      h('div', { class: 't7h' }, tagChip(sp.tag), h('b', {}, sp.name), spellFlow(sp), h('span', {}, `${unit.name} · 성진 ${sp.cost}`)),
      h('p', { class: 'ab-desc' }, highlight(sp.desc)),
      hint.reactionId
        ? reactionBox(hint.reactionId)
        : h('p', { class: `t7-state ${hint.kind}` }, hint.kind === 'link' ? `앞 주문이 넘긴 성속을 받아 링크가 이어집니다 (${hint.text}).` : hint.kind === 'break' ? (hint.text === '봉인됨' ? '성식에 막혀 링크가 끊깁니다.' : '앞 주문과 성속이 맞지 않아 링크가 끊기고 새 체인이 됩니다.') : '체인의 첫 주문이 됩니다.'),
      after.length ? h('div', { class: 't7-after' }, h('small', {}, '다음 주문이 받으면'), after.map((r) => reactionTag(r.id, 'rx-tag mini'))) : null,
    );
  };
  const placeTip = () => {
    const dock = dockSlot.querySelector('.dock7') as HTMLElement | null;
    if (!dock) return;
    dock.querySelector('.tip7')?.remove();
    const tip = tipView();
    if (!tip || busy) return;
    dock.append(tip);
    const key = `${descFor!.uid}:${descFor!.id}`;
    const cardEl = dock.querySelector(`.card7[data-key="${key}"]`) as HTMLElement | null;
    const box = dock.getBoundingClientRect();
    const cx = cardEl ? cardEl.getBoundingClientRect().left + cardEl.offsetWidth / 2 - box.left : box.width / 2;
    const w = Math.min(380, box.width - 8);
    tip.style.width = `${w}px`;
    tip.style.left = `${Math.round(Math.max(4, Math.min(box.width - w - 4, cx - w / 2)))}px`;
    tip.style.setProperty('--arrow', `${Math.round(cx - Math.max(4, Math.min(box.width - w - 4, cx - w / 2)))}px`);
  };

  const castButton = () => {
    const st = steps();
    const last = st[st.length - 1];
    const chain = last?.chain ?? 0;
    const full = chain === 4;
    const rxs = st.filter((x) => x.reactionId).length;
    return h(
      'button',
      { type: 'button', class: `cast7 ${plan.length ? '' : 'pass'} ${full ? 'full' : ''}`, disabled: busy, onclick: () => void execute(), title: plan.length ? '시전 (Space)' : '아무것도 하지 않고 성진만 모은다 (Space)' },
      h('b', {}, plan.length ? '시전' : '대기'),
      h('small', {}, full ? '성좌 완성!' : plan.length ? `체인 ${chain} · ×${last?.mult ?? 1}${rxs ? ` · 반응 ${rxs}` : ''}` : '성진만 모으기'),
    );
  };

  const dockView = () => {
    const left = remaining();
    let n = 0;
    return h(
      'div',
      { class: 'dock7', onmouseleave: () => window.matchMedia('(hover: hover)').matches && hideDesc() },
      h(
        'div',
        { class: 'd7-hands' },
        battle.allies.map((a) => {
          const unit = unitById(a.defId);
          const face = h('span', { class: 'h7-face' });
          face.innerHTML = characterBust(a.defId);
          const order = plan.findIndex((p) => p.allyUid === a.uid);
          return h(
            'div',
            { class: `hand7 ${isAlive(a) ? '' : 'dead'} ${order >= 0 ? 'picked' : ''}`, style: { '--el': elColor(unit.element) } },
            h('div', { class: 'h7-who' }, face, h('b', {}, unit.name), elBadge(unit.element, 'sm')),
            h('div', { class: 'h7-cards' }, isAlive(a) ? (battle.hands[a.uid] ?? []).map((id) => card(a, id, ++n)) : h('p', { class: 'h7-down' }, '전투 불능')),
          );
        }),
      ),
      h(
        'div',
        { class: 'd7-side' },
        h(
          'div',
          { class: 'dust7', title: `성진 ${battle.stardust}/${battle.maxStardust}: 주문마다 비용만큼 쓴다` },
          h('div', { class: 'dust7-n' }, h('small', {}, '성진'), h('b', {}, `${left}`), h('span', {}, `/ ${battle.stardust}`)),
          h('div', { class: 'dust7-pips' }, Array.from({ length: battle.maxStardust }, (_, i) => h('i', { class: i < left ? 'on' : i < battle.stardust ? 'spent' : '' }))),
        ),
        castButton(),
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
          button('반응', openCodex, { class: 'btn-hud btn-codex', title: '성좌 반응 도감' }),
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
    requestAnimationFrame(placeTip);
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
  const ults = makeUltimates({
    stage,
    scene,
    wait: (ms) => wait(ms),
    later: (ms, fn) => setTimeout(fn, ms / app.speed),
    chest: (uid) => chest(uid),
    feet: (uid) => feet(uid),
    enemyCenter: () => enemyCenter(),
    allies: () => battle.allies.filter(isAlive).map((a) => a.uid),
  });
  const enemyCenter = () => {
    const living = battle.enemies.filter((e) => !actorEls.get(e.uid)?.classList.contains('dying'));
    const pts = (living.length ? living : battle.enemies).map((e) => chest(e.uid));
    return pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
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
    const buffs = new Set<StatusId>();
    const debuffs = new Set<StatusId>();
    for (let i = from + 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'cast' || ev.type === 'enemyAct' || ev.type === 'enemyStunned' || ev.type === 'round') break;
      if (ev.type === 'damage' && ev.source !== 'enemy') {
        dmg += ev.amount;
        hits++;
      } else if (ev.type === 'heal') heal += ev.amount;
      else if (ev.type === 'shield' && !ev.targetUid.startsWith('e')) shield += ev.amount;
      else if (ev.type === 'reaction') reaction = reactionById(ev.reactionId).name;
      else if (ev.type === 'status') (STATUS_META[ev.status].debuff ? debuffs : buffs).add(ev.status);
    }
    const chips: HTMLElement[] = [];
    if (dmg) chips.push(h('span', { class: 'rc dmg' }, `피해 ${dmg}`, hits > 1 ? h('small', {}, ` ${hits}타`) : null));
    if (reaction) chips.push(h('span', { class: 'rc react' }, `반응 ${reaction}`));
    if (heal) chips.push(h('span', { class: 'rc heal' }, `회복 ${heal}`));
    if (shield) chips.push(h('span', { class: 'rc shield' }, `⛨ ${shield}`));
    for (const b of buffs) chips.push(h('span', { class: `rc buff st-${b}` }, `▲ ${STATUS_META[b].glyph} ${STATUS_META[b].name}`));
    for (const d of debuffs) chips.push(h('span', { class: `rc debuff st-${d}` }, `▼ ${STATUS_META[d].glyph} ${STATUS_META[d].name}`));
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
          h('div', { class: 'sp-meta' }, tagChip(sp.tag, 'sp-tag'), h('span', { class: `sp-link ${linked ? 'on' : ''}` }, chainText)),
          chips.length ? h('div', { class: 'sp-result' }, chips) : null,
        ),
      ),
    );
  };
  const showEnemyPlate = (enemyUid: string, text: string) => {
    const def = enemyById(enemyOf(enemyUid)!.defId);
    plateSlot.replaceChildren(h('div', { class: 'skill-plate enemy' }, h('div', { class: 'sp-body' }, h('small', { class: 'sp-who' }, 'ENEMY'), h('b', { class: 'sp-name' }, def.name), h('div', { class: 'sp-meta' }, h('span', { class: 'sp-tag' }, text)))));
  };

  /**
   * 스킬 카메라: 스타일마다 다른 화면으로 잡는다(옆에서 따라가기·올려다보기·높이 내려다보기·어깨 너머).
   * 시전이 끝나면 평소 카메라로 돌아온다.
   */
  /** 컷 번호: 늦게 도착한 '카메라 원위치'가 다음 스킬의 컷을 지우지 않게 한다 */
  let shotSeq = 0;
  /** 몇 번째 컷인가: 같은 스킬이라도 라운드·순서마다 다른 각도를 고른다 */
  let shotCount = 0;
  /**
   * 투샷 각도 모음. 모두 시전자와 대상을 한 화면에 담고 그 가운데를 화면 중앙에 둔다.
   * yaw +는 적 쪽에서 아군 얼굴을, -는 아군 어깨 뒤에서 적을 본다. orbit은 컷 동안 도는 양, push는 다가가는 정도.
   */
  const ANGLES: Record<string, Omit<FrameShot, 'uids'>> = {
    // 정면 2D 구도만 쓴다. pan: 화면 가운데를 시전자(-) ~ 대상(+) 쪽으로, push: 1보다 작을수록 가깝게
    wide: { push0: 1.06, push1: 0.98, pan0: 0, pan1: 0.05 },
    track: { push0: 1, push1: 0.9, pan0: -0.5, pan1: 0.35, dur: 1.3 },
    caster: { push0: 0.86, push1: 0.8, pan0: -0.55, pan1: -0.4, lift: 0.2 },
    target: { push0: 0.9, push1: 0.8, pan0: 0.35, pan1: 0.6 },
    low: { push0: 0.95, push1: 0.86, pitch: -0.05, lift: 0.7, pan0: -0.1, pan1: 0.15, roll: -0.025 },
    high: { push0: 1.04, push1: 0.96, pitch: 0.14, lift: -0.3 },
    dutch: { push0: 0.92, push1: 0.84, roll: 0.055, pan0: 0.1, pan1: 0.25 },
    punch: { push0: 1, push1: 0.76, dur: 0.6, pan0: 0.1, pan1: 0.3 },
    pull: { push0: 0.82, push1: 1.02, dur: 1.4 },
    tele: { push0: 0.8, push1: 0.74, fov: 22, pan0: 0.45, pan1: 0.55 },
  };
  /** 스타일마다 어울리는 구도 후보 */
  const STYLE_ANGLES: Record<AtkStyle, string[]> = {
    combo: ['track', 'wide', 'dutch'],
    rush: ['track', 'dutch', 'punch'],
    spin: ['high', 'pull', 'wide'],
    uppercut: ['low', 'target'],
    leap: ['low', 'high', 'punch'],
    lunge: ['track', 'caster'],
    barrage: ['caster', 'track', 'wide'],
    snipe: ['tele', 'caster'],
    rain: ['high', 'pull'],
    pillar: ['low', 'target', 'wide'],
    eruption: ['high', 'low'],
    beam: ['track', 'caster', 'dutch'],
    orbs: ['track', 'wide', 'target'],
    iai: ['wide', 'track'],
    gunkata: ['caster', 'dutch', 'track'],
  };
  /** 마무리 타격은 다른 구도로 끊어 한 번 더 조인다 */
  const FINISH_ANGLES = ['punch', 'target', 'dutch', 'low'];
  /** 타격마다 끊는 컷: 확대(push)·패닝(pan)·기울기(roll) */
  const HIT_BEATS = [
    { push: 0.92, pan: 0.12, roll: 0.02 },
    { push: 0.84, pan: 0.28, roll: -0.03 },
    { push: 0.96, pan: -0.06, roll: 0.012 },
    { push: 0.8, pan: 0.36, roll: -0.04 },
  ];

  const pickAngle = (opts: string[], seed: number) => ANGLES[opts[seed % opts.length]];
  const castShot = (caster: string, style: AtkStyle | null, tag: SkillTag, targets: string[], seed: number) => {
    const uniq = [...new Set(targets)];
    shotCount++;
    shotSeq++;
    let uids = [caster, ...uniq];
    let angle: Omit<FrameShot, 'uids'>;
    if (style) angle = pickAngle(STYLE_ANGLES[style], seed + shotCount);
    else {
      // 보조 주문: 치유·방어는 아군 줄 전체, 저주는 대상까지, 강화는 시전자와 가장 가까운 적
      const pose = supportPose(tag);
      const allies = battle.allies.filter(isAlive).map((a) => a.uid);
      const focus = getFocus(battle)?.uid;
      if (pose === 'heal' || pose === 'guard') {
        uids = allies;
        angle = pose === 'heal' ? { pitch: 0.1, push0: 1.04, push1: 0.94 } : { pitch: -0.03, push0: 1, push1: 0.92, lift: 0.4 };
      } else if (pose === 'hex') {
        uids = focus ? [caster, focus] : [caster];
        angle = pickAngle(['track', 'target'], seed + shotCount);
      } else {
        uids = focus ? [caster, focus] : [caster];
        angle = { ...ANGLES.caster, lift: 0.5, pitch: -0.04 };
      }
    }
    stage.frameShot({ uids, ...angle });
    stage.cinematic(null);
    // 컷 안에는 시전자와 대상만 또렷하게: 앞줄 아군이 화면을 가리지 않는다
    stage.spotlight(style ? [caster, ...uniq] : SUPPORT_SPOT.has(supportPose(tag)) ? battle.allies.map((a) => a.uid) : [caster, ...uniq]);
  };
  /** 마무리 일격 컷: 같은 두 사람을 다른 각도에서 더 가깝게 */
  const finishShot = (c: Choreo, aims: string[]) => {
    const a = FINISH_ANGLES[(shotCount + c.idx) % FINISH_ANGLES.length];
    stage.frameShot({ uids: [c.caster, ...new Set(aims)], ...ANGLES[a], push0: 0.98, push1: 0.86, dur: 0.8, smooth: 0.12 });
  };

  /** 한 타격 단계: 스타일마다 동작·투사체·기다림이 다르다 */
  async function playStage(c: Choreo, index: number, total: number, last: boolean, tgt: string | null, aims: string[], p: THREE.Vector3) {
    const col = c.color;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const from = chest(c.caster).add(V(0.8, 0.15, 0.1));
    const finish = last && total > 1;
    if (finish && !c.ult && aims.length) finishShot(c, aims);
    // 림버스식 타격 컷: 매 타격 확대·패닝·기울기를 번갈아 짧게 끊어 들어간다
    else if (!c.ult && total > 1) stage.shotBeat({ ...HIT_BEATS[(index + shotCount) % HIT_BEATS.length], smooth: 0.07 });
    switch (c.style) {
      case 'combo':
      case 'rush': {
        const rush = c.style === 'rush';
        const pose = finish ? 'finish' : (['combo1', 'combo2', 'combo3'] as const)[index % 3];
        if (tgt) stage.dash(c.caster, tgt, rush ? 0.06 : 0.1, rush ? (index % 2 ? 0.9 : 2) : MELEE_GAP);
        stage.anim(c.caster, pose);
        if (rush) {
          stage.afterimage(c.caster, col, 1);
          stage.fx?.speedLines(feet(c.caster).add(V(-2, 1.4, 0)), p, col, 4);
        }
        if (index === 0 || pose === 'finish') stage.fx?.dust(feet(c.caster), 5, 0.8);
        sound.swing(c.motion, pose === 'finish');
        await wait(pose === 'finish' ? 300 : rush ? 90 : 150);
        const f2 = chest(c.caster).add(V(0.9, pose === 'finish' ? 0.5 : 0.15, 0.1));
        aims.forEach((t, j) => meleeProjectile(c.motion, f2, chest(t), col, pose, j * 0.04));
        stage.kick(pose === 'finish' ? 0.05 : 0.03, pose === 'finish' ? 0.9 : 0.5);
        await wait(pose === 'finish' ? 170 : rush ? 80 : 120);
        const roll = { combo1: -0.9, combo2: 2.3, combo3: 0.1, finish: -1.35 }[pose];
        stage.toon.slash(p, col, pose === 'finish' ? 4.6 : 3.4, roll);
        if (index % 3 === 1) stage.toon.slash(p, col, 3.1, roll + 1.7, 0.06);
        aims.forEach((t) => stage.fx?.elementHit(c.element, chest(t), col, pose === 'finish' ? 1.3 : 0.8));
        if (pose === 'finish') {
          stage.toon.slash(p, col, 4, roll + 0.5, 0.04);
          // 마무리: 엇갈린 칼자국 셋과 바닥 충격
          stage.fx?.slash(p.clone().add(V(0.2, 0.3, 0)), col, 2.6);
          if (c.motion === 'bash' && tgt) stage.fx?.groundCrack(feet(tgt), col, 0.9);
          else if (tgt) stage.fx?.dust(feet(tgt), 6, 1);
        }
        break;
      }
      case 'spin': {
        // 회전 베기: 몸을 돌리며 사방으로 검기를 흩뿌린다
        stage.anim(c.caster, index % 2 ? 'spin2' : 'spin1');
        sound.swing(c.motion, finish);
        await wait(140);
        const at = chest(c.caster);
        stage.toon.spawn('ring', { pos: at, size: finish ? 7 : 5, color: col, life: 0.4 });
        stage.toon.slash(at, col, 3.6, index * 1.3);
        aims.forEach((t, j) => stage.toon.wave(at.clone().add(V(0.5, 0, 0)), chest(t), col, 2.8, 0.13, j * 0.03, (index % 2 ? 0.6 : -0.6) + j * 0.3));
        stage.fx?.ring(feet(c.caster), col, 0.5, 5.5, 0.5);
        stage.fx?.vortex(feet(c.caster).add(V(0, 0.05, 0)), col, finish ? 6 : 4.4, 0.5, true);
        stage.fx?.dust(feet(c.caster), 8, 1.2);
        // 몸 둘레로 칼바람 고리: 비스듬한 칼자국이 원을 그린다
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + index;
          stage.fx?.sprite({ tex: 'trail', color: col, pos: at.clone().add(V(Math.cos(a) * 1.3, Math.sin(a) * 0.5, 0.3)), size: 1.2, to: 2.2, life: 0.28, delay: i * 0.025, rot: a + Math.PI / 2, curve: 'flash', alpha: 0.5 });
        }
        await wait(130);
        aims.forEach((t) => stage.fx?.elementHit(c.element, chest(t), col, finish ? 1.2 : 0.8));
        break;
      }
      case 'uppercut': {
        // 올려치기: 첫 타격은 아래에서 위로 퍼 올리고, 마지막은 공중에서 내리친다
        const pose = finish ? 'slam' : index === 0 ? 'uppercut' : 'combo3';
        if (tgt) stage.dash(c.caster, tgt, 0.1, 1.8);
        stage.anim(c.caster, pose);
        sound.swing(c.motion, finish);
        await wait(pose === 'slam' ? 320 : 150);
        const low = feet(c.caster).add(V(1, 0.4, 0.1));
        aims.forEach((t, j) => {
          if (pose === 'uppercut') stage.toon.wave(low, chest(t).add(V(0, 1.2, 0)), col, 2.6, 0.12, j * 0.04, Math.PI / 2.2);
          else if (pose === 'slam') stage.toon.wave(chest(t).add(V(-0.4, 3.2, 0)), feet(t).add(V(0, 0.4, 0)), col, 3.4, 0.12, j * 0.04, 0);
          else meleeProjectile(c.motion, from, chest(t), col, pose, j * 0.04);
        });
        if (pose === 'uppercut') {
          // 퍼 올린 자리에서 흙과 빛 조각이 솟는다
          stage.fx?.dust(feet(c.caster).add(V(1, 0, 0)), 6, 1);
          aims.forEach((t) => {
            stage.fx?.sprite({ tex: 'trace_05', color: col, pos: feet(t).add(V(0, 1.6, 0.2)), size: [0.6, 1.2], to: [0.3, 4.4], life: 0.32, curve: 'flash' });
            stage.fx?.shards(feet(t).add(V(0, 0.6, 0)), col, 6, 7);
          });
        }
        if (pose === 'slam' && tgt) {
          stage.fx?.ring(feet(tgt), col, 0.6, 6, 0.6, 'rune');
          stage.fx?.groundCrack(feet(tgt), col, 1.1);
          stage.shake(0.35);
        }
        await wait(120);
        stage.toon.slash(p, col, pose === 'slam' ? 4.6 : 3.4, pose === 'uppercut' ? 1.6 : -1.2);
        aims.forEach((t) => stage.fx?.elementHit(c.element, chest(t), col, pose === 'slam' ? 1.3 : 0.9));
        break;
      }
      case 'leap': {
        // 도약: 높이 뛰어올라 위에서 내리꽂는다(땅이 갈라지듯 충격파)
        stage.fx?.dust(feet(c.caster), 10, 1.3);
        stage.fx?.ring(feet(c.caster), '#d8c8a8', 0.4, 3, 0.4);
        if (tgt) stage.dash(c.caster, tgt, 0.12, 1.4);
        stage.anim(c.caster, 'slam');
        sound.swing(c.motion, true);
        await wait(160);
        // 하늘 높이 떠오른 자리에서 아래로 긋는 낙하선
        aims.forEach((t) => stage.fx?.speedLines(chest(t).add(V(-0.6, 5.5, 0)), feet(t).add(V(0, 0.6, 0)), col, 5));
        await wait(140);
        aims.forEach((t, j) => stage.toon.wave(chest(t).add(V(-0.3, 3.6, 0)), feet(t).add(V(0, 0.3, 0)), col, finish ? 4 : 3.2, 0.11, j * 0.04, 0));
        await wait(110);
        aims.forEach((t) => {
          stage.fx?.ring(feet(t), col, 0.5, finish ? 7 : 5, 0.6, 'rune');
          stage.fx?.shards(feet(t).add(V(0, 0.4, 0)), col, 8, 6);
          stage.fx?.groundCrack(feet(t), col, finish ? 1.4 : 1);
          stage.fx?.elementHit(c.element, chest(t), col, 1.2);
        });
        stage.toon.slash(p, col, 4.4, -1.5);
        stage.shake(finish ? 0.45 : 0.3);
        stage.kick(0.04, 1);
        break;
      }
      case 'lunge': {
        // 관통 돌격: 적을 꿰뚫고 지나가며 긴 빛줄기를 남긴다
        if (tgt) stage.dash(c.caster, tgt, 0.09, -0.6);
        stage.anim(c.caster, 'lunge');
        stage.afterimage(c.caster, col, 2);
        sound.swing(c.motion, true);
        await wait(110);
        aims.forEach((t, j) => {
          const to = chest(t);
          stage.toon.beam(from, to.clone().add(V(3, 0, 0)), col, 0.45, 0.35, j * 0.03);
          stage.fx?.comet(from, to, col, 0.08, j * 0.03);
          stage.fx?.speedLines(from, to.clone().add(V(2.4, 0, 0)), col, 7);
          // 꿰뚫고 나간 뒤쪽으로 빛이 뿜어져 나온다
          stage.fx?.sprite({ tex: 'flare4', color: col, pos: to.clone().add(V(1.2, 0, 0.2)), size: 0.6, to: 3, life: 0.3, delay: 0.08 + j * 0.03, curve: 'flash', alpha: 0.6 });
          stage.fx?.sparks(to.clone().add(V(0.8, 0, 0)), col, 12, 9, 0.18);
          stage.fx?.elementHit(c.element, to, col, 1);
        });
        stage.fx?.dust(feet(c.caster), 6, 1);
        await wait(100);
        if (tgt) stage.dash(c.caster, tgt, 0.16, 2.4);
        break;
      }
      case 'barrage': {
        // 연사: 짧은 반동을 반복하며 탄을 흩뿌린다
        stage.anim(c.caster, 'rapid');
        const n = finish ? 3 : 2;
        for (let i = 0; i < n; i++) {
          aims.forEach((t, j) => {
            const to = chest(t).add(V(0, (Math.random() - 0.5) * 0.6, 0));
            const d = i * 0.07 + j * 0.03;
            stage.fx?.muzzle(from, col, to, d);
            stage.fx?.comet(from, to, col, 0.11, d);
            stage.toon.shot(from, to, col, 0.11, d);
            stage.fx?.elementTrail(c.element, from, to, col, 0.11, d);
            setTimeout(() => stage.fx?.elementHit(c.element, to, col, 0.6), ((d + 0.11) * 1000) / app.speed);
          });
          sound.swing('shoot', false);
          await wait(70);
        }
        await wait(80);
        break;
      }
      case 'snipe': {
        // 저격: 숨을 멈추고 조준선이 겨눈 뒤 한 방
        if (index === 0) {
          aims.forEach((t) => {
            stage.toon.beam(from, chest(t), col, 0.05, 0.5);
            // 조준점: 대상 가슴에 작은 표적 고리가 조여 든다
            stage.fx?.sprite({ tex: 'circle_02', color: col, pos: chest(t), size: 2.4, to: 0.5, life: 0.4, curve: 'pulse' });
          });
          stage.fx?.sprite({ tex: 'flare4', color: '#ffffff', pos: from, size: 0.2, to: 1.4, life: 0.3, curve: 'pulse', alpha: 0.8 });
          await wait(320);
        }
        stage.anim(c.caster, 'fire');
        aims.forEach((t, j) => {
          const to = chest(t);
          stage.toon.beam(from, to, col, finish ? 0.8 : 0.5, 0.4, j * 0.03);
          stage.fx?.comet(from, to, col, 0.1, j * 0.03);
          stage.fx?.muzzle(from, col, to, j * 0.03);
          stage.fx?.elementTrail(c.element, from, to, col, 0.1, j * 0.03);
          // 뚫고 나간 탄이 뒤쪽으로 불꽃을 흩뿌린다
          stage.fx?.sprite({ tex: 'trace_02', color: col, pos: to.clone().add(V(1.6, 0, 0.1)), size: [0.4, 1], to: [0.1, 3.6], life: 0.24, delay: 0.1, rot: -Math.PI / 2, curve: 'flash' });
          stage.fx?.sparks(to.clone().add(V(0.6, 0, 0)), col, 14, 10, 0.16);
          stage.fx?.elementHit(c.element, to, col, finish ? 1.4 : 1);
        });
        stage.fx?.sprite({ tex: 'smoke_04', color: '#d8d0c8', pos: from, size: 0.6, to: 2.2, life: 0.8, additive: false, alpha: 0.25, vel: new THREE.Vector3(-0.6, 0.6, 0) });
        stage.kick(-0.03, -0.6);
        sound.swing('shoot', true);
        await wait(140);
        break;
      }
      case 'rain': {
        // 하늘로 쏘아 올린 탄이 적 머리 위로 쏟아진다
        stage.anim(c.caster, 'skyshot');
        stage.fx?.comet(from, from.clone().add(V(2, 9, -1)), col, 0.16);
        stage.fx?.muzzle(from, col, from.clone().add(V(2, 9, -1)));
        sound.swing('shoot', finish);
        await wait(180);
        aims.forEach((t, j) => {
          setTimeout(() => stage.fx?.meteor(chest(t), col), (j * 60) / app.speed);
          // 큰 유성 둘레로 작은 유성이 함께 떨어진다
          for (let i = 0; i < 3; i++) {
            const off = V((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 1);
            const land = feet(t).add(off).add(V(0, 0.3, 0));
            stage.fx?.comet(land.clone().add(V(-2.4, 7, 0)), land, col, 0.2, 0.05 + i * 0.07 + j * 0.05);
            setTimeout(() => stage.fx?.ring(land, col, 0.2, 1.8, 0.35), ((0.25 + i * 0.07 + j * 0.05) * 1000) / app.speed);
          }
          setTimeout(() => {
            stage.fx?.groundCrack(feet(t), col, 0.8);
            stage.fx?.elementHit(c.element, chest(t), col, 1);
          }, ((0.24 + j * 0.06) * 1000) / app.speed);
        });
        await wait(220);
        break;
      }
      case 'pillar': {
        // 낙뢰 기둥: 대상 발밑에 마법진이 열리고 하늘에서 빛기둥이 내리꽂힌다
        stage.anim(c.caster, 'cast2');
        aims.forEach((t) => {
          stage.fx?.magicCircle(feet(t), col, 3.4, 0.9, 'rune');
          // 머리 위 하늘에도 마법진이 열린다
          stage.fx?.sprite({ tex: 'rune_hex', color: col, pos: chest(t).add(V(0, 5.5, 0)), size: 1, to: 3.6, life: 0.7, spin: -1.5, curve: 'pulse', alpha: 0.8 });
        });
        stage.fx?.sprite({ tex: 'rune', color: col, pos: chest(c.caster).add(V(0.4, 1.6, 0.2)), size: 0.6, to: 1.8, life: 0.5, spin: 3, curve: 'pulse' });
        sound.swing('raise', finish);
        await wait(200);
        aims.forEach((t, j) => {
          stage.toon.beam(chest(t).add(V(0, 9, 0)), feet(t), col, finish ? 1.4 : 1, 0.45, j * 0.03);
          stage.toon.pillar(feet(t), col, 8, finish ? 2.6 : 2, 0.7, j * 0.03);
          stage.fx?.groundCrack(feet(t), col, finish ? 1.2 : 0.8);
          stage.fx?.elementHit(c.element, chest(t), col, 0.8);
        });
        stage.shake(finish ? 0.35 : 0.2);
        await wait(140);
        break;
      }
      case 'eruption': {
        // 분출: 땅의 마법진이 부풀다 아래에서 위로 터진다
        stage.anim(c.caster, 'hex');
        aims.forEach((t) => stage.fx?.magicCircle(feet(t), col, finish ? 4.4 : 3.2, 0.8, 'rune_hex'));
        sound.swing('raise', finish);
        await wait(220);
        aims.forEach((t) => stage.fx?.groundCrack(feet(t), col, finish ? 1.3 : 0.9));
        await wait(90);
        aims.forEach((t, j) => {
          stage.toon.pillar(feet(t), col, 5, finish ? 2.4 : 1.8, 0.6, j * 0.04);
          stage.fx?.shards(feet(t).add(V(0, 0.4, 0)), col, 6, 7);
          // 땅에서 솟는 결정 기둥
          for (let i = 0; i < 4; i++) stage.fx?.sprite({ tex: 'shard', color: col, pos: feet(t).add(V((i - 1.5) * 0.5, 0.8, 0.2)), size: [0.3, 0.2], to: [0.5, 2 + Math.random()], life: 0.6, delay: i * 0.04, rot: (i - 1.5) * 0.25, curve: 'flash' });
          stage.fx?.elementHit(c.element, chest(t), col, 1.1);
        });
        await wait(120);
        break;
      }
      case 'beam': {
        // 광선: 손끝에서 곧은 빛줄기를 내뿜는다
        stage.anim(c.caster, 'cast1');
        // 손끝에 빛을 모았다가 내뿜는다
        stage.fx?.sprite({ tex: 'flare4', color: col, pos: from, size: 2.4, to: 0.6, life: 0.2, curve: 'grow' });
        stage.fx?.magicCircle(from.clone().add(V(0.3, 0, 0.2)), col, 1.4, 0.6, 'rune_hex');
        aims.forEach((t, j) => {
          stage.toon.beam(from, chest(t), col, finish ? 0.9 : 0.6, 0.5, j * 0.04);
          stage.fx?.beam(from, chest(t), col);
          stage.fx?.elementTrail(c.element, from, chest(t), col, 0.3, j * 0.04);
          stage.fx?.sparks(chest(t), col, 16, 6, 0.18);
          stage.fx?.elementHit(c.element, chest(t), col, 1);
        });
        sound.whoosh('beam');
        await wait(220);
        break;
      }
      case 'iai': {
        // 발도: 첫 단계에서 대상을 스쳐 지나가며 가는 빛줄 하나만 긋고, 칼자국은 다음 단계들에서 늦게 터진다
        if (index === 0) {
          stage.anim(c.caster, 'guard');
          await wait(170);
          if (tgt) stage.dash(c.caster, tgt, 0.07, -1.6);
          stage.anim(c.caster, 'lunge');
          stage.afterimage(c.caster, col, 3);
          sound.swing('slash', true);
          aims.forEach((t) => {
            const to = chest(t);
            stage.fx?.sprite({ tex: 'trace_06', color: '#ffffff', pos: to.clone().add(V(0, 0, 0.3)), size: [0.06, 8], to: [0.02, 11], life: 0.32, rot: Math.PI / 2, curve: 'flash' });
            stage.fx?.speedLines(from, to.clone().add(V(2.4, 0, 0)), col, 5);
          });
          stage.hitStop(0.08);
          await wait(140);
        } else {
          const rolls = [0.6, -0.7, 1.4, -1.25];
          const roll = rolls[index % rolls.length];
          stage.toon.slash(p, col, finish ? 4.2 : 3.1, roll);
          stage.fx?.crescent(p, col, finish ? 2.4 : 1.7, roll);
          if (finish) stage.toon.slash(p, '#ffffff', 3.4, roll + 1.6, 0.05);
          sound.swing('slash', finish);
          await wait(finish ? 170 : 110);
        }
        aims.forEach((t) => stage.fx?.elementHit(c.element, chest(t), col, index === 0 ? 0.6 : 0.9));
        break;
      }
      case 'gunkata': {
        // 건카타: 앞손·뒷손을 번갈아 쏘며 한 발짝씩 자리를 바꾼다
        const back = index % 2 === 1;
        stage.anim(c.caster, back ? 'rapid' : 'fire');
        const hand = back ? chest(c.caster).add(V(-0.25, -0.3, 0.05)) : from;
        aims.forEach((t, j) => {
          const to = chest(t).add(V(0, (Math.random() - 0.5) * 0.5, 0));
          stage.fx?.muzzle(hand, col, to, j * 0.03);
          stage.toon.shot(hand, to, col, 0.09, j * 0.03);
          stage.fx?.elementTrail(c.element, hand, to, col, 0.09, j * 0.03);
        });
        if (finish) {
          // 마지막은 두 손을 겹쳐 한꺼번에
          aims.forEach((t) => stage.toon.beam(from, chest(t), col, 0.5, 0.3));
          stage.kick(-0.04, -0.7);
        }
        sound.swing('shoot', finish);
        await wait(finish ? 160 : 85);
        break;
      }
      default: {
        // 구체: 빛 구체가 호를 그리며 날아간다
        stage.anim(c.caster, index % 2 ? 'cast2' : 'cast1');
        aims.forEach((t, j) => {
          const to = chest(t);
          if (finish && c.big) stage.toon.beam(from, to, col, 0.7, 0.4, j * 0.04);
          stage.fx?.projectile(from, to, col, 0.26, 0.9 + j * 0.2, j * 0.06);
          stage.fx?.elementTrail(c.element, from, to, col, 0.26, j * 0.06);
          setTimeout(() => stage.fx?.elementHit(c.element, to, col, 0.9), ((0.26 + j * 0.06) * 1000) / app.speed);
          stage.toon.spawn('star', { pos: from, size: 1.2, color: col, life: 0.26, delay: j * 0.06, path: (k) => from.clone().lerp(to, k).add(V(0, Math.sin(k * Math.PI) * (0.9 + j * 0.2), 0)) });
        });
        stage.fx?.magicCircle(chest(c.caster).add(V(0.6, 0.2, 0.2)), col, 1.6, 0.5, 'rune');
        sound.swing(c.motion, finish && c.big);
        await wait(finish ? 280 : 260);
      }
    }
    if (c.tag === 'aoe' && last && c.style !== 'spin') stage.fx?.sweep(enemyCenter(), col, 6.5);
  }

  /** 근접 투사체: 단검은 초승달 검기, 창은 꿰뚫는 창기, 방패는 땅을 타고 가는 충격파 */
  const meleeProjectile = (motion: string, from: THREE.Vector3, to: THREE.Vector3, col: string, pose: string, delay: number) => {
    const fin = pose === 'finish';
    if (motion === 'slash' || motion === 'blade') {
      const tilt = pose === 'combo2' ? 0.55 : -0.45;
      stage.toon.wave(from, to, col, fin ? 3.6 : 2.6, 0.12, delay, tilt);
      if (fin || pose === 'combo3') stage.toon.wave(from, to, col, fin ? 3 : 2.2, 0.12, delay + 0.06, -tilt);
    } else if (motion === 'thrust') {
      stage.toon.wave(from, to, col, fin ? 2.6 : 1.8, 0.1, delay, 0);
      stage.fx?.comet(from, to, col, 0.1, delay);
      if (fin) stage.toon.beam(from, to, col, 0.5, 0.32, delay);
    } else {
      const f = new THREE.Vector3(from.x, 0.6, from.z);
      const t = new THREE.Vector3(to.x, 0.6, to.z);
      stage.toon.wave(f, t, col, fin ? 3.4 : 2.6, 0.14, delay, 0);
      stage.fx?.ring(new THREE.Vector3(from.x, 0, from.z), col, 0.4, fin ? 4 : 2.8, 0.5);
    }
  };

  /** 큰 주문(성진 2 이상) 컷: 화면을 가로지르는 띠와 술사 상반신, 주문 이름. 극딜보다 짧다. */
  async function skillCutIn(uid: string, spellName: string, tag: SkillTag, color: string) {
    const ally = allyOf(uid)!;
    const unit = unitById(ally.defId);
    const fig = h('div', { class: 'ci-fig' });
    fig.innerHTML = characterSvg(ally.defId);
    const el = h(
      'div',
      { class: 'cutin mini', style: { '--el': color } },
      h('div', { class: 'ci-band' }),
      h('div', { class: 'ci-sweep' }),
      fig,
      h('div', { class: 'ci-text' }, h('small', {}, `${unit.name} · ${TAG_NAMES[tag]}`), h('b', {}, spellName)),
    );
    scene.append(el);
    stage.slowMo(0.5, 0.4);
    sound.duck(1);
    await wait(640);
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }

  /** 궁극기 컷신 장치: 위아래 검은 띠(레터박스)와 화면 UI 감추기 */
  let cinemaEl: HTMLElement | null = null;
  const startCinema = () => {
    if (cinemaEl) return;
    cinemaEl = h('div', { class: 'letterbox' }, h('i', { class: 'lb-top' }), h('i', { class: 'lb-bot' }));
    scene.append(cinemaEl);
    root.classList.add('cine');
  };
  const endCinema = () => {
    stage.cinematic(null);
    root.classList.remove('cine');
    const el = cinemaEl;
    cinemaEl = null;
    if (!el) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
  };

  /**
   * 성좌 반응 연출: 화면 가운데 반응 문장이 열리고(두 성속 색), 반응마다 고유한 무대 효과가 터진다.
   * 일식은 해를 달이 가리고, 월몰은 달이 가라앉고, 블랙홀은 적진을 빨아들이고, 유성우는 별똥이 쏟아지고,
   * 초신성은 별이 터지고, 홍염은 불꽃 고리가 휘감고, 조수는 물결이 아군을 쓸고 지나간다.
   */
  async function playReaction(id: string, target: string | null, caster: string) {
    const r = reactionById(id);
    const a = elColor(r.from);
    const b = elColor(r.to);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const t = target ? chest(target) : enemyCenter();
    const tf = target ? feet(target) : new THREE.Vector3(enemyCenter().x, 0, 0);
    const ec = enemyCenter();
    const living = battle.enemies.filter(isAlive).map((e) => e.uid);
    const allies = battle.allies.filter(isAlive).map((x) => x.uid);
    const fx = stage.fx;
    // 반응 문장 컷: 레터박스 + 가운데 문장
    const em = h('div', { class: 'rxc-emblem' });
    em.innerHTML = reactionEmblem(id);
    const cut = h(
      'div',
      { class: `rx-cut rx-${id}`, style: { '--from': a, '--to': b } },
      h('div', { class: 'rxc-wash' }),
      h('div', { class: 'rxc-ring' }),
      em,
      h(
        'div',
        { class: 'rxc-text' },
        h('small', {}, h('span', { class: 'rxc-pair' }, elBadge(r.from, 'sm'), h('i', {}, '×'), elBadge(r.to, 'sm')), ` 성좌 반응 · ${r.en}`),
        h('b', {}, r.name),
        h('span', {}, r.desc),
      ),
    );
    startCinema();
    scene.append(cut);
    sound.reaction(r.from, r.to);
    sound.duck(1.6);
    stage.setBackdrop(b, 0.85);
    stage.slowMo(0.45, 0.5);
    // 반응 컷도 투샷: 반응을 일으킨 술사와 대상(넓은 반응은 적 줄 전체)을 함께 담는다
    const one = target ? [caster, target] : [caster, ...living];
    const lowShot = () => stage.frameShot({ uids: one, ...ANGLES.low, push0: 1.04, push1: 0.86, dur: 1.6, lift: 0.9 });
    const wideShot = () => stage.frameShot({ uids: [caster, ...living], ...ANGLES.high, orbit: 0.32, dur: 1.8, lift: 1.2 });
    switch (id) {
      case 'eclipse': {
        // 일식: 대상 머리 위 해를 검은 달이 덮고, 가장자리로 코로나가 번진다
        lowShot();
        stage.spotlight(one);
        stage.setBackdrop('#1a1420', 0.95);
        const sky = t.clone().add(V(0.3, 2.3, -0.4));
        fx?.sprite({ tex: 'soft', color: a, pos: sky, size: 2.2, to: 3.4, life: 1.6, curve: 'pulse', alpha: 0.9 });
        fx?.sprite({ tex: 'sunburst', color: a, pos: sky, size: 2, to: 6, life: 1.6, spin: 0.4, curve: 'pulse', alpha: 0.7 });
        fx?.sprite({ tex: 'soft', color: '#0d0912', pos: sky.clone().add(V(1.6, 0.4, 0.1)), size: 2.2, to: 2.3, life: 1.5, additive: false, alpha: 0.98, path: (k) => sky.clone().add(V(1.6 * (1 - Math.min(1, k * 1.8)), 0.4 * (1 - Math.min(1, k * 1.8)), 0.1)) });
        await wait(520);
        fx?.ring(sky, '#ffffff', 1, 5, 0.6, 'circle_03');
        fx?.sprite({ tex: 'flare4', color: '#ffffff', pos: sky.clone().add(V(1, 0.7, 0.2)), size: 0.6, to: 3.6, life: 0.5, curve: 'flash' });
        stage.flashScreen(0.12);
        await wait(320);
        fx?.beam(sky, t, b);
        fx?.signature('luna', t, b, 1.4);
        for (let i = 0; i < 5; i++) fx?.sprite({ tex: 'star_04', color: '#fff6c8', pos: t.clone().add(V(Math.cos(i * 1.256) * 0.9, 1.3 + Math.sin(i * 1.256) * 0.2, 0.2)), size: 0.3, to: 0.5, life: 1.2, delay: i * 0.05, curve: 'pulse', path: (k) => t.clone().add(V(Math.cos(i * 1.256 + k * 6) * 0.9, 1.3 + Math.sin(i * 1.256 + k * 6) * 0.2, 0.2)) });
        stage.shake(0.3);
        break;
      }
      case 'moonset': {
        // 월몰: 커다란 초승달이 대상 위로 내려와 땅속 공허로 가라앉는다
        lowShot();
        stage.spotlight(one);
        const top = t.clone().add(V(0.4, 4.6, 0.1));
        fx?.sprite({ tex: 'crescent', color: a, pos: top, size: 2.6, to: 2.2, life: 1.2, rot: -0.4, curve: 'pulse', path: (k) => top.clone().lerp(tf.clone().add(V(0.2, 0.2, 0.1)), k * k) });
        fx?.vortex(tf.clone().add(V(0, 0.05, 0)), b, 5, 1.3, true);
        fx?.magicCircle(tf, b, 4.4, 1.3, 'rune');
        await wait(620);
        fx?.ring(tf, b, 0.5, 6, 0.6);
        fx?.elementHit('void', t, b, 1.6);
        fx?.debuff(t, b);
        for (let i = 0; i < 10; i++) fx?.sprite({ tex: 'smoke_07', color: '#140b22', pos: tf.clone().add(V((Math.random() - 0.5) * 3, 0.3, 0.2)), size: 0.8, to: 2, life: 0.9, delay: i * 0.03, additive: false, alpha: 0.55, vel: V(0, 1.6, 0) });
        stage.shake(0.35);
        break;
      }
      case 'blackhole': {
        // 블랙홀: 적진 가운데 검은 핵이 열리고 사방의 빛을 빨아들인 뒤 터진다
        wideShot();
        stage.spotlight([caster, ...living]);
        const core = ec.clone().add(V(0, 0.6, 0.2));
        fx?.sprite({ tex: 'soft', color: '#000000', pos: core, size: 0.3, to: 2.4, life: 1.1, additive: false, alpha: 0.95, curve: 'pulse' });
        fx?.vortex(core, b, 6, 1.1);
        fx?.vortex(new THREE.Vector3(core.x, 0.05, core.z), a, 8, 1.2, true);
        fx?.gather(core, a, 40, 0.9);
        fx?.gather(core, b, 30, 0.8);
        living.forEach((u) => fx?.drainReturn(chest(u), core, a));
        await wait(760);
        fx?.nova(core, a, b, 1.3);
        fx?.sprite({ tex: 'circle_05', color: b, pos: core, size: 0.5, to: 9, life: 0.5, curve: 'flash' });
        stage.impactFrame(b);
        stage.flashScreen(0.18);
        stage.shake(0.6);
        break;
      }
      case 'meteor': {
        // 유성우: 하늘 가득 별똥이 비스듬히 쏟아진다(실제 피해 세 발은 이어서 크게 떨어진다)
        wideShot();
        stage.spotlight([caster, ...living]);
        stage.setBackdrop('#0f1830', 0.9);
        for (let i = 0; i < 16; i++) {
          const land = new THREE.Vector3(ec.x + (Math.random() - 0.5) * 7, 0.3, (Math.random() - 0.5) * 2);
          const sky = land.clone().add(V(-4 - Math.random() * 2, 9 + Math.random() * 3, 0));
          const d = i * 0.05;
          fx?.comet(sky, land, i % 2 ? a : b, 0.32, d);
          setTimeout(() => {
            fx?.ring(land, i % 2 ? a : b, 0.2, 2, 0.35);
            fx?.sparks(land, b, 6, 4, 0.14);
          }, ((d + 0.32) * 1000) / app.speed);
        }
        await wait(700);
        stage.shake(0.4);
        break;
      }
      case 'supernova': {
        // 초신성: 대상 가슴에서 별이 부풀었다가 금빛으로 폭발한다
        stage.frameShot({ uids: one, ...ANGLES.punch, push0: 1.02, push1: 0.8, dur: 1.4, lift: 0.4 });
        stage.spotlight(one);
        fx?.sprite({ tex: 'flare4', color: a, pos: t, size: 3.6, to: 0.4, life: 0.5, curve: 'grow' });
        fx?.gather(t, b, 36, 0.5);
        await wait(520);
        fx?.nova(t, b, a, 1.6);
        fx?.sprite({ tex: 'sunburst', color: b, pos: t, size: 1, to: 9, life: 0.7, spin: 1, curve: 'flash' });
        fx?.sprite({ tex: 'flare4', color: '#ffffff', pos: t, size: 1, to: 7, life: 0.4, rot: 0.3, curve: 'flash' });
        fx?.shards(t, b, 16, 9);
        stage.impactFrame('#fff2d0');
        stage.flashScreen(0.3);
        stage.shake(0.7);
        stage.hitStop(0.14);
        break;
      }
      case 'flare': {
        // 홍염: 해의 불꽃 고리가 하늘에서 휘어져 대상을 감싸고 불태운다
        lowShot();
        stage.spotlight(one);
        for (let k = 0; k < 3; k++) {
          const s0 = t.clone().add(V(-3 + k, 5, 0.2));
          const mid = t.clone().add(V(-1 + k * 1.2, 6.5, 0.4));
          const curve = new THREE.QuadraticBezierCurve3(s0, mid, t.clone().add(V((k - 1) * 0.5, 0.2, 0.2)));
          for (let i = 0; i < 14; i++) fx?.sprite({ tex: 'flame_02', color: i % 3 ? a : b, pos: s0, size: 1, to: 0.3, life: 0.45, delay: k * 0.12 + i * 0.02, rot: Math.random() * 6, path: (q) => curve.getPoint(Math.min(1, q * 0.6 + i / 14 * 0.4)) });
        }
        await wait(520);
        fx?.burn(t, a);
        fx?.embers(t, a, 24, 2);
        fx?.elementHit('sol', t, a, 1.6);
        fx?.sprite({ tex: 'fire_01', color: a, pos: t, size: 1.6, to: 4, life: 0.7, alpha: 0.7 });
        stage.shake(0.35);
        break;
      }
      case 'tide': {
        // 조수: 달빛 물결이 아군 줄을 쓸고 지나가며 상처를 씻는다
        const ac = allies.map((u) => chest(u)).reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, allies.length));
        stage.frameShot({ uids: allies, ...ANGLES.pull, pitch: 0.1, dur: 1.6, lift: 0.6 });
        stage.spotlight(allies);
        fx?.sprite({ tex: 'crescent', color: a, pos: ac.clone().add(V(0, 4, -0.4)), size: 1, to: 3, life: 1.3, rot: -0.6, curve: 'pulse', behind: true });
        for (let i = 0; i < 2; i++) setTimeout(() => fx?.sweep(new THREE.Vector3(ac.x, 0.6 + i * 0.5, ac.z), i % 2 ? a : b, 7), (i * 140) / app.speed);
        await wait(520);
        allies.forEach((u) => {
          fx?.lightRain(feet(u), '#d8f0ff', 8, 1.2);
          fx?.ring(feet(u), b, 0.3, 2.6, 0.5);
        });
        break;
      }
    }
    await wait(560);
    cut.classList.add('out');
    setTimeout(() => cut.remove(), 450);
    endCinema();
    stage.frameShot(null);
    stage.spotlight(null);
    stage.setBackdrop(null);
  }

  /**
   * 궁극기 컷신: 레터박스가 닫히고 → 발치에서 올려다보는 영웅 숏으로 힘을 모으고 → 컷인 → 어깨 너머로 대상을 겨눈 뒤 공격이 이어진다.
   * 마지막 일격에서 화면이 넓게 빠지며 터지고, 시전이 끝나면 레터박스가 열린다.
   */
  async function ultimateIntro(uid: string, spellName: string, un: { stack: Stack; stacks: number; mult: number } | null, color: string, target: string | null, targets: string[]) {
    startCinema();
    stage.spotlight(target ? [uid, target] : [uid]);
    sound.duck(5);
    const defId = allyOf(uid)!.defId;
    stage.setBackdrop(color, 0.9);
    stage.setAura(uid, 6, color, 6);
    // 준비 동작은 술사마다 다르다(태양을 등지고 뛰어오름, 달이 떠오름, 조준경, 어둠 속으로 사라짐 …)
    await ults.intro(defId, uid, color, target);
    await finisherCutIn(uid, spellName, un, color, target);
    // 조준경(벨라)과 사라진 녹스는 컷인 뒤에도 그 화면을 이어 간다
    if (target && defId !== 'vela' && defId !== 'nox') {
      stage.spotlight([uid, ...targets]);
      stage.frameShot({ uids: [uid, ...new Set(targets)], push0: 1, push1: 0.9, dur: 1.2 });
      await wait(260);
    }
    syncAuras();
  }

  /** 극딜 컷인 */
  async function finisherCutIn(uid: string, spellName: string, un: { stack: Stack; stacks: number; mult: number } | null, color: string, target: string | null) {
    const ally = allyOf(uid)!;
    const unit = unitById(ally.defId);
    const fig = h('div', { class: 'ci-fig' });
    fig.innerHTML = characterSvg(ally.defId);
    const el = h(
      'div',
      { class: 'cutin', style: { '--el': color } },
      h('div', { class: 'ci-rays' }),
      h('div', { class: 'ci-band' }),
      h('div', { class: 'ci-sweep' }),
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
    stage.slowMo(0.3, 0.9);
    stage.shake(0.3);
    await wait(un ? 1450 : 1150);
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
    let choreo: Choreo | null = null;
    /** 방금 터진 반응: 그 반응이 내는 타격을 반응 모양으로 그린다 */
    let reactFx: string | null = null;
    let enemyShots = 0;
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
      // 극딜은 제자리로 돌아가기 전에, 마지막 자세 그대로 여운을 준다
      if (c.ult) await ults.outro(c.caster, c.color, c.spell, hitTotal.dmg);
      if (c.dashed) {
        stage.anim(c.caster, 'dash');
        stage.dash(c.caster, null, 0.22);
        await wait(230);
      }
      stage.anim(c.caster, 'recover');
      stage.setBackdrop(null);
      stage.spotlight(null);
      stage.frameShot(null);
      shotSeq++;
      if (c.ult) endCinema();
      else stage.cinematic(null);
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
            stage.fx?.magicCircle(feet(ev.allyUid), col, 2.2, 0.9, 'rune_hex');
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
          reactFx = null;
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
          const ult = sp.tag === 'finisher' || !!unleash;
          if (ult) await ultimateIntro(ev.allyUid, sp.name, unleash, color, targets[0] ?? null, targets);
          else if (sp.cost >= 2) await skillCutIn(ev.allyUid, sp.name, sp.tag, color);
          stage.focus(chest(ev.allyUid), sp.cost >= 2 ? 0.9 : 0.75);
          if (sp.cost >= 2) stage.fx?.castCircle(chest(ev.allyUid), color, 4.2);
          stage.fx?.gather(chest(ev.allyUid).add(new THREE.Vector3(0.7, 0.1, 0)), color, sp.cost >= 2 ? 26 : 16, 0.42);
          stage.fx?.castAura(unit.element, feet(ev.allyUid), color, sp.cost >= 2);
          const motion = characterMotion(unit.id);
          const staged = slice.some((x) => x.type === 'stage');
          const melee = staged && MELEE_MOTIONS.has(motion);
          stage.setBackdrop(color, SUPPORT_TAGS.has(sp.tag) ? 0.55 : sp.cost >= 2 ? 0.9 : 0.75);
          showSkillPlate(ev.allyUid, ev.spellId, ev.linked ? `LINK ${ev.chain} · ×${ev.mult}` : ev.sealed ? '성식 — 링크 끊김' : prevCaster ? '링크 끊김 · 새 체인' : `CHAIN 1${ev.mult !== 1 ? ` · ×${ev.mult}` : ''}`, ev.linked, castSummary(events, k), `${castIdx + 1} / ${castTotal}`);
          await wait(420);
          const style = styleFor(sp, motion);
          choreo = { caster: ev.allyUid, color, motion, melee, dashed: false, hits: targets.length, idx: 0, tag: sp.tag, pending: false, firstHit: false, last: false, big: sp.cost >= 2, ult, style, element: unit.element, spell: sp.name };
          if (!ult) castShot(ev.allyUid, staged ? style : null, sp.tag, targets, hashId(sp.id) + battle.round);
          if (melee && targets[0]) {
            // 스타일마다 다가서는 법이 다르다: 회전 베기는 적진 가운데로, 관통은 멀리서 노린다
            const gap = style === 'spin' ? 2.2 : style === 'lunge' ? 4.2 : style === 'rush' ? 1.6 : style === 'iai' ? 3.4 : MELEE_GAP;
            stage.anim(ev.allyUid, 'dash');
            stage.dash(ev.allyUid, targets[0], 0.16, gap);
            stage.afterimage(ev.allyUid, color, 2);
            sound.whoosh('sweep');
            choreo.dashed = true;
          } else if (staged) stage.anim(ev.allyUid, style === 'snipe' ? 'aim' : style === 'rain' ? 'skyshot' : motion === 'shoot' || motion === 'pistol' ? 'fire' : style === 'eruption' ? 'hex' : 'cast1');
          else stage.anim(ev.allyUid, supportPose(sp.tag));
          sound.cast(unit.element, ev.chain, motion);
          if (ev.linked) sound.link(ev.chain, prevOut ?? unit.element);
          if (ev.linked && prevCaster) stage.fx?.arc(chest(prevCaster), chest(ev.allyUid), prevOut ? elColor(prevOut) : color);
          resetHits();
          stats.casts++;
          if (!staged) {
            const pose = supportPose(sp.tag);
            const at = chest(ev.allyUid);
            const ft = feet(ev.allyUid);
            if (pose === 'heal') {
              // 치유: 머리 위에서 빛이 쏟아지고 발밑에 축복의 원
              stage.toon.pillar(ft, HEAL_COLOR, 6, 1.5, 1.1);
              stage.fx?.magicCircle(ft, HEAL_COLOR, 3.6, 1.3, 'rune_hex');
              stage.fx?.motes(at.clone().add(new THREE.Vector3(0, 1.2, 0)), HEAL_COLOR);
              // 발밑에 꽃 문양이 피고, 위에서 가는 빛비가 내린다
              stage.fx?.sprite({ tex: 'bloom', color: HEAL_COLOR, pos: ft.clone().add(new THREE.Vector3(0, 0.05, 0)), size: 0.8, to: 3.4, life: 1.1, spin: 0.8, ground: true, curve: 'pulse', alpha: 0.85 });
              stage.fx?.lightRain(ft, '#c8f5d4', 14, 2.2);
              stage.fx?.petals(at.clone().add(new THREE.Vector3(0, 1.4, 0)), '#bff0cc', 8, 2.2);
            } else if (pose === 'guard') {
              // 방어: 앞쪽에 빛의 벽이 서고 충격파가 퍼진다
              stage.fx?.shield(at.clone().add(new THREE.Vector3(0.9, 0, 0.2)), color, 3.1);
              stage.toon.spawn('ring', { pos: at, size: 5, color, life: 0.5 });
              stage.fx?.ring(ft, color, 0.6, 5, 0.7, 'rune');
              // 육각 결계가 앞에 서고, 모서리에 빛이 반짝인다
              stage.fx?.sprite({ tex: 'rune_hex', color, pos: at.clone().add(new THREE.Vector3(1.1, 0.1, 0.3)), size: 3.6, to: 2.8, life: 0.9, spin: 0.6, curve: 'pulse', alpha: 0.7 });
              stage.fx?.twinkle(at.clone().add(new THREE.Vector3(1.1, 0, 0.3)), '#ffffff', 7, 2.2);
              stage.fx?.dust(ft, 6, 1);
              stage.shake(0.15);
            } else if (pose === 'hex') {
              // 저주: 대상 발밑에 어두운 마법진, 손끝에서 연기가 뻗는다
              const f = getFocus(battle);
              if (f) {
                stage.fx?.magicCircle(feet(f.uid), color, 3, 1.2, 'rune');
                stage.fx?.drainReturn(chest(ev.allyUid), chest(f.uid), color);
                // 대상 둘레로 저주가 말려 들고, 검은 연기가 피어오른다
                stage.fx?.vortex(chest(f.uid), color, 2.6, 0.8);
                stage.fx?.vortex(feet(f.uid).add(new THREE.Vector3(0, 0.05, 0)), color, 3.4, 1, true);
                stage.fx?.elementTrail('void', chest(ev.allyUid), chest(f.uid), color, 0.35);
              }
            } else {
              // 강화·축적: 솟구치는 빛기둥과 고리
              stage.toon.pillar(ft, color, 6, 2, 1.1);
              stage.toon.spawn('ring', { pos: at, size: 4.5, color, life: 0.6 });
              stage.fx?.flare(at, color, 1.4, 0.35);
              // 등 뒤로 햇살이 펼쳐지고 불씨가 솟는다
              stage.fx?.sprite({ tex: 'sunburst', color, pos: at.clone().add(new THREE.Vector3(0, 0.6, -0.3)), size: 1.2, to: 5, life: 0.9, spin: 0.5, curve: 'pulse', alpha: 0.55, behind: true });
              stage.fx?.embers(ft.clone().add(new THREE.Vector3(0, 0.6, 0)), color, 14, 1.6);
              stage.fx?.twinkle(at, '#ffffff', 5, 1.6);
            }
            stage.fx?.ring(ft, color, 0.4, 4.2, 0.6);
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
          const p = tgt ? chest(tgt) : enemyCenter();
          const aims = here.length ? [...new Set(here)] : tgt ? [tgt] : [];
          if (c.ult) await ults.play(allyOf(c.caster)!.defId, { caster: c.caster, color: c.color, element: c.element, index: ev.index, total: ev.total, last, tgt, aims, p });
          else await playStage(c, ev.index, ev.total, last, tgt, aims, p);
          break;
        }
        case 'reaction': {
          await endCast();
          const r = reactionById(ev.reactionId);
          stats.reactions++;
          await playReaction(r.id, getFocus(battle)?.uid ?? null, ev.allyUid);
          reactFx = r.id;
          break;
        }
        case 'fullChain': {
          await endCast();
          reactFx = null;
          stage.fx?.goldArcs();
          sound.fullChain();
          sound.duck(1.5);
          const c = enemyCenter();
          stage.fx?.magicCircle(new THREE.Vector3(-3.6, 0, 0.1), '#ffd27a', 8, 1.6, 'rune');
          stage.fx?.nova(c, '#ffd27a', '#ffffff', 1.05);
          stage.flashScreen(0.3);
          stage.shake(0.35);
          stage.punch(c, 1);
          showCallout(h('div', { class: 'banner complete-banner' }, h('small', {}, 'CONSTELLATION COMPLETE'), h('b', {}, '성좌 완성')), 'complete');
          await wait(1400);
          clearCallout();
          break;
        }
        case 'damage': {
          const unit = allyOf(ev.targetUid) ?? enemyOf(ev.targetUid);
          const el = actorEls.get(ev.targetUid);
          if (el && unit && el.querySelector('.hp')) updateHpBar(el, ev.hpAfter, unit.maxHp, ev.shieldAfter);
          // 해방 일격의 큰 섬광은 마지막 단계에만(타격마다 터지면 극딜이 모두 같은 모양이 된다)
          const crit = unleashed && ev.source === 'ally' && !!choreo?.last;
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
            // 단계의 첫 타격만 크게 터뜨리고, 같은 단계의 나머지 타격은 불티만(겹쳐 쌓이면 화면이 어지럽다)
            if (first) stage.toon.hit(p, c.color, c.ult ? 0.6 : c.last ? 1.2 : 0.9);
            else stage.fx?.sparks(p, c.color, 5, 5, 0.15);
            // 마법과 사격은 맞은 자리에서 터진다(마법이 더 크게)
            if (first && !c.melee && !c.ult) {
              stage.toon.magicBlast(p, c.color, c.motion === 'shoot' || c.motion === 'pistol' ? (c.last ? 0.6 : 0.35) : c.last ? 1.2 : 0.8);
              stage.fx?.sparks(p, c.color, c.last ? 18 : 10, 7, 0.22);
              stage.shake(c.last ? 0.3 : 0.15);
            }
            if (first) {
              sound.impact(c.motion, finale || crit);
              stage.kick((c.idx % 2 ? 1 : -1) * (0.025 + 0.01 * Math.min(c.idx, 3)), c.last ? 1.1 : 0.55);
              stage.hitStop(c.last ? 0.1 : 0.05);
            }
            if (finale && !c.ult) {
              stage.toon.finale(p, c.color, crit ? 1.5 : 1.1);
              stage.slowMo(0.35, 0.3);
            }
            if (finale && c.ult) {
              // 궁극기 마지막 일격: 그림은 술사마다의 연출(ultimates.ts)이 그리고, 여기서는 멈춤과 소리만
              stage.hitStop(0.2);
              sound.ultImpact();
            }
          }
          if (fx) {
            if (ev.source === 'enemy') {
              stage.toon.slash(p, '#e0584a', 2.8, Math.random() * 3);
              stage.toon.hit(p, '#e0584a', 0.9);
              stage.kick(-0.03, 0.4);
              stage.shake(0.18);
            } else if (ev.source === 'burn' || ev.source === 'erosion') fx.burn(p, ev.source === 'burn' ? '#ff8a3a' : '#a891e6');
            else if (ev.source === 'bleed' || ev.source === 'self') {
              // 출혈·자해: 붉은 핏방울이 튄다
              fx.sparks(p, '#e0364a', ev.source === 'self' ? 12 : 8, 5, 0.2);
              fx.sprite({ tex: 'scorch_02', color: '#c8283c', pos: p, size: 0.5, to: 1.6, life: 0.4, rot: Math.random() * 6, curve: 'flash', alpha: 0.8 });
            }
            else if (ev.source === 'doom') {
              fx.meteor(feet(ev.targetUid).add(new THREE.Vector3(0, 0.8, 0)), elColor('comet'));
              stage.shake(0.5);
            } else if (ev.source === 'chain') fx.impact(p, '#ffd27a', 1.2);
            else if (ev.source === 'ally' && reactFx === 'meteor') {
              fx.meteor(p, elColor('comet'));
              fx.groundCrack(feet(ev.targetUid), elColor('nebula'), 0.9);
              fx.petals(p, elColor('nebula'), 8, 4);
              stage.shake(0.3);
            } else if (ev.source === 'ally' && reactFx === 'blackhole') {
              fx.vortex(p, elColor('void'), 2.2, 0.5);
              fx.elementHit('comet', p, elColor('comet'), 1);
            }
            else if (ev.source === 'counter') fx.slash(p, elColor('star'), 2);
            else if (!(ev.source === 'ally' && choreo?.pending)) {
              // 연출 중인 스킬의 타격은 위에서 이미 그렸다: 그 밖의 타격(부가 피해 등)만 작은 섬광
              fx.flare(p, lastColor, 1, 0.2);
              fx.sparks(p, lastColor, 6, 6, 0.18);
            }
            if (ev.source === 'ally' && ev.amount > 0 && (finale || crit) && !choreo?.ult) fx.signature(lastElement, p, lastColor, crit ? 1.4 : 0.9);
          }
          if (crit && stage.fx && !choreo?.ult) {
            stage.impactFrame(lastColor);
            stage.fx.impact(p, lastColor, 2);
            stage.shake(0.55);
            stage.flashScreen(0.18);
          }
          if (ev.source !== 'enemy' && ev.source !== 'self' && !enemyPhase) {
            bumpHits(ev.amount, lastColor);
            stats.dmg += ev.amount;
          }
          sound.hit(crit ? 'crit' : ev.amount === 0 && ev.absorbed ? 'blocked' : ev.source === 'ally' ? (['slash', 'blade'].includes(characterMotion(allyOf(lastCaster)?.defId ?? '')) ? 'slash' : 'ally') : ev.source === 'erosion' || ev.source === 'bleed' ? 'burn' : ev.source === 'burst' ? 'doom' : ev.source === 'self' ? 'enemy' : ev.source);
          floatText(ev.targetUid, ev.amount > 0 ? `${ev.amount}` : `⛨${ev.absorbed}`, ev.source === 'enemy' ? 'dmg-ally' : ev.source === 'burn' ? 'dmg-burn' : ev.source === 'erosion' ? 'dmg-erosion' : ev.source === 'bleed' ? 'dmg-bleed' : ev.source === 'self' ? 'dmg-self' : ev.source === 'counter' ? 'dmg-counter' : ev.source === 'burst' ? 'dmg-burst' : ev.source === 'doom' ? 'dmg-doom' : crit ? 'dmg-crit' : ev.source === 'chain' ? 'dmg-big' : 'dmg');
          await wait(finale ? 480 : crit ? 560 : lastTag === 'multi' ? 190 : 250);
          break;
        }
        case 'heal': {
          const unit = allyOf(ev.targetUid) ?? enemyOf(ev.targetUid);
          const el = actorEls.get(ev.targetUid);
          if (unit && el) updateHpBar(el, ev.hpAfter, unit.maxHp, unit.shield);
          const isEnemy = ev.targetUid.startsWith('e');
          const healCol = isEnemy ? '#e0685a' : HEAL_COLOR;
          const healer = choreo?.caster;
          if (!isEnemy && healer && healer !== ev.targetUid && !enemyPhase) {
            stage.fx?.projectile(chest(healer), chest(ev.targetUid), healCol, 0.24, 1.3);
            await wait(150);
          }
          // 스스로 회복(흡혈·월영)은 작은 빛만, 남을 치유할 때만 빛기둥(작은 회복은 가늘게)
          const selfHeal = !healer || healer === ev.targetUid || enemyPhase;
          if (!selfHeal) stage.toon.pillar(feet(ev.targetUid), healCol, ev.amount >= 8 ? 5 : 3.6, ev.amount >= 8 ? 1.4 : 1, 0.8);
          stage.fx?.heal(chest(ev.targetUid), feet(ev.targetUid), healCol);
          if (!isEnemy && !selfHeal) stage.fx?.lightRain(feet(ev.targetUid), '#c8f5d4', 5, 1.1);
          sound.heal();
          floatText(ev.targetUid, `+${ev.amount}`, 'heal');
          await wait(130);
          break;
        }
        case 'shield':
          stage.fx?.shield(chest(ev.targetUid), ev.targetUid.startsWith('e') ? '#e0685a' : '#8ec5e0');
          stage.fx?.twinkle(chest(ev.targetUid), ev.targetUid.startsWith('e') ? '#ffb0a0' : '#e0f2ff', 4, 1.4);
          sound.shield();
          floatText(ev.targetUid, `⛨ ${ev.amount}`, 'shield');
          refreshFoot(ev.targetUid);
          await wait(120);
          break;
        case 'status': {
          const meta = STATUS_META[ev.status];
          const isEnemy = ev.targetUid.startsWith('e');
          if (isEnemy && meta.debuff && ev.status !== 'doom') {
            stage.fx?.debuff(chest(ev.targetUid), STATUS_COLOR[ev.status] ?? lastColor);
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
            floatText(ev.targetUid, `${meta.debuff ? '▼' : '▲'} ${meta.glyph} ${label}`, `${meta.debuff ? 'debuff' : 'buff'} st-${ev.status}`);
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
          {
            // 적의 공격도 투샷: 공격하는 적과 맞는 술사(전체 공격이면 아군 줄)를 한 화면에, 번갈아 다른 각도로
            const it = ev.intent;
            const hitsAll = it.kind === 'attackAll' || it.kind === 'curse' || (it.kind === 'steal' && !!it.power);
            const victims = hitsAll ? battle.allies.filter(isAlive).map((a) => a.uid) : it.targetId ? [it.targetId] : [];
            enemyShots++;
            if (victims.length) stage.frameShot({ uids: [ev.enemyUid, ...victims], ...(hitsAll ? ANGLES.high : enemyShots % 2 ? ANGLES.track : ANGLES.dutch), push0: 1.06, push1: 0.95, dur: 1.1 });
            else stage.frameShot({ uids: [ev.enemyUid], ...ANGLES.low, pad: 2.4, yaw: 0.25 });
          }
          showEnemyPlate(ev.enemyUid, `「${ev.intent.name}」 ${moveText(ev.intent)}${ev.intent.targetId ? ` → ${unitLabel(battle, ev.intent.targetId)}` : ''}`);
          stage.fx?.gather(chest(ev.enemyUid), '#ff5a4a', 16, 0.36);
          await wait(320);
          stage.anim(ev.enemyUid, 'act');
          sound.enemyAct();
          await wait(360);
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
    stage.frameShot(null);
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
    fitSafeArea();
    inspect = null;
    render();
    clearPreview();
    const events = executeRound(battle, toRun);
    plan = [];
    await play(events);
    app.save();
    busy = false;
    root.classList.remove('busy', 'executing');
    stage.spotlight(null);
    fitSafeArea();
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
