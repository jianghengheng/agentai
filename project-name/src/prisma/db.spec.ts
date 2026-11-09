import { afterEach, describe, expect, it, vi } from 'vitest';

const fromConnString = vi.fn(() => ({ setup: vi.fn() }));

vi.mock('@langchain/langgraph-checkpoint-postgres/store', () => ({
  PostgresStore: { fromConnString },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createStore', () => {
  it('creates a PostgresStore from DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    const { createStore } = await import('./db.js');

    createStore();

    expect(fromConnString).toHaveBeenCalledWith('postgresql://localhost/test');
  });
});
