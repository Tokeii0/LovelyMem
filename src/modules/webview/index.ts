export interface WebViewConfig {
  url: string;
  title: string;
  width: number;
  height: number;
  resizable: boolean;
}

export const defaultWebViewConfig: WebViewConfig = {
  url: 'about:blank',
  title: '网页',
  width: 1000,
  height: 700,
  resizable: true,
};

export { WebViewDialog } from './WebViewDialog';
