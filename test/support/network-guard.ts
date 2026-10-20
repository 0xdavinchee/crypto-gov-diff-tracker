// Loaded by Vitest as a setup file and by CLI subprocesses through `--import`.
// Blocks every outbound connection path, including localhost, before any test code runs.
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

function blocked(target: string): Error {
  return new Error(`Network access is blocked in tests: ${target}`);
}

function describeTarget(args: unknown[]): string {
  const [first, second] = args;
  if (typeof first === 'string' || first instanceof URL) return String(first);
  if (typeof first === 'number') return `${typeof second === 'string' ? second : 'localhost'}:${first}`;
  if (first && typeof first === 'object') {
    const { host, hostname, port, path } = first as Record<string, unknown>;
    return `${String(hostname ?? host ?? path ?? 'localhost')}:${String(port ?? '')}`;
  }
  return 'unknown target';
}

const refuse = (...args: unknown[]): never => {
  throw blocked(describeTarget(args));
};

globalThis.fetch = async (input) => {
  throw blocked(input instanceof Request ? input.url : String(input));
};
for (const mod of [http, https]) {
  mod.request = refuse;
  mod.get = refuse;
}
net.connect = refuse;
net.createConnection = refuse;
net.Socket.prototype.connect = refuse;
tls.connect = refuse;
syncBuiltinESMExports();
