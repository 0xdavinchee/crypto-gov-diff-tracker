// Any test that forgets to inject a fake fetch fails loudly instead of hitting a forum.
globalThis.fetch = (() => {
  throw new Error('network access is disabled in tests');
}) as typeof fetch;
