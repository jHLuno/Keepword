import { vi } from 'vitest';

export type FakeOpenAi = Readonly<{
  responses: Readonly<{
    parse: ReturnType<typeof vi.fn>;
  }>;
}>;

export function createFakeOpenAi(output: unknown): FakeOpenAi {
  return {
    responses: {
      parse: vi.fn(() => Promise.resolve({ output_parsed: output })),
    },
  };
}
