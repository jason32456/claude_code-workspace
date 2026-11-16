const loaders = {
  real: () => import('./engine.js'),
  fake: () => import('../dev/stage-fake-engine.js'),
};
const loaded = {};

self.onmessage = async ({ data: { id, kind, a, b } }) => {
  let engine;
  try {
    engine = await (loaded[kind] ??= loaders[kind]());
  } catch (error) {
    delete loaded[kind];
    self.postMessage({ id, error: { code: 'engine-missing', message: String(error?.message ?? error) } });
    return;
  }
  try {
    self.postMessage({ id, result: engine.dissect(a, b) });
  } catch (error) {
    self.postMessage({ id, error: { code: error?.code ?? 'failed', message: String(error?.message ?? error) } });
  }
};
