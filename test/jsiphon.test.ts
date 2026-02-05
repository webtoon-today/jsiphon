import { describe, it, expect } from 'vitest';
import { Jsiphon } from '../src/jsiphon.js';
import { META, isAmbiguous } from '../src/types.js';

/**
 * Helper to create an async iterable from strings
 */
async function* toStream(chunks: string[]): AsyncIterable<string> {
    for (const chunk of chunks) {
        yield chunk;
    }
}

/**
 * Helper to collect all snapshots from parser
 */
async function collect<T>(parser: Jsiphon<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const snapshot of parser) {
        results.push(snapshot);
    }
    return results;
}

describe('Jsiphon', () => {
    describe('complete JSON parsing', () => {
        it('parses simple object', async () => {
            const parser = new Jsiphon<{ name: string }>({
                stream: toStream(['{"name": "test"}'])
            });
            const results = await collect(parser);

            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('test');
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
        });

        it('parses nested object', async () => {
            const parser = new Jsiphon<{ user: { name: string } }>({
                stream: toStream(['{"user": {"name": "Alice"}}'])
            });
            const results = await collect(parser);

            expect(results).toHaveLength(1);
            expect(results[0].user.name).toBe('Alice');
        });

        it('parses array', async () => {
            const parser = new Jsiphon<number[]>({
                stream: toStream(['[1, 2, 3]'])
            });
            const results = await collect(parser);

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual(expect.arrayContaining([1, 2, 3]));
        });

        it('parses boolean and null', async () => {
            const parser = new Jsiphon<{ a: boolean; b: boolean; c: null }>({
                stream: toStream(['{"a": true, "b": false, "c": null}'])
            });
            const results = await collect(parser);

            expect(results[0].a).toBe(true);
            expect(results[0].b).toBe(false);
            expect(results[0].c).toBe(null);
        });
    });

    describe('streaming parsing', () => {
        it('yields partial results as chunks arrive', async () => {
            const parser = new Jsiphon<{ msg: string }>({
                stream: toStream(['{"msg": "He', 'llo"}'])
            });
            const results = await collect(parser);

            expect(results).toHaveLength(2);
            expect(results[0].msg).toBe('He');
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(results[1].msg).toBe('Hello');
            expect(isAmbiguous(results[1][META].ambiguous)).toBe(false);
        });

        it('handles character-by-character streaming', async () => {
            const json = '{"a":1}';
            const parser = new Jsiphon<{ a: number }>({
                stream: toStream(json.split(''))
            });
            const results = await collect(parser);

            // Final result should be correct
            const last = results[results.length - 1];
            expect(last.a).toBe(1);
            expect(isAmbiguous(last[META].ambiguous)).toBe(false);
        });
    });

    describe('ambiguity detection', () => {
        it('marks incomplete string as ambiguous', async () => {
            const parser = new Jsiphon<{ msg: string }>({
                stream: toStream(['{"msg": "hel'])
            });
            const results = await collect(parser);

            expect(results[0].msg).toBe('hel');
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.msg)).toBe(true);
        });

        it('marks incomplete number as ambiguous', async () => {
            const parser = new Jsiphon<{ n: number }>({
                stream: toStream(['{"n": 123'])
            });
            const results = await collect(parser);

            expect(results[0].n).toBe(123);
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.n)).toBe(true);
        });

        it('marks incomplete keyword as ambiguous', async () => {
            const parser = new Jsiphon<{ b: boolean }>({
                stream: toStream(['{"b": tru'])
            });
            const results = await collect(parser);

            expect(results[0].b).toBe(true);  // Guessed as true
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(true);
        });
    });

    describe('delta tracking', () => {
        it('tracks new keys', async () => {
            const parser = new Jsiphon<{ a: number; b?: number }>({
                stream: toStream(['{"a": 1', ', "b": 2}'])
            });
            const results = await collect(parser);

            expect(results).toHaveLength(2);
            expect(results[1][META].delta).toEqual({ b: 2 });
        });

        it('tracks string changes', async () => {
            const parser = new Jsiphon<{ msg: string }>({
                stream: toStream(['{"msg": "He', 'llo"}'])
            });
            const results = await collect(parser);

            expect(results[1][META].delta).toEqual({ msg: 'llo' });
        });
    });

    describe('escape sequences', () => {
        it('handles escaped quotes', async () => {
            const parser = new Jsiphon<{ s: string }>({
                stream: toStream(['{"s": "say \\"hello\\""}'])
            });
            const results = await collect(parser);

            expect(results[0].s).toBe('say "hello"');
        });

        it('handles newlines and tabs', async () => {
            const parser = new Jsiphon<{ s: string }>({
                stream: toStream(['{"s": "line1\\nline2\\ttab"}'])
            });
            const results = await collect(parser);

            expect(results[0].s).toBe('line1\nline2\ttab');
        });
    });
});
