import { describe, expect, it } from 'vitest';

import { JsonRepository } from '../json-repository';
import { SupabaseRepository } from '../supabase-repository';

/**
 * The two adapters must not drift apart.
 *
 * `Repository` is a TypeScript interface, so it disappears at build time: a method added
 * to `JsonRepository` and used by a server action would compile, pass the offline test
 * suite, and only fail in production — where the Supabase adapter is the one that runs.
 * This suite is the compile-time contract's runtime counterpart.
 *
 * It deliberately checks shape, not behaviour. Behavioural equivalence needs a live
 * database; what can be checked without one is that neither adapter has grown or lost a
 * method, and that constructing the Supabase adapter costs nothing.
 */

/** Test and demo helpers. Not on `Repository`, and meaningless against a database. */
const JSON_ONLY_HELPERS = new Set(['reset', 'snapshot']);

/**
 * `private` is erased at runtime, so `JsonRepository`'s own plumbing — the write mutex,
 * the temp-file persist, the id stamper — sits on the prototype next to the interface
 * methods. None of it is part of the contract. A new private helper on either adapter
 * will fail this suite until it is named here, which is the intended nudge: check
 * whether it was meant to be interface surface.
 */
const JSON_INTERNALS = new Set(['persist', 'read', 'write', 'stamp', 'patchRow']);

function methodNames(prototype: object): string[] {
  const own = prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor' && typeof own[name] === 'function')
    .sort();
}

function arity(prototype: object, name: string): number {
  const method = (prototype as Record<string, unknown>)[name];
  if (typeof method !== 'function') throw new Error(`${name} is not a method`);
  return method.length;
}

const contractMethods = methodNames(JsonRepository.prototype).filter(
  (name) => !JSON_ONLY_HELPERS.has(name) && !JSON_INTERNALS.has(name),
);
const supabaseMethods = new Set(methodNames(SupabaseRepository.prototype));

describe('repository adapter parity', () => {
  it('finds the methods it is meant to compare', () => {
    // Guards the guard: a typo in the reflection above would otherwise make every
    // assertion below pass over an empty list.
    expect(contractMethods.length).toBeGreaterThan(40);
    expect(contractMethods).toContain('getDeviceContextByToken');
    expect(contractMethods).toContain('createRemindersIgnoringDuplicates');
    expect(contractMethods).toContain('nextWorkOrderSequence');
    expect(contractMethods).toContain('listDueRemindersAcrossOrgs');
  });

  it.each(contractMethods)('SupabaseRepository implements %s()', (name) => {
    expect(supabaseMethods.has(name)).toBe(true);
  });

  it('implements every JsonRepository method', () => {
    const missing = contractMethods.filter((name) => !supabaseMethods.has(name));
    expect(missing).toEqual([]);
  });

  it('keeps the JSON-only helpers off the Supabase adapter', () => {
    for (const helper of JSON_ONLY_HELPERS) {
      // Through `unknown`: a class prototype has no string index signature, so TypeScript
      // rightly refuses the direct cast. The reflection is the point of this test.
      const proto = JsonRepository.prototype as unknown as Record<string, unknown>;
      expect(typeof proto[helper]).toBe('function');
      expect(supabaseMethods.has(helper)).toBe(false);
    }
  });

  it('takes the same required arguments in both adapters', () => {
    // `Function.length` stops at the first defaulted parameter, so this catches an
    // argument added on one side — drift the type system stops seeing the moment a call
    // site goes through a dynamic import.
    const mismatched = contractMethods
      .map((name) => ({
        name,
        json: arity(JsonRepository.prototype, name),
        supabase: arity(SupabaseRepository.prototype, name),
      }))
      .filter(({ json, supabase }) => json !== supabase);

    expect(mismatched).toEqual([]);
  });

  it('creates no client until a query runs', () => {
    // `getRepository()` constructs this once per process, long before any request exists,
    // and `next build` imports the module with no credentials at all.
    let calls = 0;
    const repository = new SupabaseRepository(() => {
      calls += 1;
      throw new Error('the client factory must not run at construction time');
    });

    expect(repository).toBeInstanceOf(SupabaseRepository);
    expect(calls).toBe(0);
  });
});
