import '@fontsource/bodoni-moda/500.css';
import '@fontsource/bodoni-moda/600.css';
import '@fontsource/bodoni-moda/500-italic.css';
import '@fontsource/noto-serif-kr/400.css';
import '@fontsource/noto-serif-kr/500.css';
import '@fontsource/noto-serif-kr/700.css';
import '@fontsource/noto-serif-kr/900.css';
import './styles.css';
import { App } from './ui/app';

new App(document.getElementById('app') as HTMLElement, document.getElementById('bg') as HTMLElement).go('title');
