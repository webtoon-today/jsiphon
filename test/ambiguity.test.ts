import { describe, it, expect } from 'vitest';
import { META, isAmbiguous, parseChunks } from './helpers.js';

describe('Ambiguity Tree', () => {
    describe('root ambiguity', () => {
        it('marks root as ambiguous when any value is streaming', async () => {
            const results = await parseChunks<{ msg: string }>(['{"msg": "hello']);

            expect(results[0].msg).toBe('hello');
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
        });

        it('marks root as not ambiguous when complete', async () => {
            const results = await parseChunks(['{"msg": "hello"}']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
        });

        it('empty object is not ambiguous', async () => {
            const results = await parseChunks(['{}']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
        });

        it('empty array is not ambiguous', async () => {
            const results = await parseChunks<unknown[]>(['[]']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
        });
    });

    describe('field-level ambiguity', () => {
        it('marks specific field as ambiguous when streaming', async () => {
            const results = await parseChunks<{ msg: string }>(['{"msg": "hel']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.msg)).toBe(true);
        });

        it('marks field as stable when complete', async () => {
            const results = await parseChunks<{ msg: string }>(['{"msg": "hello"}']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.msg)).toBe(false);
        });

        it('marks completed field stable while another streams', async () => {
            const results = await parseChunks<{ a: string; b: string }>(['{"a": "done", "b": "stream']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.a)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(true);
        });
    });

    describe('nested structure ambiguity', () => {
        it('bubbles ambiguity up through nested objects', async () => {
            const results = await parseChunks<{ outer: { inner: string } }>(['{"outer": {"inner": "val']);

            expect(results[0].outer.inner).toBe('val');
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.outer)).toBe(true);
            expect(isAmbiguous((results[0][META].ambiguous.outer as any).inner)).toBe(true);
        });

        it('marks parent stable when all children complete', async () => {
            const results = await parseChunks<{ outer: { inner: string } }>(['{"outer": {"inner": "val"}}']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.outer)).toBe(false);
            expect(isAmbiguous((results[0][META].ambiguous.outer as any).inner)).toBe(false);
        });

        it('marks stable branch while another streams', async () => {
            const results = await parseChunks<{ a: { x: number }; b: { y: number } }>(['{"a": {"x": 1}, "b": {"y": 2']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.a)).toBe(false);
            expect(isAmbiguous((results[0][META].ambiguous.a as any).x)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(true);
            expect(isAmbiguous((results[0][META].ambiguous.b as any).y)).toBe(true);
        });
    });

    describe('array ambiguity', () => {
        it('marks array as ambiguous when element is streaming', async () => {
            const results = await parseChunks<number[]>(['[1, 2, 3']);

            expect(results[0]).toEqual([1, 2, 3]);
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
        });

        it('marks array element by index', async () => {
            const results = await parseChunks<string[]>(['["done", "stream']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous[0])).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous[1])).toBe(true);
        });

        it('marks nested object in array', async () => {
            const results = await parseChunks<{ n: number }[]>(['[{"n": 123']);

            expect(results[0][0].n).toBe(123);
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous[0])).toBe(true);
            expect(isAmbiguous((results[0][META].ambiguous[0] as any).n)).toBe(true);
        });
    });

    describe('incomplete strings', () => {
        it('marks unclosed string value as ambiguous', async () => {
            const results = await parseChunks<{ msg: string }>(['{"msg": "hello']);

            expect(results[0].msg).toBe('hello');
            expect(isAmbiguous(results[0][META].ambiguous.msg)).toBe(true);
        });

        it('marks unclosed property name - root ambiguous', async () => {
            const results = await parseChunks(['{"na']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
        });

        it('clears ambiguity when string is closed', async () => {
            const results = await parseChunks<{ msg: string }>(['{"msg": "hello"', '}']);

            expect(isAmbiguous(results[0][META].ambiguous.msg)).toBe(false);
            expect(isAmbiguous(results[1][META].ambiguous)).toBe(false);
        });

        it('tracks ambiguity through string streaming', async () => {
            const results = await parseChunks<{ s: string }>([
                '{"s": "a',
                'b',
                'c"}'
            ]);

            expect(isAmbiguous(results[0][META].ambiguous.s)).toBe(true);
            expect(isAmbiguous(results[1][META].ambiguous.s)).toBe(true);
            expect(isAmbiguous(results[2][META].ambiguous.s)).toBe(false);
        });
    });

    describe('incomplete numbers', () => {
        it('marks number without delimiter as ambiguous', async () => {
            const results = await parseChunks<{ n: number }>(['{"n": 123']);

            expect(results[0].n).toBe(123);
            expect(isAmbiguous(results[0][META].ambiguous.n)).toBe(true);
        });

        it('marks negative number as ambiguous', async () => {
            const results = await parseChunks<{ n: number }>(['{"n": -45']);

            expect(results[0].n).toBe(-45);
            expect(isAmbiguous(results[0][META].ambiguous.n)).toBe(true);
        });

        it('marks float as ambiguous', async () => {
            const results = await parseChunks<{ n: number }>(['{"n": 3.14']);

            expect(results[0].n).toBe(3.14);
            expect(isAmbiguous(results[0][META].ambiguous.n)).toBe(true);
        });

        it('clears ambiguity when number is delimited', async () => {
            const results = await parseChunks<{ n: number }>(['{"n": 123', '}']);

            expect(isAmbiguous(results[1][META].ambiguous.n)).toBe(false);
        });

        it('clears ambiguity with comma delimiter', async () => {
            const results = await parseChunks<{ a: number; b: number }>(['{"a": 1, "b": 2}']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.a)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(false);
        });
    });

    describe('incomplete keywords', () => {
        it('marks partial true as ambiguous', async () => {
            const results = await parseChunks<{ b: boolean }>(['{"b": tru']);

            expect(results[0].b).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(true);
        });

        it('marks partial false as ambiguous', async () => {
            const results = await parseChunks<{ b: boolean }>(['{"b": fal']);

            expect(results[0].b).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(true);
        });

        it('marks partial null as ambiguous', async () => {
            const results = await parseChunks<{ v: null }>(['{"v": nul']);

            expect(results[0].v).toBe(null);
            expect(isAmbiguous(results[0][META].ambiguous.v)).toBe(true);
        });

        it('clears ambiguity when keyword is complete', async () => {
            const results = await parseChunks<{ b: boolean }>(['{"b": true', '}']);

            expect(isAmbiguous(results[1][META].ambiguous.b)).toBe(false);
        });

        it('handles single character keyword start', async () => {
            const results = await parseChunks<{ b: boolean }>(['{"b": t']);

            expect(results[0].b).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(true);
        });

        it('handles f start correctly guesses false', async () => {
            const results = await parseChunks<{ b: boolean }>(['{"b": f']);

            expect(results[0].b).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(true);
        });

        it('handles n start correctly guesses null', async () => {
            const results = await parseChunks<{ v: null }>(['{"v": n']);

            expect(results[0].v).toBe(null);
            expect(isAmbiguous(results[0][META].ambiguous.v)).toBe(true);
        });
    });

    describe('complete values (no ambiguity)', () => {
        it('complete object is not ambiguous', async () => {
            const results = await parseChunks<{ a: number }>(['{"a": 1}']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.a)).toBe(false);
        });

        it('complete array is not ambiguous', async () => {
            const results = await parseChunks<number[]>(['[1, 2, 3]']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
        });

        it('nested complete structure is not ambiguous', async () => {
            const results = await parseChunks<{ outer: { inner: number[] } }>(['{"outer": {"inner": [1, 2]}}']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.outer)).toBe(false);
            expect(isAmbiguous((results[0][META].ambiguous.outer as any).inner)).toBe(false);
        });
    });

    describe('ambiguity scenarios from README', () => {
        it('handles { - ambiguous (object not closed)', async () => {
            const results = await parseChunks(['{']);

            expect(results[0]).toEqual({});
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
        });

        it('handles {" - ambiguous (property name not closed)', async () => {
            const results = await parseChunks(['{"']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
        });

        it('handles {"key" - ambiguous (waiting for colon, vaue)', async () => {
            const results = await parseChunks(['{"key"']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
        });

        it('handles {"key": - ambiguous (waiting for value)', async () => {
            const results = await parseChunks(['{"key":']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
        });

        it('handles {"key": "val - ambiguous', async () => {
            const results = await parseChunks<{ key: string }>(['{"key": "val']);

            expect(results[0].key).toBe('val');
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.key)).toBe(true);
        });

        it('handles {"key": 123 - ambiguous', async () => {
            const results = await parseChunks<{ key: number }>(['{"key": 123']);

            expect(results[0].key).toBe(123);
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.key)).toBe(true);
        });

        it('handles {"key": "value"} - not ambiguous', async () => {
            const results = await parseChunks<{ key: string }>(['{"key": "value"}']);

            expect(results[0].key).toBe('value');
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[0][META].ambiguous.key)).toBe(false);
        });
    });

    describe('ambiguity transitions', () => {
        it('transitions from ambiguous to not ambiguous', async () => {
            const results = await parseChunks<{ msg: string }>([
                '{"msg": "hel',
                'lo"}'
            ]);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.msg)).toBe(true);
            expect(isAmbiguous(results[1][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[1][META].ambiguous.msg)).toBe(false);
        });

        it('maintains ambiguous state across multiple chunks', async () => {
            const results = await parseChunks<{ msg: string }>([
                '{"msg": "a',
                'b',
                'c',
                '"}'
            ]);

            expect(isAmbiguous(results[0][META].ambiguous.msg)).toBe(true);
            expect(isAmbiguous(results[1][META].ambiguous.msg)).toBe(true);
            expect(isAmbiguous(results[2][META].ambiguous.msg)).toBe(true);
            expect(isAmbiguous(results[3][META].ambiguous.msg)).toBe(false);
        });
    });

    describe('complex scenarios', () => {
        it('tracks deep nested path ambiguity', async () => {
            const results = await parseChunks<{ a: { b: { c: string } } }>(['{"a": {"b": {"c": "streaming']);

            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.a)).toBe(true);
            expect(isAmbiguous((results[0][META].ambiguous.a as any).b)).toBe(true);
            expect(isAmbiguous((results[0][META].ambiguous.a as any).b.c)).toBe(true);
        });

        it('keeps parent ambiguous when child value completes but parent not closed', async () => {
            // Regression test: parent object should remain ambiguous even after
            // child value completes, until the parent receives its closing }
            const results = await parseChunks<{ outer: { first: boolean; second?: unknown[] } }>([
                '{"outer": {"first": true',
                ', "second": []}}'
            ]);

            // Chunk 1: first is complete, but outer object is not closed
            expect(results[0].outer.first).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.outer)).toBe(true);  // Must stay true!
            expect(isAmbiguous((results[0][META].ambiguous.outer as any).first)).toBe(false);

            // Chunk 2: everything complete
            expect(results[1].outer.first).toBe(true);
            expect(results[1].outer.second).toEqual([]);
            expect(isAmbiguous(results[1][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[1][META].ambiguous.outer)).toBe(false);
        });

        it('tracks stability progression', async () => {
            const results = await parseChunks<{ b: { c: string }; d?: string }>([
                '{"b": {"c": "hel',
                'lo"}, "d": "wor',
                'ld"}'
            ]);

            // Chunk 1: c is streaming
            expect(isAmbiguous(results[0][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[0][META].ambiguous.b)).toBe(true);
            expect(isAmbiguous((results[0][META].ambiguous.b as any).c)).toBe(true);

            // Chunk 2: b.c complete, d is streaming
            expect(isAmbiguous(results[1][META].ambiguous)).toBe(true);
            expect(isAmbiguous(results[1][META].ambiguous.b)).toBe(false);
            expect(isAmbiguous((results[1][META].ambiguous.b as any).c)).toBe(false);
            expect(isAmbiguous(results[1][META].ambiguous.d)).toBe(true);

            // Chunk 3: all complete
            expect(isAmbiguous(results[2][META].ambiguous)).toBe(false);
            expect(isAmbiguous(results[2][META].ambiguous.b)).toBe(false);
            expect(isAmbiguous(results[2][META].ambiguous.d)).toBe(false);
        });
    });
});
