import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { createPhoneHttpsDevelopmentEnvironment } from "../src/dev-phone-https-env.js";

const root = process.cwd();
const certificateDirectory = resolve(root, ".local-certs", "phone-https");
const caKeyPath = resolve(certificateDirectory, "dev-ca.key");
const caCertificatePath = resolve(certificateDirectory, "dev-ca.crt");
const serverKeyPath = resolve(certificateDirectory, "server.key");
const serverCertificatePath = resolve(certificateDirectory, "server.crt");
const requestPath = resolve(certificateDirectory, "server.csr");
const extensionPath = resolve(certificateDirectory, "server.ext");

const isPrivateIpv4 = (address: string): boolean => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 10 || first === 172 && second! >= 16 && second! <= 31 || first === 192 && second === 168;
};

const isVirtualInterface = (name: string): boolean =>
  /virtual|vEthernet|hyper-v|vmware|virtualbox|docker|wsl|loopback|tunnel|tap|bridge/i.test(name);

const lanAddresses = (): string[] => {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? [])
      .filter(info => !info.internal && ["4", "IPv4"].includes(String(info.family)) && isPrivateIpv4(info.address))
      .map(info => ({ name, address: info.address })),
  );
  const score = (name: string): number =>
    /wi[- ]?fi|wireless|wlan/i.test(name) ? 0 : isVirtualInterface(name) ? 2 : 1;
  candidates.sort((left, right) => score(left.name) - score(right.name));
  const wifiCandidates = candidates.filter(candidate => score(candidate.name) === 0);
  const selected = wifiCandidates.length > 0 ? wifiCandidates : candidates.filter(candidate => score(candidate.name) === 1);
  return [...new Set(selected.map(candidate => candidate.address))];
};

const findOpenSsl = (): string => {
  const candidates = [
    process.env.OPENSSL_BIN,
    "openssl",
    "C:\\Apache24\\bin\\openssl.exe",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (candidate !== "openssl" && !existsSync(candidate)) continue;
    const check = spawnSync(candidate, ["version"], { encoding: "utf8", windowsHide: true });
    if (!check.error && check.status === 0) return candidate;
  }
  throw new Error("OpenSSL が見つかりません。OpenSSL 3.x をインストールするか OPENSSL_BIN に openssl.exe のパスを指定してください。");
};

const runOpenSsl = (binary: string, args: string[]): string => {
  const result = spawnSync(binary, args, { cwd: certificateDirectory, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.trim() ?? "OpenSSL command failed";
    throw new Error(`OpenSSL の証明書処理に失敗しました: ${detail}`);
  }
  return result.stdout.trim();
};

const ensureCertificates = (openssl: string, addresses: string[]): string => {
  mkdirSync(certificateDirectory, { recursive: true });
  const hasCaKey = existsSync(caKeyPath);
  const hasCaCertificate = existsSync(caCertificatePath);
  if (hasCaKey !== hasCaCertificate) {
    throw new Error(`ローカルCAの鍵と証明書が片方だけあります。既存ファイルを確認してから ${certificateDirectory} を整理してください。`);
  }

  if (!hasCaKey) {
    console.log("[dev:https] このPC専用のローカル認証局を作成します。");
    runOpenSsl(openssl, [
      "req", "-x509", "-newkey", "rsa:3072", "-sha256", "-nodes", "-days", "3650",
      "-keyout", caKeyPath, "-out", caCertificatePath,
      "-subj", "/CN=Gijutu Turi Local Development CA",
      "-addext", "basicConstraints=critical,CA:TRUE",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign",
    ]);
  }

  runOpenSsl(openssl, ["x509", "-in", caCertificatePath, "-noout"]);
  runOpenSsl(openssl, ["pkey", "-in", caKeyPath, "-noout"]);

  const names = [
    "DNS.1 = localhost",
    "IP.1 = 127.0.0.1",
    "IP.2 = ::1",
    ...addresses.map((address, index) => `IP.${index + 3} = ${address}`),
  ];
  writeFileSync(extensionPath, [
    "[server_cert]",
    "basicConstraints = critical,CA:FALSE",
    "keyUsage = critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage = serverAuth",
    "subjectAltName = @alt_names",
    "[alt_names]",
    ...names,
    "",
  ].join("\n"), "utf8");

  runOpenSsl(openssl, [
    "req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256",
    "-keyout", serverKeyPath, "-out", requestPath, "-subj", "/CN=localhost",
  ]);
  runOpenSsl(openssl, [
    "x509", "-req", "-in", requestPath, "-CA", caCertificatePath, "-CAkey", caKeyPath,
    "-CAcreateserial", "-out", serverCertificatePath, "-days", "397", "-sha256",
    "-extfile", extensionPath, "-extensions", "server_cert",
  ]);
  rmSync(requestPath, { force: true });
  runOpenSsl(openssl, ["verify", "-CAfile", caCertificatePath, serverCertificatePath]);
  runOpenSsl(openssl, ["x509", "-in", serverCertificatePath, "-noout", "-ext", "subjectAltName"]);
  return runOpenSsl(openssl, ["x509", "-in", caCertificatePath, "-noout", "-fingerprint", "-sha256"]);
};

const listen = (server: Server, port: number): Promise<void> => new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(port, "0.0.0.0", () => {
    server.off("error", reject);
    resolveListen();
  });
});

const close = (server: Server): Promise<void> => new Promise((resolveClose, reject) => {
  if (!server.listening) return resolveClose();
  server.close(error => error ? reject(error) : resolveClose());
});

const addresses = lanAddresses();
if (addresses.length === 0) {
  throw new Error("スマートフォンから接続できるプライベートIPv4アドレスがありません。PCをWi-FiまたはLANに接続してください。");
}

const openssl = findOpenSsl();
const fingerprint = ensureCertificates(openssl, addresses);
const certificatePort = Number(process.env.DEV_CERT_PORT ?? 8791);
if (!Number.isInteger(certificatePort) || certificatePort < 1 || certificatePort > 65535) {
  throw new Error("DEV_CERT_PORT は 1〜65535 の整数にしてください。");
}

const certificateServer = createServer((request, response) => {
  if ((request.method !== "GET" && request.method !== "HEAD") || request.url?.split("?", 1)[0] !== "/dev-ca.crt") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    response.end("Not found");
    return;
  }
  // Only the public root certificate is returned; its private key stays on this PC.
  const certificate = readFileSync(caCertificatePath);
  response.writeHead(200, {
    "Content-Type": "application/x-x509-ca-cert",
    "Content-Disposition": 'attachment; filename="gijutu-turi-dev-ca.crt"',
    "Content-Length": certificate.byteLength,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : certificate);
});

await listen(certificateServer, certificatePort);
const vitePort = process.env.VITE_PORT ?? "8790";
const backendPort = process.env.BACKEND_PORT ?? "8792";
const environment = {
  ...createPhoneHttpsDevelopmentEnvironment(process.env),
  VITE_HTTPS: "1",
  VITE_TLS_KEY: serverKeyPath,
  VITE_TLS_CERT: serverCertificatePath,
  VITE_PORT: vitePort,
  BACKEND_PORT: backendPort,
  HOST: "127.0.0.1",
  GIJUTU_DB_PATH: resolve(certificateDirectory, "phone-demo.sqlite"),
};
const devRunner = spawn(process.execPath, ["--import", "tsx", resolve(root, "scripts/dev.ts")], {
  cwd: root,
  env: environment,
  stdio: "inherit",
  windowsHide: true,
});

console.log("\n[dev:https] HTTPS 開発サーバーを起動しています。");
console.log(`  PC: https://localhost:${vitePort}/gofish`);
for (const address of addresses) {
  console.log(`  CA証明書: http://${address}:${certificatePort}/dev-ca.crt`);
  console.log(`  スマホ（同じLAN）: https://${address}:${vitePort}/gofish`);
}
console.log(`  専用バックエンド: ${backendPort}（図鑑DBは ${environment.GIJUTU_DB_PATH}）`);
console.log(`  CA SHA-256: ${fingerprint}`);
console.log("  CA秘密鍵は .local-certs/phone-https/dev-ca.key に保存され、このサーバーから配信しません。\n");

let stopping = false;
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  devRunner.kill("SIGTERM");
  void close(certificateServer);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

devRunner.once("error", error => {
  console.error("[dev:https] 開発サーバーを起動できませんでした。", error);
  stop();
});
const exitCode = await new Promise<number>(resolveExit => {
  devRunner.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
});
await close(certificateServer);
process.exitCode = exitCode;
