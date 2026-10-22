import '@fontsource/noto-serif-kr/700.css';
import '@fontsource/noto-serif-kr/900.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import './styles.css';
import { App } from './ui/app';

new App(document.getElementById('app') as HTMLElement, document.getElementById('bg') as HTMLElement).go('title');
