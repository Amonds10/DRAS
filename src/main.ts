import './styles.css';
import { App } from './ui/app';

new App(document.getElementById('app') as HTMLElement, document.getElementById('bg') as HTMLElement).go('title');
