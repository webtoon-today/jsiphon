import { META, type MetaInfo, type ParseResult, type ParserOptions, type DeepPartial, type AmbiguityReason } from './types.js';
import { type Context, type Token, createContext, mutate } from './core/statemachine.js';
import { type ResultState, createResultState, reduce } from './core/reducer.js';

export class Jsiphon<T> implements AsyncIterable<ParseResult<T>> {
    private stream: AsyncIterable<string>;
    private trackDelta: boolean;
    private ctx: Context;
    private objectState: ResultState;
    private text: string = '';
    private prevJson: string = '';

    constructor(options: ParserOptions) {
        this.stream = options.stream;
        this.trackDelta = options.trackDelta ?? true;
        this.ctx = createContext();
        this.objectState = createResultState();
    }

    async *[Symbol.asyncIterator](): AsyncIterator<ParseResult<T>> {
        for await (const chunk of this.stream) {
            this.text += chunk;

            for (const char of chunk) {
                this.processChar(char);
            }

            yield this.createSnapshot();
        }
    }

    private processChar(char: string): void {
        const token: Token = { type: 'char', value: char };
        const { ctx: newCtx, action } = mutate({ ctx: this.ctx, token });
        this.ctx = newCtx;

        if (action) {
            this.objectState = reduce({ state: this.objectState, action });
        }

        // Handle pending character (reprocess)
        while (this.ctx.pending) {
            const pending = this.ctx.pending;
            this.ctx = { ...this.ctx, pending: null };
            const { ctx: reCtx, action: reAction } = mutate({ ctx: this.ctx, token: { type: 'char', value: pending } });
            this.ctx = reCtx;

            if (reAction) {
                this.objectState = reduce({ state: this.objectState, action: reAction });
            }
        }
    }

    private createSnapshot(): ParseResult<T> {
        const value = this.getSnapshotValue();
        const currJson = JSON.stringify(value.data);

        // Calculate delta using JSON comparison
        let delta: DeepPartial<T> | undefined;
        if (this.trackDelta && this.prevJson) {
            if (this.prevJson !== currJson) {
                delta = this.calculateDelta(JSON.parse(this.prevJson), value.data);
            }
        }
        this.prevJson = currJson;

        const meta: MetaInfo<T> = {
            ambiguous: value.ambiguous,
            reason: value.reason,
            text: this.text,
            delta,
        };

        return this.attachMeta(value.data as T, meta);
    }

    private getSnapshotValue(): { data: unknown; ambiguous: boolean; reason?: AmbiguityReason } {
        // Clone the current result
        const data = deepClone(this.objectState.root) ?? {};
        let ambiguous = false;  // Only true when actively building a value
        let reason: AmbiguityReason | undefined;

        // Apply incomplete value based on current state
        switch (this.ctx.state) {
            case 'IN_STRING':
                if (this.ctx.isParsingKey) {
                    reason = 'property name is not closed';
                } else {
                    reason = 'string value is not closed';
                    this.applyIncompleteValue(data, this.ctx.buffer);
                }
                ambiguous = true;
                break;

            case 'IN_STRING_ESCAPE':
                reason = 'string value is not closed';
                this.applyIncompleteValue(data, this.ctx.buffer);
                ambiguous = true;
                break;

            case 'IN_NUMBER':
                reason = 'number value may continue';
                this.applyIncompleteValue(data, parseFloat(this.ctx.buffer) || 0);
                ambiguous = true;
                break;

            case 'IN_KEYWORD': {
                const kw = this.ctx.buffer;
                if ('true'.startsWith(kw) || 'false'.startsWith(kw)) {
                    reason = 'boolean value is incomplete';
                } else {
                    reason = 'null value is incomplete';
                }
                let kwValue: boolean | null = null;
                if ('true'.startsWith(kw)) kwValue = true;
                else if ('false'.startsWith(kw)) kwValue = false;
                this.applyIncompleteValue(data, kwValue);
                ambiguous = true;
                break;
            }
        }

        return { data, ambiguous, reason };
    }

    private applyIncompleteValue(root: unknown, value: unknown): void {
        // Use ctx.stack for navigation (preserves keys)
        const stack = this.ctx.stack;
        if (stack.length === 0) return;

        // Navigate to the target container
        let current = root;
        for (let i = 0; i < stack.length - 1; i++) {
            const frame = stack[i];
            if (frame.type === 'object' && frame.key !== undefined) {
                current = (current as Record<string, unknown>)[frame.key];
            } else if (frame.type === 'array') {
                const arr = current as unknown[];
                current = arr[arr.length - 1];
            }
        }

        // Apply value to the last frame's container
        const last = stack[stack.length - 1];
        if (last.type === 'object' && last.key !== undefined) {
            (current as Record<string, unknown>)[last.key] = value;
        } else if (last.type === 'array') {
            (current as unknown[]).push(value);
        }
    }

    private attachMeta(value: T, meta: MetaInfo<T>): ParseResult<T> {
        if (value === null || typeof value !== 'object') {
            // For primitives, box it
            const wrapper = Object(value) as T & { [META]: MetaInfo<T> };
            Object.defineProperty(wrapper, META, { value: meta, enumerable: false });
            return wrapper;
        }
        // For objects/arrays, attach non-enumerable
        Object.defineProperty(value, META, { value: meta, enumerable: false });
        return value as ParseResult<T>;
    }

    private calculateDelta(prev: unknown, curr: unknown): DeepPartial<T> | undefined {
        if (typeof prev !== 'object' || typeof curr !== 'object' || prev === null || curr === null) {
            return prev !== curr ? (curr as DeepPartial<T>) : undefined;
        }

        const delta: Record<string, unknown> = {};
        let hasDelta = false;

        for (const key of Object.keys(curr)) {
            const prevVal = (prev as Record<string, unknown>)[key];
            const currVal = (curr as Record<string, unknown>)[key];

            if (prevVal === undefined) {
                delta[key] = currVal;
                hasDelta = true;
            } else if (typeof currVal === 'object' && currVal !== null) {
                const nested = this.calculateDelta(prevVal, currVal);
                if (nested !== undefined) {
                    delta[key] = nested;
                    hasDelta = true;
                }
            } else if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
                delta[key] = currVal;
                hasDelta = true;
            }
        }

        return hasDelta ? (delta as DeepPartial<T>) : undefined;
    }
}

function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone) as T;
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        clone[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
    return clone as T;
}
