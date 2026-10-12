import { networkInterfaces } from "node:os";

const isLoopbackHost = (host: string): boolean => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

const isPrivateIPv4 = (address: string): boolean => {
  const parts = address.split(".").map(Number);
  const a = parts[0] ?? Number.NaN;
  const b = parts[1] ?? Number.NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31;
};

const localNetworkHost = (interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): string | undefined => {
  const candidates = Object.entries(interfaces).flatMap(([name, entries]) => (entries ?? [])
    .filter(info => !info.internal && ["4", "IPv4"].includes(String(info.family)))
    .map(info => ({ name, address: info.address })));
  const score = (name: string) => /wi[- ]?fi|wireless|wlan/i.test(name) ? 0 : /virtual|vethernet|vmware|loopback|docker/i.test(name) ? 2 : 1;
  candidates.sort((left, right) => score(left.name) - score(right.name));
  const physicalCandidates = candidates.filter(candidate => score(candidate.name) < 2);
  return physicalCandidates.find(candidate => isPrivateIPv4(candidate.address))?.address ?? physicalCandidates[0]?.address;
};

export const accessHost = (
  requestUrl: string,
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string | undefined => {
  const url = new URL(requestUrl);
  return isLoopbackHost(url.hostname) ? localNetworkHost(interfaces) : url.hostname;
};
