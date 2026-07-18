import { afterEach, expect, test, vi } from 'vitest';
import { Bot } from 'grammy';

import { createTelegramBot } from '../../src/telegram/bot.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('initializes grammY before handling a webhook update', async () => {
  const init = vi.spyOn(Bot.prototype, 'init').mockResolvedValue(undefined);
  const handleUpdate = vi.spyOn(Bot.prototype, 'handleUpdate').mockResolvedValue(undefined);
  const bot = createTelegramBot({
    groupUpdateHandler: () => Promise.resolve(),
    token: 'test-token',
  });

  await bot.handleUpdate({ payload: { update_id: 1 }, updateId: 1 });

  expect(init).toHaveBeenCalledOnce();
  expect(handleUpdate).toHaveBeenCalledOnce();
});
