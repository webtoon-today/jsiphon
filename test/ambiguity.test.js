import { describe, it, expect } from 'vitest';
import { Jsiphon, META, toStream, collect, parseChunks } from './helpers.js';

describe('Ambiguity Detection', () => {
    describe('incomplete strings', () => {
        it('marks unclosed string value as ambiguous', async () => {
            const results = await parseChunks(['{"msg": "hello']);

            expect(results[0].msg).toBe('hello');
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('string value is not closed');
        });

        it('marks unclosed property name as ambiguous', async () => {
            const results = await parseChunks(['{"na']);

            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('property name is not closed');
        });

        it('clears ambiguity when string is closed', async () => {
            const results = await parseChunks(['{"msg": "hello"', '}']);

            expect(results[0][META].ambiguous).toBe(false);
            expect(results[1][META].ambiguous).toBe(false);
        });

        it('tracks ambiguity through string streaming', async () => {
            const results = await parseChunks([
                '{"s": "a',
                'b',
                'c"}'
            ]);

            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('string value is not closed');
            expect(results[1][META].ambiguous).toBe(true);
            expect(results[2][META].ambiguous).toBe(false);
        });
    });

    describe('incomplete numbers', () => {
        it('marks number without delimiter as ambiguous', async () => {
            const results = await parseChunks(['{"n": 123']);

            expect(results[0].n).toBe(123);
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('number value may continue');
        });

        it('marks negative number as ambiguous', async () => {
            const results = await parseChunks(['{"n": -45']);

            expect(results[0].n).toBe(-45);
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('number value may continue');
        });

        it('marks float as ambiguous', async () => {
            const results = await parseChunks(['{"n": 3.14']);

            expect(results[0].n).toBe(3.14);
            expect(results[0][META].ambiguous).toBe(true);
        });

        it('clears ambiguity when number is delimited', async () => {
            const results = await parseChunks(['{"n": 123', '}']);

            expect(results[1][META].ambiguous).toBe(false);
        });

        it('clears ambiguity with comma delimiter', async () => {
            const results = await parseChunks(['{"a": 1, "b": 2}']);

            expect(results[0][META].ambiguous).toBe(false);
        });
    });

    describe('incomplete keywords', () => {
        it('marks partial true as ambiguous', async () => {
            const results = await parseChunks(['{"b": tru']);

            expect(results[0].b).toBe(true);
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('boolean value is incomplete');
        });

        it('marks partial false as ambiguous', async () => {
            const results = await parseChunks(['{"b": fal']);

            expect(results[0].b).toBe(false);
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('boolean value is incomplete');
        });

        it('marks partial null as ambiguous', async () => {
            const results = await parseChunks(['{"v": nul']);

            expect(results[0].v).toBe(null);
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('null value is incomplete');
        });

        it('clears ambiguity when keyword is complete', async () => {
            const results = await parseChunks(['{"b": true', '}']);

            expect(results[1][META].ambiguous).toBe(false);
        });

        it('handles single character keyword start', async () => {
            const results = await parseChunks(['{"b": t']);

            expect(results[0].b).toBe(true);
            expect(results[0][META].ambiguous).toBe(true);
        });

        it('handles f start correctly guesses false', async () => {
            const results = await parseChunks(['{"b": f']);

            expect(results[0].b).toBe(false);
            expect(results[0][META].ambiguous).toBe(true);
        });

        it('handles n start correctly guesses null', async () => {
            const results = await parseChunks(['{"v": n']);

            expect(results[0].v).toBe(null);
            expect(results[0][META].ambiguous).toBe(true);
        });
    });

    describe('complete values (no ambiguity)', () => {
        it('complete object is not ambiguous', async () => {
            const results = await parseChunks(['{"a": 1}']);

            expect(results[0][META].ambiguous).toBe(false);
            expect(results[0][META].reason).toBeUndefined();
        });

        it('complete array is not ambiguous', async () => {
            const results = await parseChunks(['[1, 2, 3]']);

            expect(results[0][META].ambiguous).toBe(false);
        });

        it('empty object is not ambiguous', async () => {
            const results = await parseChunks(['{}']);

            expect(results[0][META].ambiguous).toBe(false);
        });

        it('empty array is not ambiguous', async () => {
            const results = await parseChunks(['[]']);

            expect(results[0][META].ambiguous).toBe(false);
        });

        it('nested complete structure is not ambiguous', async () => {
            const results = await parseChunks(['{"outer": {"inner": [1, 2]}}']);

            expect(results[0][META].ambiguous).toBe(false);
        });
    });

    describe('ambiguity in nested structures', () => {
        it('marks nested incomplete string as ambiguous', async () => {
            const results = await parseChunks(['{"outer": {"inner": "val']);

            expect(results[0].outer.inner).toBe('val');
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('string value is not closed');
        });

        it('marks incomplete array element as ambiguous', async () => {
            const results = await parseChunks(['[1, 2, 3']);

            expect(results[0]).toEqual([1, 2, 3]);
            expect(results[0][META].ambiguous).toBe(true);
        });

        it('marks incomplete nested object property as ambiguous', async () => {
            const results = await parseChunks(['{"items": [{"n": 123']);

            expect(results[0].items[0].n).toBe(123);
            expect(results[0][META].ambiguous).toBe(true);
        });
    });

    describe('ambiguity scenarios from README', () => {
        it('handles { - not ambiguous', async () => {
            const results = await parseChunks(['{']);

            expect(results[0]).toEqual({});
            expect(results[0][META].ambiguous).toBe(false);
        });

        it('handles {" - ambiguous (property name not closed)', async () => {
            const results = await parseChunks(['{"']);

            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('property name is not closed');
        });

        it('handles {"key" - not ambiguous', async () => {
            const results = await parseChunks(['{"key"']);

            // After key is complete but before colon
            expect(results[0][META].ambiguous).toBe(false);
        });

        it('handles {"key": - not ambiguous', async () => {
            const results = await parseChunks(['{"key":']);

            expect(results[0][META].ambiguous).toBe(false);
        });

        it('handles {"key": "val - ambiguous', async () => {
            const results = await parseChunks(['{"key": "val']);

            expect(results[0].key).toBe('val');
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('string value is not closed');
        });

        it('handles {"key": 123 - ambiguous', async () => {
            const results = await parseChunks(['{"key": 123']);

            expect(results[0].key).toBe(123);
            expect(results[0][META].ambiguous).toBe(true);
            expect(results[0][META].reason).toBe('number value may continue');
        });

        it('handles {"key": "value"} - not ambiguous', async () => {
            const results = await parseChunks(['{"key": "value"}']);

            expect(results[0].key).toBe('value');
            expect(results[0][META].ambiguous).toBe(false);
        });
    });

    describe('ambiguity transitions', () => {
        it('transitions from ambiguous to not ambiguous', async () => {
            const results = await parseChunks([
                '{"msg": "hel',
                'lo"}'
            ]);

            expect(results[0][META].ambiguous).toBe(true);
            expect(results[1][META].ambiguous).toBe(false);
        });

        it('maintains ambiguous state across multiple chunks', async () => {
            const results = await parseChunks([
                '{"msg": "a',
                'b',
                'c',
                '"}'
            ]);

            expect(results[0][META].ambiguous).toBe(true);
            expect(results[1][META].ambiguous).toBe(true);
            expect(results[2][META].ambiguous).toBe(true);
            expect(results[3][META].ambiguous).toBe(false);
        });
    });
});
