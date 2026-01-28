import { describe, it, expect } from 'vitest';
import { parseChunks, META } from './helpers.js';

describe('Junk Handling', () => {
    describe('junk before JSON', () => {
        it('skips text before opening brace', async () => {
            const results = await parseChunks(['Here is your JSON: {"name": "test"}']);
            expect(results[0].name).toBe('test');
            expect(results[0][META].ambiguous).toBe(false);
        });

        it('skips text before opening bracket', async () => {
            const results = await parseChunks(['Sure! [1, 2, 3]']);
            expect(results[0]).toEqual([1, 2, 3]);
        });

        it('skips newlines and special chars before JSON', async () => {
            const results = await parseChunks(['\n\n***\n{"key": "value"}']);
            expect(results[0].key).toBe('value');
        });

        it('skips unicode text before JSON', async () => {
            const results = await parseChunks(['日本語テキスト {"msg": "hello"}']);
            expect(results[0].msg).toBe('hello');
        });

        it('handles empty chunks before JSON', async () => {
            const results = await parseChunks(['', 'prefix', '{"a": 1}']);
            expect(results[2].a).toBe(1);
        });
    });

    describe('junk after JSON', () => {
        it('ignores text after closing brace', async () => {
            const results = await parseChunks(['{"name": "test"} and some trailing text']);
            expect(results[0].name).toBe('test');
            expect(results[0][META].ambiguous).toBe(false);
        });

        it('ignores text after closing bracket', async () => {
            const results = await parseChunks(['[1, 2, 3] extra stuff here']);
            expect(results[0]).toEqual([1, 2, 3]);
        });

        it('ignores additional JSON after root closes', async () => {
            const results = await parseChunks(['{"a": 1}{"b": 2}']);
            expect(results[0]).toEqual({ a: 1 });
            expect(results[0].b).toBeUndefined();
        });
    });

    describe('junk in streaming', () => {
        it('handles junk arriving in separate chunk', async () => {
            const results = await parseChunks(['blah blah ', '{"x": 1}']);
            expect(results[1].x).toBe(1);
        });

        it('handles closing and junk in separate chunks', async () => {
            const results = await parseChunks(['{"a": 1}', ' trailing']);
            expect(results[0].a).toBe(1);
            expect(results[1].a).toBe(1);  // Still the same value
        });
    });

    describe('edge cases', () => {
        it('handles braces/brackets in junk text', async () => {
            // The first { starts the JSON, so this tests that we parse from there
            const results = await parseChunks(['text with } and ] chars {"valid": true}']);
            // First { starts parsing, so we get {valid: true}
            expect(results[0].valid).toBe(true);
        });

        it('returns empty object when no JSON found', async () => {
            const results = await parseChunks(['just plain text']);
            expect(results[0]).toEqual({});
        });

        it('returns empty object for primitive-only input', async () => {
            const results = await parseChunks(['"just a string"']);
            expect(results[0]).toEqual({});
        });
    });
});
