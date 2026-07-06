import { Application } from 'pixi.js';

export interface GameDebugHooks {
  booted: boolean;
  app: Application;
  testMode: boolean;
}

declare global {
  interface Window {
    __game?: GameDebugHooks;
  }
}

const params = new URLSearchParams(window.location.search);
// ?test=1 → deterministic mode: fixed RNG seed, no audio (PLAN §12).
const testMode = params.get('test') === '1';

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    background: '#1a1a24',
    resizeTo: window,
    antialias: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app element');
  root.appendChild(app.canvas);

  window.__game = { booted: true, app, testMode };
}

boot().catch((err) => {
  console.error('KEYSTONE failed to boot:', err);
  throw err;
});
