let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export function registerModelCacheServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    return Promise.reject(new Error('当前浏览器不支持端侧模型缓存'));
  }
  registrationPromise ??= navigator.serviceWorker.register('/model-cache-sw.js', { scope: '/' });
  return registrationPromise;
}

export async function ensureModelCacheServiceWorkerReady(): Promise<void> {
  await registerModelCacheServiceWorker();
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return;

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      reject(new Error('模型缓存服务尚未就绪，请刷新页面后重试'));
    }, 5_000);
    const handleControllerChange = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange, {
      once: true,
    });
  });
}
