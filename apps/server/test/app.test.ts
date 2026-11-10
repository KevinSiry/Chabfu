import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type SaveStore, type StoredSave } from '../src/app.ts';

let stored: StoredSave | null = null;
let down = false;
const store: SaveStore = {
  async get() {
    if (down) throw new Error('down');
    return stored;
  },
  async put(save) {
    if (down) throw new Error('down');
    stored = { save, updatedAt: '2026-11-11T00:00:00.000Z' };
    return stored;
  },
  async ping() {
    if (down) throw new Error('down');
  },
};

const server = createApp(store);
let base = '';
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const save = { format: 'chabfu-save', version: 1, savedAt: 'x', data: { 'chabfu.character.v1': { name: 'A' } } };

describe('API de sauvegarde', () => {
  it('répond 404 tant que rien n’est sauvegardé', async () => {
    expect((await fetch(`${base}/api/save`)).status).toBe(404);
  });

  it('garde puis rend la sauvegarde', async () => {
    const put = await fetch(`${base}/api/save`, { method: 'PUT', body: JSON.stringify(save) });
    expect(put.status).toBe(200);
    const got = await (await fetch(`${base}/api/save`)).json();
    expect(got.save).toEqual(save);
  });

  it('refuse ce qui n’est pas une sauvegarde', async () => {
    for (const body of ['pas du json', '{}', JSON.stringify({ ...save, version: 0 }), JSON.stringify({ ...save, data: [] })]) {
      expect((await fetch(`${base}/api/save`, { method: 'PUT', body })).status).toBe(400);
    }
    expect((await fetch(`${base}/api/save`, { method: 'DELETE' })).status).toBe(405);
  });

  it('signale une base indisponible', async () => {
    down = true;
    expect((await fetch(`${base}/api/health`)).status).toBe(503);
    expect((await fetch(`${base}/api/save`)).status).toBe(503);
    down = false;
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });
});
