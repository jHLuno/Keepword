import { vi } from 'vitest';

export type FakeOpenAi = Readonly<{
  chat: Readonly<{
    completions: Readonly<{
      create: ReturnType<typeof vi.fn>;
    }>;
  }>;
}>;

export function createFakeOpenAi(output: unknown): FakeOpenAi {
  return {
    chat: {
      completions: {
        create: vi.fn(() => Promise.resolve({ choices: [{ message: { content: JSON.stringify(output) } }] })),
      },
    },
  };
}
