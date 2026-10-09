export type DisposableModel = { dispose: () => void };

/** Construct a species model only when its renderer path first needs it. */
export function createLazyModelRegistry<Key extends string, Model extends DisposableModel>(
  factories: Record<Key, () => Model | Promise<Model>>,
) {
  const models = new Map<Key, Model>();
  const pending = new Map<Key, Promise<Model>>();
  let disposed = false;

  return {
    load(key: Key): Promise<Model> {
      if (disposed) return Promise.reject(new Error("model_registry_disposed"));
      const existing = models.get(key);
      if (existing) return Promise.resolve(existing);
      const current = pending.get(key);
      if (current) return current;

      const loading = Promise.resolve().then(factories[key]).then(model => {
        pending.delete(key);
        if (disposed) {
          model.dispose();
          throw new Error("model_registry_disposed");
        }
        models.set(key, model);
        return model;
      }, error => {
        pending.delete(key);
        throw error;
      });
      pending.set(key, loading);
      return loading;
    },
    peek(key: Key): Model | undefined {
      return models.get(key);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const model of models.values()) model.dispose();
      models.clear();
      pending.clear();
    },
  };
}
