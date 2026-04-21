export * from '@skillkit/core';
export * from '@skillkit/agents';

export async function startTUI(...args: unknown[]): Promise<unknown> {
  const mod = await import('@skillkit/tui');
  return mod.startTUI(...(args as Parameters<typeof mod.startTUI>));
}
