import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore.js';

/**
 * Dev-only e2e registration hook (Story TD-6). Mounted inside a <Canvas> ONLY
 * when `import.meta.env.DEV` (the Playwright suite runs against the vite dev
 * server; production builds never include the mount). Contains ZERO logic —
 * it exposes refs (scene, camera, canvas element, the game store's getState)
 * on `window.__E2E__` so the e2e helper can project mesh world-positions to
 * screen pixels and derive moves from the authoritative public snapshot.
 * R3F components stay rendering-only: registration is not game logic.
 */

interface E2eWindow {
  __E2E__?: {
    scene: unknown;
    camera: unknown;
    canvas: HTMLCanvasElement;
    getState: typeof useGameStore.getState;
  };
  __E2E_STATE__?: {
    getState: typeof useGameStore.getState;
  };
}

/**
 * Canvas-independent state registration — the scene hook above unmounts with
 * its Canvas (e.g. the instant a round resolves), but e2e waits must keep
 * reading session status across surface swaps. Called once from the App
 * bootstrap, dev builds only.
 */
export function registerE2eStateHook(): void {
  (window as unknown as E2eWindow).__E2E_STATE__ = { getState: useGameStore.getState };
}

export function E2eSceneHook() {
  const { scene, camera, gl } = useThree();

  useEffect(() => {
    const w = window as unknown as E2eWindow;
    w.__E2E__ = { scene, camera, canvas: gl.domElement, getState: useGameStore.getState };
    return () => {
      // Only clear our own registration (a second Canvas may have replaced it).
      if (w.__E2E__?.scene === scene) delete w.__E2E__;
    };
  }, [scene, camera, gl]);

  return null;
}
