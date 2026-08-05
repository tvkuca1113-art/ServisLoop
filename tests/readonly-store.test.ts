import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Regression guard for "the site is down on Vercel".
 *
 * Serverless platforms mount the deployment read-only. `JsonRepository` seeds itself in
 * its constructor and immediately persists that seed, so on a deploy with no Supabase
 * configured the very first write threw `EROFS` — before any request could be served —
 * and every page returned a 500.
 *
 * The failure is simulated by making `node:fs` refuse writes rather than by chmod'ing a
 * directory: the test process usually runs as root in CI, and root bypasses permission
 * bits, so a permissions-based test would silently pass for the wrong reason.
 */

const erofs = (): never => {
  const error = new Error('EROFS: read-only file system') as NodeJS.ErrnoException;
  error.code = 'EROFS';
  throw error;
};

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: () => false, // nothing on disk yet, so the constructor seeds and persists
    mkdirSync: erofs,
    writeFileSync: erofs,
    renameSync: erofs,
  };
});

const { JsonRepository } = await import('@/server/data/json-repository');
const { createDemoStore, DEMO } = await import('@/server/data/seed');
const { civilDate } = await import('@/domain/dates');

const TARGET = join('/nonexistent-readonly-root', 'servisloop', 'store.json');
const ANCHOR = civilDate('2026-08-02');

const newRepo = () =>
  new JsonRepository({ filePath: TARGET, seed: () => createDemoStore(ANCHOR) });

describe('JsonRepository on a read-only filesystem', () => {
  it('constructs without throwing, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const repo = newRepo();

    expect(repo).toBeInstanceOf(JsonRepository);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/EROFS/);
    warn.mockRestore();
  });

  it('serves the demo organisation from memory', async () => {
    const repo = newRepo();

    expect((await repo.getOrganization(DEMO.orgId))?.slug).toBe('demo');
    expect((await repo.listDevices(DEMO.orgId)).length).toBeGreaterThan(0);
    expect((await repo.listWorkOrders(DEMO.orgId)).length).toBeGreaterThan(0);
    expect((await repo.listCustomers(DEMO.orgId)).length).toBeGreaterThan(0);
  });

  it('still accepts writes, holding them in memory', async () => {
    const repo = newRepo();

    const customer = await repo.createCustomer({
      orgId: DEMO.orgId,
      name: 'Read-only test customer',
      contactName: null,
      email: null,
      phone: null,
      externalRef: null,
      notes: null,
      archivedAt: null,
    });

    expect(customer.id).toBeTruthy();
    expect((await repo.getCustomer(DEMO.orgId, customer.id))?.name).toBe(
      'Read-only test customer',
    );
  });

  it('does not warn again on every subsequent write', async () => {
    const repo = newRepo();

    // The constructor already warned; further writes must stay quiet, or a busy instance
    // would repeat the same line in the platform log on every single request.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (let i = 0; i < 5; i += 1) {
      await repo.createCustomer({
        orgId: DEMO.orgId,
        name: `Customer ${i}`,
        contactName: null,
        email: null,
        phone: null,
        externalRef: null,
        notes: null,
        archivedAt: null,
      });
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
