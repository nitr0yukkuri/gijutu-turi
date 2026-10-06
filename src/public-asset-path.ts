import { isAbsolute, relative, resolve, sep } from "node:path";

/** Resolve an untrusted asset path without allowing it to escape its public root. */
export function resolveContainedAssetPath(root: string, requestedPath: string): string | null {
  if (!requestedPath || requestedPath.includes("\0")) return null;

  const absoluteRoot = resolve(root);
  const absoluteTarget = resolve(absoluteRoot, requestedPath);
  const fromRoot = relative(absoluteRoot, absoluteTarget);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null;
  return absoluteTarget;
}

export function publicAssetCandidates(route: string, sourcePath: string, preferred: boolean): readonly string[] {
  if (route === "/service-worker.js") return ["dist/client/service-worker.js", sourcePath];
  return preferred ? [`dist/client/${sourcePath}`, sourcePath] : [sourcePath];
}
