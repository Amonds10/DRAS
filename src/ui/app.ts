import { clearRun, loadRun, saveRun, type RunState } from '../core/run';
import { floorPreset } from '../render/three/environment';
import { getStage } from '../render/three/stage';
import { storage } from './dom';
import { battleScreen } from './screens/battle';
import { mapScreen } from './screens/map';
import { resultScreen } from './screens/result';
import { rewardScreen } from './screens/reward';
import { teamScreen } from './screens/team';
import { titleScreen } from './screens/title';

export type ScreenName = 'title' | 'team' | 'map' | 'battle' | 'reward' | 'result';

const SPEED_KEY = 'starweaver.speed';

export class App {
  run: RunState | null = null;
  /** 연출 속도 배율(1 = 기본, 2 = 빠르게) */
  speed: number;

  constructor(
    private root: HTMLElement,
    private bg: HTMLElement,
  ) {
    this.speed = Number(storage.getItem(SPEED_KEY)) || 1;
  }

  /** 전투가 아닌 화면에서는 공유 무대를 뒷배경으로 쓴다. */
  private showBackground(screen: ScreenName): void {
    const stage = getStage();
    stage.clearActors();
    stage.mount(this.bg, 'menu');
    const inRun = this.run && (screen === 'map' || screen === 'reward' || screen === 'result');
    stage.setScene(inRun ? floorPreset(Math.min(this.run!.floor, 4)) : 'title');
    this.bg.hidden = false;
  }

  savedRun(): RunState | null {
    return loadRun(storage);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    storage.setItem(SPEED_KEY, String(speed));
  }

  save(): void {
    if (!this.run) return;
    if (this.run.phase === 'victory' || this.run.phase === 'defeat') clearRun(storage);
    else saveRun(storage, this.run);
  }

  abandon(): void {
    this.run = null;
    clearRun(storage);
  }

  /** 런의 현재 단계에 맞는 화면으로 이동한다. */
  resume(run: RunState): void {
    this.run = run;
    const byPhase: Record<RunState['phase'], ScreenName> = { map: 'map', battle: 'battle', reward: 'reward', victory: 'result', defeat: 'result' };
    this.go(byPhase[run.phase]);
  }

  go(screen: ScreenName): void {
    const render = { title: titleScreen, team: teamScreen, map: mapScreen, battle: battleScreen, reward: rewardScreen, result: resultScreen }[screen];
    if (screen === 'battle') this.bg.hidden = true;
    else this.showBackground(screen);
    const view = render(this);
    view.classList.add('screen', `view-${screen}`);
    this.root.replaceChildren(view);
    window.scrollTo(0, 0);
    view.querySelector<HTMLElement>('[autofocus]')?.focus();
  }
}
