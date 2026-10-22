import './styles.css';
import { startSky } from './render/sky';
import { App } from './ui/app';

startSky(document.getElementById('sky') as HTMLCanvasElement);
new App(document.getElementById('app') as HTMLElement).go('title');
