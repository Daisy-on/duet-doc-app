export interface SaveUpdates {
  content?: string;
  title?: string;
}

type SaveFn = (docId: string, updates: SaveUpdates) => Promise<void>;

interface DocumentState {
  timer: number | null;
  pendingUpdates: SaveUpdates | null;
  inFlightPromise: Promise<void> | null;
  isPaused: boolean;
}

class SaveCoordinator {
  private docStates = new Map<string, DocumentState>();

  private getOrCreateState(docId: string): DocumentState {
    let state = this.docStates.get(docId);
    if (!state) {
      state = {
        timer: null,
        pendingUpdates: null,
        inFlightPromise: null,
        isPaused: false,
      };
      this.docStates.set(docId, state);
    }
    return state;
  }

  scheduleDocumentAutosave(docId: string, updates: SaveUpdates, saveFn: SaveFn, delay = 800): void {
    const state = this.getOrCreateState(docId);
    state.pendingUpdates = {
      ...state.pendingUpdates,
      ...updates,
    };

    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    if (state.isPaused) return;

    state.timer = window.setTimeout(() => {
      state.timer = null;
      this.flushPending(docId, saveFn).catch((err) => {
        console.error(`[SaveCoordinator] Background autosave failed for doc ${docId}:`, err);
      });
    }, delay);
  }

  async persistDocumentNow(docId: string, updates: SaveUpdates, saveFn: SaveFn): Promise<void> {
    const state = this.getOrCreateState(docId);
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    state.pendingUpdates = {
      ...state.pendingUpdates,
      ...updates,
    };
    return this.flushPending(docId, saveFn);
  }

  private async flushPending(docId: string, saveFn: SaveFn): Promise<void> {
    const state = this.getOrCreateState(docId);
    if (!state.pendingUpdates) {
      if (state.inFlightPromise) {
        await state.inFlightPromise;
      }
      return;
    }

    const updatesToSave = { ...state.pendingUpdates };
    state.pendingUpdates = null;

    const previousPromise = state.inFlightPromise || Promise.resolve();
    const currentPromise = (async () => {
      try {
        await previousPromise;
      } catch {
        // ignore error from previous save
      }
      try {
        await saveFn(docId, updatesToSave);
      } catch (err) {
        // Restore failed updates back into pendingUpdates if not replaced by newer ones
        state.pendingUpdates = {
          ...updatesToSave,
          ...state.pendingUpdates,
        };
        throw err;
      }
    })();

    state.inFlightPromise = currentPromise;

    try {
      await currentPromise;
    } finally {
      if (state.inFlightPromise === currentPromise) {
        state.inFlightPromise = null;
      }
    }
  }

  async pauseAndFlush(docId: string, saveFn: SaveFn): Promise<void> {
    const state = this.getOrCreateState(docId);
    state.isPaused = true;

    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    try {
      if (state.pendingUpdates) {
        await this.flushPending(docId, saveFn);
      } else if (state.inFlightPromise) {
        await state.inFlightPromise;
      }
    } catch (err) {
      state.isPaused = false;
      throw err;
    }
  }

  resume(docId: string, saveFn?: SaveFn): void {
    const state = this.getOrCreateState(docId);
    state.isPaused = false;

    if (state.pendingUpdates && saveFn) {
      this.scheduleDocumentAutosave(docId, {}, saveFn, 100);
    }
  }

  async runExclusive<T>(docId: string, task: () => Promise<T>): Promise<T> {
    const state = this.getOrCreateState(docId);
    if (state.inFlightPromise) {
      try {
        await state.inFlightPromise;
      } catch {
        // ignore
      }
    }

    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((res) => {
      resolveLock = res;
    });
    state.inFlightPromise = lockPromise;

    try {
      return await task();
    } finally {
      resolveLock();
      if (state.inFlightPromise === lockPromise) {
        state.inFlightPromise = null;
      }
    }
  }
}

export const saveCoordinator = new SaveCoordinator();
