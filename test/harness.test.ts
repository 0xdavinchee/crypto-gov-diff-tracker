import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { describe, expect, it } from 'vitest';

const loadFixtureFetch = async () => (await import('./support/fixture-fetch.js')).createFixtureFetch;

const blocked = /network access is blocked in tests/i;

describe('offline test harness', () => {
  it('serves injected fixture responses without the network', async () => {
    const createFixtureFetch = await loadFixtureFetch();
    const fetch = createFixtureFetch({
      'https://forum.example/latest.json': () => Response.json({ topic_list: { topics: [] } }),
    });

    const response = await fetch('https://forum.example/latest.json', {
      headers: { accept: 'application/json' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ topic_list: { topics: [] } });
    expect(fetch.calls.map((call) => call.url)).toEqual(['https://forum.example/latest.json']);
  });

  it('rejects requests the fixture fetch does not know', async () => {
    const fetch = (await loadFixtureFetch())({});

    await expect(fetch('https://forum.example/latest.json')).rejects.toThrow(
      /no fixture for https:\/\/forum\.example\/latest\.json/i,
    );
  });

  // Without the guard each of these would attempt a localhost connection and fail
  // with ECONNREFUSED (or similar) instead of the guard's error.
  it('rejects unmocked native fetch, including localhost', async () => {
    await expect(fetch('http://127.0.0.1:9/latest.json')).rejects.toThrow(blocked);
    await expect(fetch('http://localhost:9/latest.json')).rejects.toThrow(blocked);
  });

  it('rejects HTTP and HTTPS transport attempts immediately', () => {
    expect(() => http.get('http://localhost:9/')).toThrow(blocked);
    expect(() => http.request({ host: '127.0.0.1', port: 9 })).toThrow(blocked);
    expect(() => https.get('https://localhost:9/')).toThrow(blocked);
    expect(() => https.request({ host: '127.0.0.1', port: 9 })).toThrow(blocked);
  });

  it('rejects raw socket connections', () => {
    expect(() => net.connect(9, '127.0.0.1')).toThrow(blocked);
    expect(() => new net.Socket().connect(9, 'localhost')).toThrow(blocked);
  });
});
