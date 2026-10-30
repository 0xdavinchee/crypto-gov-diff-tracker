import { readFile } from 'node:fs/promises';

export function normalizeForumUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`not an absolute URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`not an HTTP(S) URL: ${raw}`);
  }
  if (url.username || url.password) throw new Error(`URL must not contain credentials: ${raw}`);
  if (raw.includes('?') || raw.includes('#')) {
    throw new Error(`URL must not contain a query or fragment: ${raw}`);
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export async function loadConfig(path: string): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`cannot read config ${path}: ${(err as Error).message}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`config ${path} is not valid JSON`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`config ${path} must be a nonempty JSON array of forum URLs`);
  }
  const urls: string[] = [];
  for (const entry of data) {
    if (typeof entry !== 'string') throw new Error(`config ${path}: every entry must be a string`);
    const url = normalizeForumUrl(entry);
    if (urls.includes(url)) throw new Error(`config ${path}: duplicate forum ${url}`);
    urls.push(url);
  }
  return urls;
}
