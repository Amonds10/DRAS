import { clearRun, loadRun, saveRun, type RunState } from '../core/run';
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

  constructor(private root: HTMLElement) {
    this.speed = Number(storage.getItem(SPEED_KEY)) || 1;
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
    const view = render(this);
    view.classList.add('screen', `view-${screen}`);
    this.root.replaceChildren(view);
    window.scrollTo(0, 0);
    view.querySelector<HTMLElement>('[autofocus]')?.focus();
  }
}
