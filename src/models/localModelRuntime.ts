export type LocalModelOwner = 'ghost-text' | 'embedding' | 'bge-lab';

interface RuntimeController {
  dispose: () => void | Promise<void>;
  isBusy: () => boolean;
}

const controllers = new Map<LocalModelOwner, RuntimeController>();
let activeOwner: LocalModelOwner | null = null;
let transition: Promise<void> = Promise.resolve();

export function registerLocalModelRuntime(
  owner: LocalModelOwner,
  controller: RuntimeController,
): void {
  controllers.set(owner, controller);
}

export function activateLocalModelRuntime(owner: LocalModelOwner): Promise<boolean> {
  let activated = false;
  const operation = transition.then(async () => {
    if (activeOwner === owner) {
      activated = true;
      return;
    }

    const previousOwner = activeOwner;
    if (owner === 'ghost-text' && previousOwner && previousOwner !== 'ghost-text') {
      const embedding = controllers.get(previousOwner);
      if (embedding?.isBusy()) return;
    }

    activeOwner = null;
    if (previousOwner) await controllers.get(previousOwner)?.dispose();
    activeOwner = owner;
    activated = true;
  });
  transition = operation.catch(() => undefined);
  return operation.then(() => activated);
}

export function releaseLocalModelRuntime(owner: LocalModelOwner): void {
  if (activeOwner === owner) activeOwner = null;
}

export function notifyLocalModelRuntimeIdle(owner: LocalModelOwner): void {
  window.dispatchEvent(new CustomEvent('duet-local-model-runtime-idle', { detail: { owner } }));
}

export function getActiveLocalModelRuntime(): LocalModelOwner | null {
  return activeOwner;
}
