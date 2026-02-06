// Electron webview 类型声明
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        allowpopups?: string;
        partition?: string;
        preload?: string;
        nodeintegration?: string;
        webpreferences?: string;
      },
      HTMLElement
    >;
  }
}

// Window 扩展
interface Window {
  electronAPI?: {
    platform: string;
    isElectron: boolean;
  };
}
