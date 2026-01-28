import { describe, it, expect } from 'vitest';
import { Jsiphon, META, AMBIGUOUS, toStream, collect, parseChunks } from './helpers.js';

describe('Ambiguity Tree', () => {
    describe('root ambiguity', () => {
        it('marks root as ambiguous when any value is streaming', async () => {
            const results = await parseChunks(['{"msg": "hello']);

            expect(results[0].msg).toBe('hello');
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
        });

        it('marks root as not ambiguous when complete', async () => {
            const results = await parseChunks(['{"msg": "hello"}']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
        });

        it('empty object is not ambiguous', async () => {
            const results = await parseChunks(['{}']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
        });

        it('empty array is not ambiguous', async () => {
            const results = await parseChunks(['[]']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
        });
    });

    describe('field-level ambiguity', () => {
        it('marks specific field as ambiguous when streaming', async () => {
            const results = await parseChunks(['{"msg": "hel']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.msg[AMBIGUOUS]).toBe(true);
        });

        it('marks field as stable when complete', async () => {
            const results = await parseChunks(['{"msg": "hello"}']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.msg[AMBIGUOUS]).toBe(false);
        });

        it('marks completed field stable while another streams', async () => {
            const results = await parseChunks(['{"a": "done", "b": "stream']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.a[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.b[AMBIGUOUS]).toBe(true);
        });
    });

    describe('nested structure ambiguity', () => {
        it('bubbles ambiguity up through nested objects', async () => {
            const results = await parseChunks(['{"outer": {"inner": "val']);

            expect(results[0].outer.inner).toBe('val');
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.outer[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.outer.inner[AMBIGUOUS]).toBe(true);
        });

        it('marks parent stable when all children complete', async () => {
            const results = await parseChunks(['{"outer": {"inner": "val"}}']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.outer[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.outer.inner[AMBIGUOUS]).toBe(false);
        });

        it('marks stable branch while another streams', async () => {
            const results = await parseChunks(['{"a": {"x": 1}, "b": {"y": 2']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.a[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.a.x[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.b[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.b.y[AMBIGUOUS]).toBe(true);
        });
    });

    describe('array ambiguity', () => {
        it('marks array as ambiguous when element is streaming', async () => {
            const results = await parseChunks(['[1, 2, 3']);

            expect(results[0]).toEqual([1, 2, 3]);
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
        });

        it('marks array element by index', async () => {
            const results = await parseChunks(['["done", "stream']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous[0][AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous[1][AMBIGUOUS]).toBe(true);
        });

        it('marks nested object in array', async () => {
            const results = await parseChunks(['[{"n": 123']);

            expect(results[0][0].n).toBe(123);
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous[0][AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous[0].n[AMBIGUOUS]).toBe(true);
        });
    });

    describe('incomplete strings', () => {
        it('marks unclosed string value as ambiguous', async () => {
            const results = await parseChunks(['{"msg": "hello']);

            expect(results[0].msg).toBe('hello');
            expect(results[0][META].ambiguous.msg[AMBIGUOUS]).toBe(true);
        });

        it('marks unclosed property name - root ambiguous', async () => {
            const results = await parseChunks(['{"na']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
        });

        it('clears ambiguity when string is closed', async () => {
            const results = await parseChunks(['{"msg": "hello"', '}']);

            expect(results[0][META].ambiguous.msg[AMBIGUOUS]).toBe(false);
            expect(results[1][META].ambiguous[AMBIGUOUS]).toBe(false);
        });

        it('tracks ambiguity through string streaming', async () => {
            const results = await parseChunks([
                '{"s": "a',
                'b',
                'c"}'
            ]);

            expect(results[0][META].ambiguous.s[AMBIGUOUS]).toBe(true);
            expect(results[1][META].ambiguous.s[AMBIGUOUS]).toBe(true);
            expect(results[2][META].ambiguous.s[AMBIGUOUS]).toBe(false);
        });
    });

    describe('incomplete numbers', () => {
        it('marks number without delimiter as ambiguous', async () => {
            const results = await parseChunks(['{"n": 123']);

            expect(results[0].n).toBe(123);
            expect(results[0][META].ambiguous.n[AMBIGUOUS]).toBe(true);
        });

        it('marks negative number as ambiguous', async () => {
            const results = await parseChunks(['{"n": -45']);

            expect(results[0].n).toBe(-45);
            expect(results[0][META].ambiguous.n[AMBIGUOUS]).toBe(true);
        });

        it('marks float as ambiguous', async () => {
            const results = await parseChunks(['{"n": 3.14']);

            expect(results[0].n).toBe(3.14);
            expect(results[0][META].ambiguous.n[AMBIGUOUS]).toBe(true);
        });

        it('clears ambiguity when number is delimited', async () => {
            const results = await parseChunks(['{"n": 123', '}']);

            expect(results[1][META].ambiguous.n[AMBIGUOUS]).toBe(false);
        });

        it('clears ambiguity with comma delimiter', async () => {
            const results = await parseChunks(['{"a": 1, "b": 2}']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.a[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.b[AMBIGUOUS]).toBe(false);
        });
    });

    describe('incomplete keywords', () => {
        it('marks partial true as ambiguous', async () => {
            const results = await parseChunks(['{"b": tru']);

            expect(results[0].b).toBe(true);
            expect(results[0][META].ambiguous.b[AMBIGUOUS]).toBe(true);
        });

        it('marks partial false as ambiguous', async () => {
            const results = await parseChunks(['{"b": fal']);

            expect(results[0].b).toBe(false);
            expect(results[0][META].ambiguous.b[AMBIGUOUS]).toBe(true);
        });

        it('marks partial null as ambiguous', async () => {
            const results = await parseChunks(['{"v": nul']);

            expect(results[0].v).toBe(null);
            expect(results[0][META].ambiguous.v[AMBIGUOUS]).toBe(true);
        });

        it('clears ambiguity when keyword is complete', async () => {
            const results = await parseChunks(['{"b": true', '}']);

            expect(results[1][META].ambiguous.b[AMBIGUOUS]).toBe(false);
        });

        it('handles single character keyword start', async () => {
            const results = await parseChunks(['{"b": t']);

            expect(results[0].b).toBe(true);
            expect(results[0][META].ambiguous.b[AMBIGUOUS]).toBe(true);
        });

        it('handles f start correctly guesses false', async () => {
            const results = await parseChunks(['{"b": f']);

            expect(results[0].b).toBe(false);
            expect(results[0][META].ambiguous.b[AMBIGUOUS]).toBe(true);
        });

        it('handles n start correctly guesses null', async () => {
            const results = await parseChunks(['{"v": n']);

            expect(results[0].v).toBe(null);
            expect(results[0][META].ambiguous.v[AMBIGUOUS]).toBe(true);
        });
    });

    describe('complete values (no ambiguity)', () => {
        it('complete object is not ambiguous', async () => {
            const results = await parseChunks(['{"a": 1}']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.a[AMBIGUOUS]).toBe(false);
        });

        it('complete array is not ambiguous', async () => {
            const results = await parseChunks(['[1, 2, 3]']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
        });

        it('nested complete structure is not ambiguous', async () => {
            const results = await parseChunks(['{"outer": {"inner": [1, 2]}}']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.outer[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.outer.inner[AMBIGUOUS]).toBe(false);
        });
    });

    describe('ambiguity scenarios from README', () => {
        it('handles { - ambiguous (object not closed)', async () => {
            const results = await parseChunks(['{']);

            expect(results[0]).toEqual({});
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
        });

        it('handles {" - ambiguous (property name not closed)', async () => {
            const results = await parseChunks(['{"']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
        });

        it('handles {"key" - ambiguous (waiting for colon, vaue)', async () => {
            const results = await parseChunks(['{"key"']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
        });

        it('handles {"key": - ambiguous (waiting for value)', async () => {
            const results = await parseChunks(['{"key":']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
        });

        it('handles {"key": "val - ambiguous', async () => {
            const results = await parseChunks(['{"key": "val']);

            expect(results[0].key).toBe('val');
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.key[AMBIGUOUS]).toBe(true);
        });

        it('handles {"key": 123 - ambiguous', async () => {
            const results = await parseChunks(['{"key": 123']);

            expect(results[0].key).toBe(123);
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.key[AMBIGUOUS]).toBe(true);
        });

        it('handles {"key": "value"} - not ambiguous', async () => {
            const results = await parseChunks(['{"key": "value"}']);

            expect(results[0].key).toBe('value');
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(false);
            expect(results[0][META].ambiguous.key[AMBIGUOUS]).toBe(false);
        });
    });

    describe('ambiguity transitions', () => {
        it('transitions from ambiguous to not ambiguous', async () => {
            const results = await parseChunks([
                '{"msg": "hel',
                'lo"}'
            ]);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.msg[AMBIGUOUS]).toBe(true);
            expect(results[1][META].ambiguous[AMBIGUOUS]).toBe(false);
            expect(results[1][META].ambiguous.msg[AMBIGUOUS]).toBe(false);
        });

        it('maintains ambiguous state across multiple chunks', async () => {
            const results = await parseChunks([
                '{"msg": "a',
                'b',
                'c',
                '"}'
            ]);

            expect(results[0][META].ambiguous.msg[AMBIGUOUS]).toBe(true);
            expect(results[1][META].ambiguous.msg[AMBIGUOUS]).toBe(true);
            expect(results[2][META].ambiguous.msg[AMBIGUOUS]).toBe(true);
            expect(results[3][META].ambiguous.msg[AMBIGUOUS]).toBe(false);
        });
    });

    describe('complex scenarios', () => {
        it('tracks deep nested path ambiguity', async () => {
            const results = await parseChunks(['{"a": {"b": {"c": "streaming']);

            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.a[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.a.b[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.a.b.c[AMBIGUOUS]).toBe(true);
        });

        it('tracks stability progression', async () => {
            const results = await parseChunks([
                '{"b": {"c": "hel',
                'lo"}, "d": "wor',
                'ld"}'
            ]);

            // Chunk 1: c is streaming
            expect(results[0][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.b[AMBIGUOUS]).toBe(true);
            expect(results[0][META].ambiguous.b.c[AMBIGUOUS]).toBe(true);

            // Chunk 2: b.c complete, d is streaming
            expect(results[1][META].ambiguous[AMBIGUOUS]).toBe(true);
            expect(results[1][META].ambiguous.b[AMBIGUOUS]).toBe(false);
            expect(results[1][META].ambiguous.b.c[AMBIGUOUS]).toBe(false);
            expect(results[1][META].ambiguous.d[AMBIGUOUS]).toBe(true);

            // Chunk 3: all complete
            expect(results[2][META].ambiguous[AMBIGUOUS]).toBe(false);
            expect(results[2][META].ambiguous.b[AMBIGUOUS]).toBe(false);
            expect(results[2][META].ambiguous.d[AMBIGUOUS]).toBe(false);
        });
    });
});
