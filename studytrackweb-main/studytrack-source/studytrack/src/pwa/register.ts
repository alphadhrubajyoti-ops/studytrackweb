import { registerSW } from 'virtual:pwa-register';

/** Registers the service worker and tells the UI (via window events) about updates. */
export function setupServiceWorker() {
  const update = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(
        new CustomEvent('studytrack:update-ready', { detail: () => update(true) }),
      );
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('studytrack:offline-ready'));
    },
    onRegisterError(e) {
      console.warn('Service worker registration failed', e);
    },
  });
}
