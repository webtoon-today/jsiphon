import { describe, it, expect } from 'vitest';
import { Jsiphon, META, toStream, collect, parseChunks } from './helpers.js';

describe('Basic JSON Parsing', () => {
    describe('primitive values', () => {
        it('parses string value', async () => {
            const results = await parseChunks(['"hello"']);
            expect(results[0]).toBe('hello');
            expect(results[0][META].ambiguous).toBe(false);
        });

        it('parses empty string', async () => {
            const results = await parseChunks(['""']);
            expect(results[0]).toBe('');
        });

        it('parses integer', async () => {
            const results = await parseChunks(['42']);
            expect(results[0]).toBe(42);
        });

        it('parses negative integer', async () => {
            const results = await parseChunks(['-123']);
            expect(results[0]).toBe(-123);
        });

        it('parses zero', async () => {
            const results = await parseChunks(['0']);
            expect(results[0]).toBe(0);
        });

        it('parses float', async () => {
            const results = await parseChunks(['3.14']);
            expect(results[0]).toBe(3.14);
        });

        it('parses negative float', async () => {
            const results = await parseChunks(['-0.5']);
            expect(results[0]).toBe(-0.5);
        });

        it('parses scientific notation', async () => {
            const results = await parseChunks(['1e10']);
            expect(results[0]).toBe(1e10);
        });

        it('parses scientific notation with negative exponent', async () => {
            const results = await parseChunks(['1.5e-3']);
            expect(results[0]).toBe(1.5e-3);
        });

        it('parses scientific notation with plus sign', async () => {
            const results = await parseChunks(['2.5E+4']);
            expect(results[0]).toBe(2.5e4);
        });

        it('parses true', async () => {
            const results = await parseChunks(['true']);
            expect(results[0]).toBe(true);
        });

        it('parses false', async () => {
            const results = await parseChunks(['false']);
            expect(results[0]).toBe(false);
        });

        it('parses null', async () => {
            const results = await parseChunks(['null']);
            expect(results[0]).toBe(null);
        });
    });

    describe('simple objects', () => {
        it('parses empty object', async () => {
            const results = await parseChunks(['{}']);
            expect(results[0]).toEqual({});
            expect(results[0][META].ambiguous).toBe(false);
        });

        it('parses object with single string property', async () => {
            const results = await parseChunks(['{"name": "test"}']);
            expect(results[0].name).toBe('test');
        });

        it('parses object with single number property', async () => {
            const results = await parseChunks(['{"age": 25}']);
            expect(results[0].age).toBe(25);
        });

        it('parses object with single boolean property', async () => {
            const results = await parseChunks(['{"active": true}']);
            expect(results[0].active).toBe(true);
        });

        it('parses object with null property', async () => {
            const results = await parseChunks(['{"value": null}']);
            expect(results[0].value).toBe(null);
        });

        it('parses object with multiple properties', async () => {
            const results = await parseChunks(['{"a": 1, "b": 2, "c": 3}']);
            expect(results[0]).toEqual({ a: 1, b: 2, c: 3 });
        });

        it('parses object with mixed value types', async () => {
            const results = await parseChunks(['{"s": "str", "n": 42, "b": true, "x": null}']);
            expect(results[0]).toEqual({ s: 'str', n: 42, b: true, x: null });
        });
    });

    describe('simple arrays', () => {
        it('parses empty array', async () => {
            const results = await parseChunks(['[]']);
            expect(results[0]).toEqual([]);
            expect(results[0][META].ambiguous).toBe(false);
        });

        it('parses array of numbers', async () => {
            const results = await parseChunks(['[1, 2, 3]']);
            expect(results[0]).toEqual([1, 2, 3]);
        });

        it('parses array of strings', async () => {
            const results = await parseChunks(['["a", "b", "c"]']);
            expect(results[0]).toEqual(['a', 'b', 'c']);
        });

        it('parses array of booleans', async () => {
            const results = await parseChunks(['[true, false, true]']);
            expect(results[0]).toEqual([true, false, true]);
        });

        it('parses array with mixed types', async () => {
            const results = await parseChunks(['[1, "two", true, null]']);
            expect(results[0]).toEqual([1, 'two', true, null]);
        });

        it('parses array with single element', async () => {
            const results = await parseChunks(['[42]']);
            expect(results[0]).toEqual([42]);
        });
    });

    describe('nested objects', () => {
        it('parses object with nested object', async () => {
            const results = await parseChunks(['{"outer": {"inner": "value"}}']);
            expect(results[0].outer.inner).toBe('value');
        });

        it('parses deeply nested objects', async () => {
            const results = await parseChunks(['{"a": {"b": {"c": {"d": 1}}}}']);
            expect(results[0].a.b.c.d).toBe(1);
        });

        it('parses object with multiple nested objects', async () => {
            const results = await parseChunks(['{"x": {"a": 1}, "y": {"b": 2}}']);
            expect(results[0].x.a).toBe(1);
            expect(results[0].y.b).toBe(2);
        });
    });

    describe('nested arrays', () => {
        it('parses array with nested array', async () => {
            const results = await parseChunks(['[[1, 2], [3, 4]]']);
            expect(results[0]).toEqual([[1, 2], [3, 4]]);
        });

        it('parses deeply nested arrays', async () => {
            const results = await parseChunks(['[[[1]]]']);
            expect(results[0]).toEqual([[[1]]]);
        });
    });

    describe('mixed nesting', () => {
        it('parses object containing array', async () => {
            const results = await parseChunks(['{"items": [1, 2, 3]}']);
            expect(results[0].items).toEqual([1, 2, 3]);
        });

        it('parses array containing objects', async () => {
            const results = await parseChunks(['[{"a": 1}, {"b": 2}]']);
            expect(results[0]).toEqual([{ a: 1 }, { b: 2 }]);
        });

        it('parses complex nested structure', async () => {
            const json = '{"users": [{"name": "Alice", "tags": ["admin", "user"]}, {"name": "Bob", "tags": ["user"]}]}';
            const results = await parseChunks([json]);
            expect(results[0].users[0].name).toBe('Alice');
            expect(results[0].users[0].tags).toEqual(['admin', 'user']);
            expect(results[0].users[1].name).toBe('Bob');
            expect(results[0].users[1].tags).toEqual(['user']);
        });
    });

    describe('metadata', () => {
        it('includes accumulated text in metadata', async () => {
            const json = '{"test": 123}';
            const results = await parseChunks([json]);
            expect(results[0][META].text).toBe(json);
        });

        it('sets ambiguous to false for complete JSON', async () => {
            const results = await parseChunks(['{"complete": true}']);
            expect(results[0][META].ambiguous).toBe(false);
            expect(results[0][META].reason).toBeUndefined();
        });
    });
});
