export type FixtureRoutes = Record<string, (init: RequestInit | undefined) => Response | Promise<Response>>;
export type FixtureCall = { url: string; init: RequestInit | undefined };
export type FixtureFetch = typeof fetch & { calls: FixtureCall[] };

// A fetch replacement that only answers URLs listed in `routes` and records every call.
export function createFixtureFetch(routes: FixtureRoutes): FixtureFetch {
  const calls: FixtureCall[] = [];
  const fixtureFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`No fixture for ${url}`);
    return route(init);
  };
  return Object.assign(fixtureFetch, { calls });
}
