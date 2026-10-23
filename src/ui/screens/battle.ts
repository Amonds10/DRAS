import * as THREE from 'three';
import { sound } from '../../audio/sound';
import { BREAK_EFFECT, abilityOf, act, begin, canUltimate, getFocus, isAlive, maxEnergy, setFocus, statusStacks, timeline, validateAction } from '../../core/battle';
import { finishBattle } from '../../core/run';
import type { AbilityDef, Action, Ally, BattleEvent, BattleState, Enemy, SkillTag, Slot, Stack, Status } from '../../core/types';
import { SLOT_EN, SLOT_NAMES, abilityById } from '../../data/abilities';
import { ELEMENTS, STATUS_META } from '../../data/elements';
import { FLOORS } from '../../data/encounters';
import { TRAIT_DESC, enemyById } from '../../data/enemies';
import { ROLE_NAMES, unitById } from '../../data/units';
import { characterBust, characterSvg } from '../../render/characters';
import { characterMotion } from '../../render/rig';
import { floorPreset } from '../../render/three/environment';
import { getStage } from '../../render/three/stage';
import type { App } from '../app';
import { h, sleep } from '../dom';
import { cycleGraphics, graphicsLabel } from '../graphics';
import { showHelp } from '../help';
import { allyName, button, elBadge, elColor, highlight, hpBar, intentView, modal, statusRow, updateHpBar, weakRow } from '../widgets';

/*
 * 전투 화면(스타레일식).
 * - 체력·강인도·상태는 캐릭터 발밑에 붙는다.
 * - 캐릭터(아군·적)를 누르면 강조되고 오른쪽에 상세 정보가 뜬다. 적을 누르면 그 적을 노린다.
 * - 왼쪽은 행동 순서, 오른쪽 아래는 지금 차례 술사의 일반 공격·전투 스킬, 왼쪽 아래는 필살기 초상.
 */

function unitLabel(state: BattleState, uid: string): string {
  const ally = state.allies.find((a) => a.uid === uid);
  if (ally) return allyName(ally);
  const enemy = state.enemies.find((e) => e.uid === uid);
  return enemy ? enemyById(enemy.defId).name : uid;
}

function eventText(state: BattleState, ev: BattleEvent): string | null {
  switch (ev.type) {
    case 'cast':
      return `${unitLabel(state, ev.allyUid)}: ${SLOT_NAMES[ev.slot]} 「${abilityById(ev.abilityId).name}」${ev.targetUid ? ` → ${unitLabel(state, ev.targetUid)}` : ''}`;
    case 'damage': {
      const tag = { burn: ' [화상]', erosion: ' [잠식]', burst: ' [각인 폭발]', doom: ' [폭격]', counter: ' [반격]', break: ' [격파]', ally: '', enemy: '' }[ev.source];
      return `${unitLabel(state, ev.targetUid)} 피해 ${ev.amount}${ev.absorbed ? ` (보호막 ${ev.absorbed})` : ''}${tag}`;
    }
    case 'heal':
      return `${unitLabel(state, ev.targetUid)} 회복 ${ev.amount}`;
    case 'break':
      return `${unitLabel(state, ev.targetUid)} 약점 격파! (${ELEMENTS[ev.element].name})`;
    case 'recover':
      return `${unitLabel(state, ev.targetUid)} 강인도 회복`;
    case 'enemyStunned':
      return `${unitLabel(state, ev.enemyUid)}은(는) 움직이지 못한다`;
    case 'death':
      return `${unitLabel(state, ev.uid)} 쓰러짐`;
    case 'turn':
      return `— ${unitLabel(state, ev.uid)}의 차례 —`;
    default:
      return null;
  }
}

const SUPPORT_TAGS = new Set<SkillTag>(['heal', 'shield', 'buff', 'utility']);
const STACKS: Stack[] = ['solarCore', 'aim', 'tide', 'hunger', 'fortitude', 'wave'];

export function battleScreen(app: App): HTMLElement {
  const run = app.run!;
  const battle = run.battle!;
  const floor = FLOORS[run.floor];
  const stage = getStage();
  let busy = false;
  const log: string[] = [];

  /** 고른 능력: 차례인 술사의 일반 공격·전투 스킬, 또는 아무 술사의 필살기 */
  let chosen: { allyUid: string; slot: Slot } | null = null;
  /** 아군을 고르는 능력의 대상 */
  let allyTarget: string | null = null;
  /** 상세 정보를 보고 있는 유닛 */
  let inspect: string | null = null;

  const root = h('main', { class: 'battle-wrap bx' });
  const scene = h('section', { class: `scene floor-${floor.kind}`, 'aria-label': '전장' });
  const actorLayer = h('div', { class: 'actor-layer' });
  const callout = h('div', { class: 'callout-layer', 'aria-live': 'polite' });
  const hudSlot = h('div', { class: 'hud-slot' });
  const lineSlot = h('div', { class: 'bx-line-slot' });
  const infoSlot = h('div', { class: 'bx-info-slot' });
  const ultSlot = h('div', { class: 'bx-ult-slot' });
  const actSlot = h('div', { class: 'bx-act-slot' });
  const plateSlot = h('div', { class: 'plate-slot', 'aria-live': 'polite' });
  const hitSlot = h('div', { class: 'hit-slot' });
  scene.append(actorLayer, hudSlot, lineSlot, plateSlot, hitSlot, callout, infoSlot);
  root.append(scene, ultSlot, actSlot);

  const actorEls = new Map<string, HTMLElement>();
  const wait = (ms: number) => sleep(ms / app.speed);
  const stackOf = (a: Ally) => unitById(a.defId).stack ?? null;
  const allyOf = (uid: string) => battle.allies.find((a) => a.uid === uid);
  const enemyOf = (uid: string) => battle.enemies.find((e) => e.uid === uid);

  // ── 무대 준비 ────────────────────────────────────────────
  stage.mount(scene, 'battle');
  stage.setScene(floorPreset(run.floor));
  stage.setActors([
    ...battle.allies.map((a) => ({ uid: a.uid, side: 'ally' as const, defId: a.defId, dead: !isAlive(a) })),
    ...battle.enemies.map((e) => ({ uid: e.uid, side: 'enemy' as const, defId: e.defId, dead: !isAlive(e), boss: !!enemyById(e.defId).traits?.length })),
  ]);
  // 아래쪽 행동 패널이 덮는 만큼 무대를 위로 올린다(차례마다 패널 높이가 바뀌어도 화면이 출렁이지 않게 고정값)
  const fitSafeArea = () => stage.setSafeArea(window.matchMedia('(max-width: 760px)').matches ? 290 : 190);
  fitSafeArea();
  const dockObserver = new ResizeObserver(fitSafeArea);
  dockObserver.observe(root);

  // 발밑 정보판·머리 위 예고를 매 프레임 캐릭터 위치에 맞춘다.
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

  const syncAuras = () => {
    for (const a of battle.allies) {
      const st = stackOf(a);
      stage.setAura(a.uid, isAlive(a) && st ? statusStacks(a, st.id) : 0, elColor(unitById(a.defId).element), st?.max ?? 6);
    }
  };

  // ── 선택 ────────────────────────────────────────────────
  const activeAlly = () => (battle.active ? allyOf(battle.active) ?? null : null);
  /** 지금 고른 능력(없으면 차례 술사의 일반 공격) */
  const current = (): { ally: Ally; slot: Slot; ab: AbilityDef } | null => {
    const sel = chosen ?? (battle.active ? { allyUid: battle.active, slot: 'basic' as Slot } : null);
    if (!sel) return null;
    const ally = allyOf(sel.allyUid);
    if (!ally) return null;
    return { ally, slot: sel.slot, ab: abilityOf(ally, sel.slot) };
  };
  const actionOf = (): Action | null => {
    const c = current();
    if (!c) return null;
    const targetUid = c.ab.aim === 'enemy' ? (getFocus(battle)?.uid ?? null) : c.ab.aim === 'ally' ? (allyTarget && isAlive(allyOf(allyTarget)!) ? allyTarget : c.ally.uid) : null;
    return { allyUid: c.ally.uid, slot: c.slot, targetUid };
  };

  const choose = (allyUid: string, slot: Slot) => {
    if (busy || battle.outcome !== 'ongoing') return;
    const c = current();
    if (c && c.ally.uid === allyUid && c.slot === slot) {
      void execute();
      return;
    }
    chosen = { allyUid, slot };
    sound.ui('card_place', 0.45);
    render();
  };

  const onUnitClick = (uid: string) => {
    if (busy) return;
    const c = current();
    if (uid.startsWith('e')) {
      const e = enemyOf(uid);
      if (e && isAlive(e)) setFocus(battle, uid);
    } else if (c?.ab.aim === 'ally' && isAlive(allyOf(uid)!)) allyTarget = uid;
    inspect = inspect === uid ? null : uid;
    sound.ui('ui_toggle', 0.35);
    render();
  };

  // ── 발밑 정보판 ──────────────────────────────────────────
  const threatCount = (a: Ally) =>
    battle.enemies.filter((e) => isAlive(e) && e.intent && ((e.intent.kind === 'attack' && e.intent.targetId === a.uid) || e.intent.kind === 'attackAll')).length;

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

  const energyBar = (a: Ally) => {
    const max = maxEnergy(a);
    const pct = Math.min(100, (a.energy / max) * 100);
    return h('div', { class: `bx-energy ${a.energy >= max ? 'full' : ''}`, title: `필살기 에너지 ${a.energy}/${max}` }, h('i', { style: { width: `${pct}%` } }));
  };

  const toughBar = (e: Enemy) => {
    const pct = (e.toughness / e.maxToughness) * 100;
    return h('div', { class: `bx-tough ${e.broken ? 'broken' : ''}`, title: e.broken ? '격파됨: 다음 차례를 잃는다' : `강인도 ${e.toughness}/${e.maxToughness}` }, h('i', { style: { width: `${e.broken ? 0 : pct}%` } }), e.broken ? h('b', {}, 'BREAK') : null);
  };

  const allyActor = (a: Ally, i: number) => {
    const unit = unitById(a.defId);
    const c = current();
    const alive = isAlive(a);
    const isTarget = alive && c?.ab.aim === 'ally' && (allyTarget ?? c.ally.uid) === a.uid;
    const isAllTarget = alive && c && c.ab.aim === 'none' && c.ab.effects.some((e) => 'target' in e && e.target === 'allAllies');
    const el = h(
      'button',
      {
        type: 'button',
        class: `actor ally bx-unit bx-i${i % 2} ${alive ? '' : 'dead'} ${battle.active === a.uid ? 'turn' : ''} ${inspect === a.uid ? 'inspected' : ''} ${isTarget || isAllTarget ? 'ally-target' : ''}`,
        style: { '--el': elColor(unit.element) },
        disabled: !alive,
        'aria-label': `${unit.name} 상세 보기`,
        onclick: () => onUnitClick(a.uid),
      },
      h(
        'div',
        { class: 'actor-top' },
        battle.active === a.uid && !busy ? h('span', { class: 'bx-turn-tag' }, '차례') : null,
        alive && threatCount(a) ? h('span', { class: 'threat-tag', title: '적이 노리고 있다' }, '!') : null,
      ),
      isTarget ? h('span', { class: 'target-bracket ally', 'aria-label': '대상' }, h('i'), h('i'), h('i'), h('i')) : null,
      h(
        'div',
        { class: 'bx-foot' },
        h('div', { class: 'bx-name' }, h('b', {}, unit.name), elBadge(unit.element, 'sm')),
        hpBar(a.hp, a.maxHp, a.shield),
        alive ? energyBar(a) : null,
        alive ? stackPips(a) : null,
        alive && a.statuses.some((s) => !STACKS.includes(s.id as Stack)) ? statusRow(a.statuses.filter((s) => !STACKS.includes(s.id as Stack) || s.id === 'wave')) : null,
      ),
    );
    actorEls.set(a.uid, el);
    return el;
  };

  const enemyActor = (e: Enemy) => {
    const def = enemyById(e.defId);
    const alive = isAlive(e);
    const c = current();
    const focus = getFocus(battle);
    const aimEnemy = c?.ab.aim === 'enemy';
    const allEnemies = c?.ab.effects.some((x) => x.kind === 'damage' && (x.target === 'allEnemies' || x.target === 'random'));
    const blast = c?.ab.effects.some((x) => x.kind === 'damage' && x.target === 'blast');
    const living = battle.enemies.filter(isAlive);
    const fi = focus ? living.indexOf(focus) : -1;
    const side = blast && alive && fi >= 0 && Math.abs(living.indexOf(e) - fi) === 1;
    const focused = alive && focus?.uid === e.uid && (aimEnemy || !c);
    const el = h(
      'button',
      {
        type: 'button',
        class: `actor enemy bx-unit bx-i${battle.enemies.indexOf(e) % 2} ${alive ? '' : 'dead'} ${focused ? 'focused' : ''} ${side ? 'side-target' : ''} ${allEnemies && alive ? 'all-target' : ''} ${inspect === e.uid ? 'inspected' : ''} ${def.traits?.length ? 'boss' : ''} ${e.broken ? 'broken' : ''}`,
        disabled: !alive,
        'aria-label': `${def.name} — 눌러서 대상 지정·상세 보기`,
        onclick: () => onUnitClick(e.uid),
      },
      h('div', { class: 'actor-top' }, alive ? intentView(e.intent, e, battle.allies) : null),
      focused ? h('span', { class: 'target-bracket', 'aria-label': '대상' }, h('i'), h('i'), h('i'), h('i')) : null,
      h(
        'div',
        { class: 'bx-foot' },
        h('div', { class: 'bx-name' }, focused ? h('span', { class: 'plate-target' }, 'TARGET') : null, h('b', {}, def.name), weakRow(def.weak)),
        hpBar(e.hp, e.maxHp, e.shield),
        alive ? toughBar(e) : null,
        alive && e.statuses.length ? statusRow(e.statuses) : null,
      ),
    );
    actorEls.set(e.uid, el);
    return el;
  };

  // ── 행동 순서 ────────────────────────────────────────────
  const lineView = () => {
    const order = timeline(battle, 7);
    return h(
      'ol',
      { class: 'bx-line', 'aria-label': '행동 순서' },
      order.map((uid, i) => {
        const ally = allyOf(uid);
        const enemy = enemyOf(uid);
        const color = ally ? elColor(unitById(ally.defId).element) : '#e0685a';
        const face = h('span', { class: 'bx-line-face' });
        if (ally) face.innerHTML = characterBust(ally.defId);
        else if (enemy) face.textContent = enemyById(enemy.defId).glyph;
        return h(
          'li',
          { class: `bx-line-item ${ally ? 'ally' : 'enemy'} ${i === 0 ? 'now' : ''}`, style: { '--el': color }, title: unitLabel(battle, uid), onclick: () => onUnitClick(uid) },
          face,
          i === 0 ? h('small', {}, 'NOW') : null,
        );
      }),
    );
  };

  // ── 상세 정보 ────────────────────────────────────────────
  const statusList = (statuses: Status[]) =>
    statuses.length
      ? h(
          'ul',
          { class: 'bx-status-list' },
          statuses.map((st) => {
            const meta = STATUS_META[st.id];
            const amount = meta.keyword ? `위력 ${st.value ?? 0} · 횟수 ${st.turns}` : st.turns >= 90 ? (st.value ? `${st.value}` : '지속') : `${st.value ? `${st.value} · ` : ''}${st.turns}턴`;
            return h(
              'li',
              { class: meta.debuff ? 'debuff' : 'buff' },
              h('b', {}, `${meta.debuff ? '▼' : '▲'} ${meta.glyph} ${meta.name}`, h('small', {}, ` ${amount}`)),
              h('span', {}, meta.desc),
            );
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
          h('div', {}, h('dt', {}, '속도'), h('dd', {}, unit.spd)),
          h('div', {}, h('dt', {}, '에너지'), h('dd', {}, `${ally.energy}/${unit.energy}`)),
          ally.shield ? h('div', {}, h('dt', {}, '보호막'), h('dd', {}, ally.shield)) : null,
        ),
        h('section', {}, h('h4', {}, '상태'), statusList(ally.statuses)),
        h('section', {}, h('h4', {}, `패시브 · ${unit.passive.name}`), h('p', { class: 'ab-desc' }, highlight(unit.passive.desc))),
        h(
          'section',
          {},
          h('h4', {}, '능력'),
          (['basic', 'skill', 'ultimate'] as Slot[]).map((slot) => {
            const ab = abilityOf(ally, slot);
            return h('div', { class: `bx-ab slot-${slot}` }, h('div', { class: 'bx-ab-head' }, h('small', {}, SLOT_NAMES[slot]), h('b', {}, ab.name), slot === 'ultimate' ? h('span', {}, `에너지 ${unit.energy}`) : slot === 'skill' ? h('span', {}, '성진 1') : h('span', {}, '성진 +1')), h('p', { class: 'ab-desc' }, highlight(ab.desc)));
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
        h('header', {}, h('div', { class: 'bx-info-bust glyph' }, def.glyph), h('div', {}, h('small', {}, 'ENEMY'), h('h3', {}, def.name), h('p', {}, '약점 ', weakRow(def.weak)))),
        h(
          'dl',
          { class: 'bx-stats' },
          h('div', {}, h('dt', {}, 'HP'), h('dd', {}, `${enemy.hp}/${enemy.maxHp}`)),
          h('div', {}, h('dt', {}, '강인도'), h('dd', {}, enemy.broken ? '격파' : `${enemy.toughness}/${enemy.maxToughness}`)),
          h('div', {}, h('dt', {}, '공격'), h('dd', {}, enemy.atk)),
          h('div', {}, h('dt', {}, '방어'), h('dd', {}, enemy.def)),
          h('div', {}, h('dt', {}, '속도'), h('dd', {}, def.spd)),
        ),
        h('section', {}, h('h4', {}, '다음 행동'), isAlive(enemy) ? intentView(enemy.intent, enemy, battle.allies) : h('p', {}, '쓰러짐')),
        h('section', {}, h('h4', {}, '상태'), statusList(enemy.statuses)),
        h(
          'section',
          {},
          h('h4', {}, '약점 격파'),
          h('p', { class: 'ab-desc' }, '약점 속성으로 맞으면 강인도가 깎이고, 0이 되면 격파되어 추가 피해를 받고 다음 차례를 잃는다. 속성별 격파 효과: '),
          h('ul', { class: 'bx-break-list' }, def.weak.map((w) => h('li', {}, elBadge(w, 'sm'), ` ${ELEMENTS[w].name}: `, ...highlight(BREAK_EFFECT[w])))),
        ),
        def.traits?.length ? h('section', {}, h('h4', {}, '특성'), def.traits.map((t) => h('p', {}, TRAIT_DESC[t]))) : null,
      );
    }
    return null;
  };

  // ── 필살기 초상 ──────────────────────────────────────────
  const ultView = () =>
    h(
      'div',
      { class: 'bx-ults', 'aria-label': '필살기' },
      battle.allies.map((a, i) => {
        const unit = unitById(a.defId);
        const max = maxEnergy(a);
        const ready = canUltimate(battle, a) && !busy;
        const sel = chosen?.allyUid === a.uid && chosen.slot === 'ultimate';
        const bust = h('span', { class: 'bx-ult-face' });
        bust.innerHTML = characterBust(a.defId);
        return h(
          'button',
          {
            type: 'button',
            class: `bx-ult ${ready ? 'ready' : ''} ${sel ? 'on' : ''} ${isAlive(a) ? '' : 'dead'} ${battle.active === a.uid ? 'turn' : ''}`,
            style: { '--el': elColor(unit.element), '--fill': `${Math.min(100, (a.energy / max) * 100)}%` },
            disabled: !ready,
            title: `${unit.name} 필살기 「${abilityOf(a, 'ultimate').name}」 — 에너지 ${a.energy}/${max}${ready ? ' (누르면 선택, 한 번 더 누르면 발동)' : ''}`,
            onclick: () => choose(a.uid, 'ultimate'),
          },
          bust,
          h('kbd', {}, String(i + 1)),
          ready ? h('small', {}, 'ULT') : null,
        );
      }),
    );

  // ── 행동 패널 ────────────────────────────────────────────
  const actView = () => {
    const ally = activeAlly();
    const c = current();
    if (!ally || !c || busy || battle.outcome !== 'ongoing') return h('div', { class: 'bx-act idle' }, h('small', {}, busy ? '진행 중…' : ''));
    const unit = unitById(ally.defId);
    const target = (() => {
      const a = actionOf();
      if (!a?.targetUid) return c.ab.aim === 'none' ? (c.ab.effects.some((e) => e.kind === 'damage' && e.target === 'allEnemies') ? '모든 적' : c.ab.effects.some((e) => e.kind === 'damage' && e.target === 'random') ? '무작위 적' : '') : '';
      return unitLabel(battle, a.targetUid);
    })();
    const err = (() => {
      const a = actionOf();
      return a ? validateAction(battle, a) : null;
    })();
    const slotBtn = (slot: 'basic' | 'skill', key: string) => {
      const ab = abilityOf(ally, slot);
      const on = c.ally.uid === ally.uid && c.slot === slot;
      const disabled = slot === 'skill' && battle.sp < 1;
      return h(
        'button',
        { type: 'button', class: `bx-slot slot-${slot} ${on ? 'on' : ''}`, disabled, onclick: () => choose(ally.uid, slot), title: `${SLOT_NAMES[slot]} 「${ab.name}」 (${key})` },
        h('kbd', {}, key),
        h('b', {}, ab.name),
        h('small', {}, `${SLOT_NAMES[slot]} · ${slot === 'basic' ? '성진 +1' : '성진 -1'}`),
      );
    };
    return h(
      'div',
      { class: 'bx-act', style: { '--el': elColor(c.slot === 'ultimate' ? unitById(c.ally.defId).element : unit.element) } },
      h(
        'div',
        { class: 'bx-card' },
        h('div', { class: 'bx-card-head' }, h('small', {}, `${unitById(c.ally.defId).name} · ${SLOT_NAMES[c.slot]} · ${SLOT_EN[c.slot]}`), h('b', {}, c.ab.name), target ? h('span', { class: 'bx-card-target' }, `대상 ▸ ${target}`) : null),
        h('p', { class: 'ab-desc' }, highlight(c.ab.desc)),
        err ? h('p', { class: 'bx-card-err' }, err) : null,
      ),
      h(
        'div',
        { class: 'bx-act-row' },
        h('div', { class: 'bx-sp', title: `성진 ${battle.sp}/${battle.maxSp} — 일반 공격 +1, 전투 스킬 -1` }, h('small', {}, '성진'), h('span', {}, Array.from({ length: battle.maxSp }, (_, i) => h('i', { class: i < battle.sp ? 'on' : '' })))),
        slotBtn('basic', 'Q'),
        slotBtn('skill', 'E'),
        h('button', { type: 'button', class: 'bx-go', disabled: !!err, onclick: () => void execute(), title: '실행 (Space)' }, c.slot === 'ultimate' ? '필살기 발동' : '실행', h('kbd', {}, 'Space')),
      ),
    );
  };

  function render() {
    actorEls.clear();
    actorLayer.replaceChildren(...battle.allies.map((a, i) => allyActor(a, i)), ...battle.enemies.map(enemyActor));
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
          h('div', { class: 'plaque' }, h('span', { class: 'plaque-sub' }, `${run.floor + 1}층 · ${floor.name}`), h('b', {}, `TURN ${battle.stats.turns}`)),
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
    );
    lineSlot.replaceChildren(lineView());
    infoSlot.replaceChildren(...[infoView()].filter((x): x is HTMLElement => !!x));
    root.classList.toggle('inspecting', !!inspect);
    ultSlot.replaceChildren(ultView());
    actSlot.replaceChildren(actView());
    syncAuras();
  }

  const showToast = (text: string) => {
    const t = h('div', { class: 'toast', role: 'status' }, text);
    root.append(t);
    setTimeout(() => t.remove(), 1600);
  };
  const showLog = () => modal('전투 기록', h('ol', { class: 'log-list' }, log.slice(-80).reverse().map((l) => h('li', {}, l))), () => {});

  // ── 단축키: Q 일반 공격, E 전투 스킬, 1~4 필살기, Space 실행, Tab 대상 전환, Esc 상세 닫기 ──
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
    const ally = activeAlly();
    const k = e.key.toLowerCase();
    if (k === 'q' && ally) choose(ally.uid, 'basic');
    else if (k === 'e' && ally) choose(ally.uid, 'skill');
    else if (['1', '2', '3', '4'].includes(k)) {
      const a = battle.allies[Number(k) - 1];
      if (a && canUltimate(battle, a)) choose(a.uid, 'ultimate');
    } else if (k === ' ' || k === 'enter') {
      if (e.target instanceof HTMLButtonElement && k === 'enter') return;
      e.preventDefault();
      void execute();
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
    if (!foot) return;
    const fresh = (u.uid.startsWith('e') ? enemyActor(u as Enemy) : allyActor(u as Ally, battle.allies.indexOf(u as Ally))).querySelector('.bx-foot');
    actorEls.set(uid, el);
    if (fresh) foot.replaceWith(fresh);
  };

  /** 이번 행동의 결과 요약 칩 */
  const castSummary = (events: BattleEvent[], from: number) => {
    let dmg = 0;
    let hits = 0;
    let heal = 0;
    let shield = 0;
    let broke = false;
    const buffs = new Set<string>();
    const debuffs = new Set<string>();
    for (let i = from + 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'cast' || ev.type === 'turn') break;
      if (ev.type === 'damage' && ev.source !== 'enemy') {
        dmg += ev.amount;
        hits++;
      } else if (ev.type === 'heal') heal += ev.amount;
      else if (ev.type === 'shield' && !ev.targetUid.startsWith('e')) shield += ev.amount;
      else if (ev.type === 'break') broke = true;
      else if (ev.type === 'status') {
        const meta = STATUS_META[ev.status];
        (meta.debuff ? debuffs : buffs).add(meta.name);
      }
    }
    const chips: HTMLElement[] = [];
    if (dmg) chips.push(h('span', { class: 'rc dmg' }, `피해 ${dmg}`, hits > 1 ? h('small', {}, ` ${hits}타`) : null));
    if (broke) chips.push(h('span', { class: 'rc react' }, '약점 격파'));
    if (heal) chips.push(h('span', { class: 'rc heal' }, `회복 ${heal}`));
    if (shield) chips.push(h('span', { class: 'rc shield' }, `⛨ ${shield}`));
    for (const b of buffs) chips.push(h('span', { class: 'rc buff' }, `▲ ${b}`));
    for (const d of debuffs) chips.push(h('span', { class: 'rc debuff' }, `▼ ${d}`));
    return chips;
  };

  const showSkillPlate = (allyUid: string, abilityId: string, slot: Slot, chips: HTMLElement[]) => {
    const ally = allyOf(allyUid)!;
    const unit = unitById(ally.defId);
    const ab = abilityById(abilityId);
    const bust = h('div', { class: 'sp-bust' });
    bust.innerHTML = characterBust(ally.defId);
    plateSlot.replaceChildren(
      h(
        'div',
        { class: `skill-plate slot-${slot}`, style: { '--el': elColor(unit.element) } },
        bust,
        h(
          'div',
          { class: 'sp-body' },
          h('small', { class: 'sp-who' }, `${unit.name} `, h('span', {}, unit.code)),
          h('b', { class: 'sp-name' }, ab.name),
          h('div', { class: 'sp-meta' }, h('span', { class: 'sp-tag' }, `${SLOT_NAMES[slot]} · ${SLOT_EN[slot]}`)),
          chips.length ? h('div', { class: 'sp-result' }, chips) : null,
        ),
      ),
    );
  };
  const showEnemyPlate = (enemyUid: string, text: string) => {
    const def = enemyById(enemyOf(enemyUid)!.defId);
    plateSlot.replaceChildren(h('div', { class: 'skill-plate enemy' }, h('div', { class: 'sp-body' }, h('small', { class: 'sp-who' }, 'ENEMY'), h('b', { class: 'sp-name' }, def.name), h('div', { class: 'sp-meta' }, h('span', { class: 'sp-tag' }, text)))));
  };

  /** 필살기 컷인 */
  async function ultimateCutIn(uid: string, name: string, un: { stack: Stack; stacks: number; mult: number } | null, color: string, target: string | null) {
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
        h('small', {}, `${unit.code} · ULTIMATE`),
        h('b', {}, name),
        un ? h('span', { class: 'ci-kindle' }, h('i', {}, STATUS_META[un.stack].glyph.repeat(Math.min(un.stacks, 10))), ` ${STATUS_META[un.stack].name} ${un.stacks} 해방 · 피해 ×${un.mult}`) : null,
      ),
    );
    scene.append(el);
    stage.flashScreen(0.25);
    sound.unleash(un?.stacks ?? 3);
    sound.duck(2);
    if (target) stage.punch(chest(target), 1.1);
    stage.slowMo(0.35, 0.5);
    await wait(1050);
    speedLines(color);
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }

  // ── 재생 ────────────────────────────────────────────────
  async function play(events: BattleEvent[]) {
    let lastTag: SkillTag = 'strike';
    let lastColor = '#ffffff';
    let lastCaster = '';
    let lastElement = 'star';
    let unleashed = false;
    let choreo: { caster: string; color: string; motion: string; melee: boolean; dashed: boolean; hits: number; idx: number; tag: SkillTag; slot: Slot; pending: boolean; firstHit: boolean; last: boolean } | null = null;
    const stageTargets = (from: number): string[] => {
      const out: string[] = [];
      for (let i = from + 1; i < events.length; i++) {
        const x = events[i];
        if (x.type === 'stage' || x.type === 'cast' || x.type === 'turn') break;
        if (x.type === 'damage' && x.source === 'ally') out.push(x.targetUid);
      }
      return out;
    };
    const laterStage = (from: number): boolean => {
      for (let i = from + 1; i < events.length; i++) {
        const x = events[i];
        if (x.type === 'cast' || x.type === 'turn') return false;
        if (x.type === 'stage' && !x.skipped) return true;
      }
      return false;
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
        case 'turn': {
          await endCast();
          resetHits();
          plateSlot.replaceChildren();
          // 행동 순서 표시를 앞으로 당긴다
          lineSlot.querySelector('.bx-line-item.now')?.classList.add('gone');
          if (ev.uid.startsWith('a')) {
            stage.focus(null);
            floatText(ev.uid, '차례', 'turn-pop');
          }
          await wait(120);
          break;
        }
        case 'cast': {
          await endCast();
          unleashed = false;
          const ally = allyOf(ev.allyUid)!;
          const unit = unitById(ally.defId);
          const color = elColor(unit.element);
          const ab = abilityById(ev.abilityId);
          lastTag = ab.tag;
          lastColor = color;
          lastCaster = ev.allyUid;
          lastElement = unit.element;
          const nextCut = events.findIndex((x, j) => j > k && (x.type === 'cast' || x.type === 'turn'));
          const castEnd = nextCut < 0 ? events.length : nextCut;
          const slice = events.slice(k + 1, castEnd);
          const unleash = slice.find((x): x is Extract<BattleEvent, { type: 'unleash' }> => x.type === 'unleash') ?? null;
          const targets = slice.filter((x): x is Extract<BattleEvent, { type: 'damage' }> => x.type === 'damage' && x.source === 'ally').map((x) => x.targetUid);
          if (ev.slot === 'ultimate') await ultimateCutIn(ev.allyUid, ab.name, unleash, color, targets[0] ?? null);
          stage.focus(chest(ev.allyUid), 0.7);
          stage.fx?.castCircle(chest(ev.allyUid), color, ev.slot === 'basic' ? 2.6 : 3.6);
          stage.fx?.gather(chest(ev.allyUid).add(new THREE.Vector3(0.7, 0.1, 0)), color, ev.slot === 'basic' ? 12 : 24, 0.42);
          const motion = characterMotion(unit.id);
          const staged = slice.some((x) => x.type === 'stage');
          const melee = staged && (motion === 'thrust' || motion === 'slash' || motion === 'bash');
          stage.setBackdrop(color, SUPPORT_TAGS.has(ab.tag) ? 0.5 : ev.slot === 'basic' ? 0.6 : 0.85);
          showSkillPlate(ev.allyUid, ev.abilityId, ev.slot, castSummary(events, k));
          await wait(ev.slot === 'basic' ? 320 : 460);
          choreo = { caster: ev.allyUid, color, motion, melee, dashed: false, hits: targets.length, idx: 0, tag: ab.tag, slot: ev.slot, pending: false, firstHit: false, last: false };
          if (melee && targets[0]) {
            stage.anim(ev.allyUid, 'dash');
            stage.dash(ev.allyUid, targets[0], 0.16);
            stage.afterimage(ev.allyUid, color, 4);
            sound.whoosh('sweep');
            choreo.dashed = true;
          } else stage.anim(ev.allyUid, SUPPORT_TAGS.has(ab.tag) ? 'channel' : staged ? (motion === 'shoot' ? 'fire' : 'cast1') : 'cast');
          sound.cast(unit.element, ev.slot === 'ultimate' ? 4 : ev.slot === 'skill' ? 2 : 1, motion);
          stage.fx?.magicCircle(feet(ev.allyUid), color, 2.6, 1.1, 'magic_01');
          if (!staged) {
            // 회복·보호막·강화: 몸에서 빛이 퍼진다
            stage.fx?.flare(chest(ev.allyUid), color, 1.4, 0.35);
            stage.fx?.ring(feet(ev.allyUid), color, 0.4, 4.2, 0.6);
            if (ev.targetUid && ev.targetUid !== ev.allyUid && ev.targetUid.startsWith('a')) stage.fx?.arc(chest(ev.allyUid), chest(ev.targetUid), color);
            stage.focus(null);
          } else if (targets[0]) stage.focus(new Set(targets).size > 1 ? enemyCenter() : chest(targets[0]), 0.55);
          await wait(staged ? 120 : 420);
          break;
        }
        case 'stage': {
          const c = choreo;
          if (!c || c.caster !== ev.allyUid) break;
          c.hits = ev.total;
          c.idx = ev.index;
          if (ev.skipped) {
            c.pending = false;
            await wait(160);
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
            stage.toon.slash(p, col, pose === 'finish' ? 4.8 : 3.4, roll);
            if (ev.index % 3 === 1) stage.toon.slash(p, col, 3.1, roll + 1.7, 0.06);
            if (ev.index % 3 === 2) stage.toon.beam(chest(c.caster), p.clone().add(new THREE.Vector3(1.2, 0, 0)), col, 0.45, 0.24);
            if (pose === 'finish') {
              stage.toon.slash(p, '#ffffff', 4, roll + 0.5, 0.04);
              stage.toon.slash(p, col, 4.2, roll + 2.2, 0.1);
            }
            stage.afterimage(c.caster, col, last ? 4 : 2);
          } else {
            stage.anim(c.caster, c.motion === 'shoot' ? 'fire' : ev.index % 2 ? 'cast2' : 'cast1');
            const from = chest(c.caster).add(new THREE.Vector3(0.7, 0.15, 0));
            const aims = here.length ? [...new Set(here)] : tgt ? [tgt] : [];
            aims.forEach((t, j) => {
              // 광선은 전투 스킬·필살기의 마지막 한 발에만
              if (last && ev.total > 1 && c.slot !== 'basic') stage.toon.beam(from, chest(t), col, c.slot === 'ultimate' ? 0.6 : 0.35, 0.28, j * 0.04);
              else stage.toon.shot(from, chest(t), col, 0.15, j * 0.05);
            });
            if (c.tag === 'aoe' && last) stage.fx?.sweep(enemyCenter(), col, 6.5);
            sound.whoosh(c.motion === 'shoot' ? 'projectile' : 'mark');
            await wait(last && ev.total > 1 ? 260 : 180);
          }
          break;
        }
        case 'damage': {
          const unit = allyOf(ev.targetUid) ?? enemyOf(ev.targetUid);
          const el = actorEls.get(ev.targetUid);
          if (el && unit) for (const t of [el].filter((x) => x.querySelector('.hp'))) updateHpBar(t, ev.hpAfter, unit.maxHp, ev.shieldAfter);
          const crit = unleashed && ev.source === 'ally';
          const power = crit ? 2.4 : Math.min(2, Math.max(0.6, ev.amount / 14));
          stage.anim(ev.targetUid, 'hit', power);
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
            } else if (ev.source === 'counter') fx.slash(p, elColor('star'), 2);
            else if (ev.source === 'break') {
              fx.impact(p, lastColor, 1.6);
              stage.toon.finale(p, '#ffffff', 1.2);
            } else {
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
          if (ev.source !== 'enemy' && ev.targetUid.startsWith('e')) bumpHits(ev.amount, lastColor);
          sound.hit(crit || ev.source === 'break' ? 'crit' : ev.amount === 0 && ev.absorbed ? 'blocked' : ev.source === 'ally' ? (characterMotion(allyOf(lastCaster)?.defId ?? '') === 'slash' ? 'slash' : 'ally') : ev.source === 'erosion' ? 'burn' : ev.source === 'burst' ? 'doom' : ev.source);
          floatText(ev.targetUid, ev.amount > 0 ? `${ev.amount}` : `⛨${ev.absorbed}`, ev.source === 'enemy' ? 'dmg-ally' : ev.source === 'burn' || ev.source === 'erosion' ? 'dmg-burn' : crit || ev.source === 'break' ? 'dmg-crit' : 'dmg');
          await wait(finale ? 480 : crit ? 560 : lastTag === 'multi' ? 190 : 260);
          break;
        }
        case 'heal': {
          const unit = allyOf(ev.targetUid);
          const el = actorEls.get(ev.targetUid);
          if (unit && el) updateHpBar(el, ev.hpAfter, unit.maxHp, unit.shield);
          stage.fx?.heal(chest(ev.targetUid), feet(ev.targetUid), '#8fe0a5');
          sound.heal();
          floatText(ev.targetUid, `+${ev.amount}`, 'heal');
          await wait(130);
          break;
        }
        case 'shield': {
          stage.fx?.shield(chest(ev.targetUid), ev.targetUid.startsWith('e') ? '#e0685a' : '#8ec5e0');
          sound.shield();
          floatText(ev.targetUid, `⛨ ${ev.amount}`, 'shield');
          refreshFoot(ev.targetUid);
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
        case 'toughness': {
          refreshFoot(ev.targetUid);
          floatText(ev.targetUid, `강인도 -${ev.amount}`, 'tough');
          break;
        }
        case 'break': {
          // 약점 격파: 화면이 멈칫하고 큰 글씨
          const col = elColor(ev.element);
          stage.impactFrame(col);
          stage.flashScreen(0.3);
          stage.shake(0.5);
          stage.hitStop(0.18);
          stage.fx?.ring(feet(ev.targetUid), col, 0.6, 6, 0.6);
          sound.reaction('sol', 'luna');
          showCallout(h('div', { class: 'banner break-banner', style: { '--el': col } }, h('small', {}, 'WEAKNESS BREAK'), h('b', {}, '약점 격파'), h('span', {}, `${ELEMENTS[ev.element].name} 격파 — ${BREAK_EFFECT[ev.element]}`)), 'break');
          refreshFoot(ev.targetUid);
          await wait(720);
          clearCallout();
          break;
        }
        case 'recover':
          floatText(ev.targetUid, '강인도 회복', 'buff');
          refreshFoot(ev.targetUid);
          await wait(260);
          break;
        case 'energy':
        case 'sp':
          ultSlot.replaceChildren(ultView());
          if (ev.type === 'sp' && ev.amount > 0) sound.stardust();
          break;
        case 'trigger':
          if (ev.phase === 'kill') {
            floatText(ev.allyUid, '처치 효과', 'trigger t-kill');
            await wait(260);
          }
          break;
        case 'purge':
          floatText(ev.targetUid, '강화 해제', 'debuff');
          await wait(110);
          break;
        case 'enemyAct':
        case 'enemyStunned': {
          await endCast();
          if (ev.type === 'enemyStunned') {
            floatText(ev.enemyUid, enemyOf(ev.enemyUid)?.broken === false ? '움직이지 못한다' : '기절', 'debuff');
            showEnemyPlate(ev.enemyUid, '행동 불능');
            await wait(520);
            break;
          }
          stage.focus(chest(ev.enemyUid), 0.35);
          showEnemyPlate(ev.enemyUid, { attack: `공격${ev.intent.kind === 'attack' && ev.intent.targetId ? ` → ${unitLabel(battle, ev.intent.targetId)}` : ''}`, attackAll: '전체 공격', defend: '방어 태세', buff: '힘을 모은다', seal: '성식 — 성진 강탈', charge: '큰 공격 준비' }[ev.intent.kind]);
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
        case 'outcome':
          break;
      }
    }
    await endCast();
    stage.focus(null);
    plateSlot.replaceChildren();
    resetHits();
    await wait(200);
  }

  async function execute() {
    if (busy) return;
    const a = actionOf();
    if (!a || validateAction(battle, a)) return;
    busy = true;
    root.classList.add('busy', 'executing');
    render();
    const events = act(battle, a);
    chosen = null;
    allyTarget = null;
    await play(events);
    app.save();
    busy = false;
    root.classList.remove('busy', 'executing');
    clearCallout();
    if (battle.outcome === 'ongoing') render();
    else showOutcome();
  }

  /** 첫 진입: 적이 먼저 움직이면 그 차례를 보여 준 뒤 술사 차례로 */
  async function opening() {
    if (battle.active || battle.outcome !== 'ongoing') return;
    busy = true;
    root.classList.add('busy');
    render();
    const events = begin(battle);
    await play(events);
    app.save();
    busy = false;
    root.classList.remove('busy');
    if (battle.outcome === 'ongoing') render();
    else showOutcome();
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
          h('p', { class: 'muted' }, `약점 격파 ${battle.stats.breaks} · 필살기 ${battle.stats.ultimates} · ${battle.stats.turns}턴`),
          button(won ? '계속' : '결과 보기', proceed, { variant: 'primary' }),
        ),
      ),
    );
    requestAnimationFrame(() => root.querySelector<HTMLButtonElement>('.outcome-card .btn')?.focus());
  }

  if (battle.outcome !== 'ongoing') showOutcome();
  else if (!battle.active) void opening();
  else render();
  return root;
}
