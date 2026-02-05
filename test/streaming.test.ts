import { describe, it, expect } from 'vitest';
import { META, isAmbiguous, parseChunks } from './helpers.js';

describe('Streaming Parsing', () => {
    describe('partial string values', () => {
        it('yields partial string as chunks arrive', async () => {
            const results = await parseChunks<{ msg: string }>(['{"msg": "He', 'llo', '"}']);

            expect(results).toHaveLength(3);
            expect(results[0].msg).toBe('He');
            expect(results[1].msg).toBe('Hello');
            expect(results[2].msg).toBe('Hello');
        });

        it('handles string split at any character', async () => {
            const results = await parseChunks<{ s: string }>(['{"s": "a', 'b', 'c', 'd', '"}']);

            expect(results[0].s).toBe('a');
            expect(results[1].s).toBe('ab');
            expect(results[2].s).toBe('abc');
            expect(results[3].s).toBe('abcd');
            expect(results[4].s).toBe('abcd');
        });
    });

    describe('partial number values', () => {
        it('yields partial number as digits arrive', async () => {
            const results = await parseChunks<{ n: number }>(['{"n": 1', '2', '3}']);

            expect(results[0].n).toBe(1);
            expect(results[1].n).toBe(12);
            expect(results[2].n).toBe(123);
        });

        it('handles negative number streaming', async () => {
            const results = await parseChunks<{ n: number }>(['{"n": -', '4', '2}']);

            // After "-" we might not have a valid number yet
            expect(results[results.length - 1].n).toBe(-42);
        });

        it('handles float streaming', async () => {
            const results = await parseChunks<{ n: number }>(['{"n": 3', '.', '1', '4}']);

            expect(results[results.length - 1].n).toBe(3.14);
        });
    });

    describe('partial keywords', () => {
        it('yields guessed true before complete', async () => {
            const results = await parseChunks<{ b: boolean }>(['{"b": t', 'r', 'u', 'e}']);

            // Parser should guess "true" once it sees "t"
            expect(results[0].b).toBe(true);
            expect(results[results.length - 1].b).toBe(true);
        });

        it('yields guessed false before complete', async () => {
            const results = await parseChunks<{ b: boolean }>(['{"b": f', 'alse}']);

            expect(results[0].b).toBe(false);
            expect(results[results.length - 1].b).toBe(false);
        });

        it('yields guessed null before complete', async () => {
            const results = await parseChunks<{ v: null }>(['{"v": n', 'ull}']);

            expect(results[0].v).toBe(null);
            expect(results[results.length - 1].v).toBe(null);
        });
    });

    describe('partial object structure', () => {
        it('yields empty object after opening brace', async () => {
            const results = await parseChunks<{ a?: number }>([ '{', '"a": 1}']);

            expect(results[0]).toEqual({});
            expect(results[1].a).toBe(1);
        });

        it('handles property key split across chunks', async () => {
            const results = await parseChunks<{ name: string }>(['{"na', 'me": "test"}']);

            expect(results[results.length - 1].name).toBe('test');
        });

        it('handles multiple properties arriving incrementally', async () => {
            const results = await parseChunks<{ a: number; b?: number; c?: number }>([
                '{"a": 1',
                ', "b": 2',
                ', "c": 3}'
            ]);

            expect(results[0].a).toBe(1);
            expect(results[1].b).toBe(2);
            expect(results[2].c).toBe(3);
        });
    });

    describe('partial array structure', () => {
        it('yields empty array after opening bracket', async () => {
            const results = await parseChunks<number[]>(['[', '1]']);

            expect(results[0]).toEqual([]);
            expect(results[1]).toEqual([1]);
        });

        it('handles elements arriving one by one', async () => {
            const results = await parseChunks<number[]>(['[1', ', 2', ', 3]']);

            expect(results[0]).toEqual([1]);
            expect(results[1]).toEqual([1, 2]);
            expect(results[2]).toEqual([1, 2, 3]);
        });

        it('handles array of objects streaming', async () => {
            const results = await parseChunks<{ a?: number; b?: number }[]>([
                '[{"a": 1}',
                ', {"b": 2}]'
            ]);

            expect(results[0]).toEqual([{ a: 1 }]);
            expect(results[1]).toEqual([{ a: 1 }, { b: 2 }]);
        });
    });

    describe('character-by-character streaming', () => {
        it('handles object character by character', async () => {
            const json = '{"a":1}';
            const results = await parseChunks<{ a: number }>(json.split(''));

            const last = results[results.length - 1];
            expect(last.a).toBe(1);
            expect(isAmbiguous(last[META].ambiguous)).toBe(false);
        });

        it('handles array character by character', async () => {
            const json = '[1,2,3]';
            const results = await parseChunks<number[]>(json.split(''));

            const last = results[results.length - 1];
            expect(last).toEqual([1, 2, 3]);
        });

        it('handles nested structure character by character', async () => {
            const json = '{"x":[1,2]}';
            const results = await parseChunks<{ x: number[] }>(json.split(''));

            const last = results[results.length - 1];
            expect(last.x).toEqual([1, 2]);
        });
    });

    describe('append-only guarantee', () => {
        it('never removes previously parsed data', async () => {
            const results = await parseChunks<{ msg: string }>([
                '{"msg": "He',
                'llo',
                ' World"}'
            ]);

            // Each snapshot should contain at least what previous had
            expect(results[0].msg).toBe('He');
            expect(results[1].msg.startsWith('He')).toBe(true);
            expect(results[2].msg.startsWith('Hello')).toBe(true);
        });

        it('never reduces array length', async () => {
            const results = await parseChunks<number[]>([
                '[1',
                ', 2',
                ', 3]'
            ]);

            expect(results[0].length).toBe(1);
            expect(results[1].length).toBeGreaterThanOrEqual(results[0].length);
            expect(results[2].length).toBeGreaterThanOrEqual(results[1].length);
        });

        it('never removes object properties', async () => {
            const results = await parseChunks<{ a: number; b?: number; c?: number }>([
                '{"a": 1',
                ', "b": 2',
                ', "c": 3}'
            ]);

            expect(Object.keys(results[0])).toContain('a');
            expect(Object.keys(results[1])).toContain('a');
            expect(Object.keys(results[1])).toContain('b');
            expect(Object.keys(results[2])).toContain('a');
            expect(Object.keys(results[2])).toContain('b');
            expect(Object.keys(results[2])).toContain('c');
        });
    });

    describe('large chunk handling', () => {
        it('handles single large chunk', async () => {
            const largeObj = { items: Array(100).fill(0).map((_, i) => ({ id: i, name: `item${i}` })) };
            const json = JSON.stringify(largeObj);
            const results = await parseChunks<{ items: { id: number; name: string }[] }>([json]);

            expect(results[0].items.length).toBe(100);
            expect(results[0].items[99].id).toBe(99);
        });

        it('handles varying chunk sizes', async () => {
            const json = '{"a": 1, "b": 2, "c": 3, "d": 4}';
            const results = await parseChunks<{ a: number; b: number; c: number; d: number }>([
                json.slice(0, 5),   // {"a":
                json.slice(5, 15),  //  1, "b": 2
                json.slice(15)      // , "c": 3, "d": 4}
            ]);

            const last = results[results.length - 1];
            expect(last).toEqual({ a: 1, b: 2, c: 3, d: 4 });
        });
    });

    describe('empty chunks', () => {
        it('handles empty string chunks gracefully', async () => {
            const results = await parseChunks<{ a: number }>(['{"a":', '', ' 1', '', '}']);

            const last = results[results.length - 1];
            expect(last.a).toBe(1);
        });
    });

    describe('snapshot isolation', () => {
        it('snapshots are independent objects', async () => {
            const results = await parseChunks<{ a: number; b?: number }>(['{"a": 1', ', "b": 2}']);

            // Modifying one snapshot shouldn't affect others
            results[0].a = 999;
            expect(results[1].a).toBe(1);
        });
    });
});
