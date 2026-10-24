import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/noto-sans-kr/900.css';
import '@fontsource/noto-serif-kr/700.css';
import '@fontsource/noto-serif-kr/900.css';
import './styles.css';
import './theme.css';
import './battle7.css';
import { installSound } from './audio/sound';
import { App } from './ui/app';

installSound();
new App(document.getElementById('app') as HTMLElement, document.getElementById('bg') as HTMLElement).go('title');
