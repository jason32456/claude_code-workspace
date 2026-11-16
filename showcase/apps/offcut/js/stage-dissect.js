const loaders = {
  real: () => import('./engine.js'),
  fake: () => import('../dev/stage-fake-engine.js'),
};

export class DissectError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createDissector(kind) {
  let worker = null;
  let workerBroken = typeof Worker === 'undefined';
  let pending = null;
  let nextId = 1;
  const direct = {};

  function stopWorker() {
    worker?.terminate();
    worker = null;
  }

  function settle(fn) {
    const current = pending;
    pending = null;
    if (current) fn(current);
  }

  function startWorker() {
    worker = new Worker(new URL('./stage-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (!pending || data.id !== pending.id) return;
      settle((p) => (data.error ? p.reject(new DissectError(data.error.code, data.error.message)) : p.resolve(data.result)));
    };
    worker.onerror = () => {
      workerBroken = true;
      stopWorker();
      settle((p) => p.retry());
    };
  }

  async function runDirect(a, b) {
    let engine;
    try {
      engine = await (direct[kind] ??= loaders[kind]());
    } catch (error) {
      delete direct[kind];
      throw new DissectError('engine-missing', String(error?.message ?? error));
    }
    try {
      return engine.dissect(a, b);
    } catch (error) {
      throw new DissectError(error?.code ?? 'failed', String(error?.message ?? error));
    }
  }

  return {
    run(a, b) {
      if (pending) {
        pending.reject(new DissectError('superseded', 'superseded'));
        pending = null;
        stopWorker();
      }
      if (workerBroken) return runDirect(a, b);
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending = { id, resolve, reject, retry: () => runDirect(a, b).then(resolve, reject) };
        try {
          if (!worker) startWorker();
          worker.postMessage({ id, kind, a, b });
        } catch {
          workerBroken = true;
          stopWorker();
          settle((p) => p.retry());
        }
      });
    },
  };
}
