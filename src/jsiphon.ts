import { META, AMBIGUOUS, type AmbiguityNode, type MetaInfo, type ParseResult, type ParserOptions, type DeepPartial } from './types.js';
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
        const data = this.getSnapshotData();
        const currJson = JSON.stringify(data);

        // Calculate delta
        let delta: DeepPartial<T> | undefined;
        if (this.trackDelta && this.prevJson) {
            if (this.prevJson !== currJson) {
                delta = this.calculateDelta(JSON.parse(this.prevJson), data);
            }
        }
        this.prevJson = currJson;

        // Clone ambiguity tree from reducer
        const ambiguous = this.cloneAmbiguityTree(this.objectState.ambiguityRoot);

        const meta: MetaInfo<T> = {
            ambiguous,
            text: this.text,
            delta,
        };

        return this.attachMeta(data as T, meta);
    }

    private getSnapshotData(): unknown {
        const data = deepClone(this.objectState.root) ?? {};

        // Apply incomplete value if streaming
        const isStreaming =
            this.ctx.state === 'IN_STRING' ||
            this.ctx.state === 'IN_STRING_ESCAPE' ||
            this.ctx.state === 'IN_NUMBER' ||
            this.ctx.state === 'IN_KEYWORD';

        if (isStreaming && !this.ctx.isParsingKey) {
            const value = this.getIncompleteValue();
            const path = this.getStreamingPath();
            if (path) {
                this.applyValueAtPath(data, path, value);
            }
        }

        return data;
    }

    private getIncompleteValue(): unknown {
        switch (this.ctx.state) {
            case 'IN_STRING':
            case 'IN_STRING_ESCAPE':
                return this.ctx.buffer;
            case 'IN_NUMBER':
                return parseFloat(this.ctx.buffer) || 0;
            case 'IN_KEYWORD': {
                const kw = this.ctx.buffer;
                if ('true'.startsWith(kw)) return true;
                if ('false'.startsWith(kw)) return false;
                return null;
            }
            default:
                return undefined;
        }
    }

    private getStreamingPath(): (string | number)[] | null {
        const stack = this.objectState.stack;
        if (stack.length === 0) return null;

        // Build path from reducer's stack (using pathKey)
        const path: (string | number)[] = [];
        for (let i = 1; i < stack.length; i++) {
            const frame = stack[i];
            if (frame.pathKey !== undefined) {
                path.push(frame.pathKey);
            }
        }

        // Add current key/index for the streaming value
        const top = stack[stack.length - 1];
        if (top.type === 'object' && top.key !== undefined) {
            path.push(top.key);
        } else if (top.type === 'array') {
            path.push((top.ref as unknown[]).length);
        }

        return path;
    }

    private applyValueAtPath(root: unknown, path: (string | number)[], value: unknown): void {
        if (path.length === 0) return;

        let current = root;
        for (let i = 0; i < path.length - 1; i++) {
            current = (current as Record<string | number, unknown>)[path[i]];
        }

        const lastKey = path[path.length - 1];
        if (Array.isArray(current) && typeof lastKey === 'number') {
            if (lastKey >= current.length) {
                current.push(value);
            } else {
                current[lastKey] = value;
            }
        } else {
            (current as Record<string, unknown>)[lastKey as string] = value;
        }
    }

    private cloneAmbiguityTree(node: AmbiguityNode): AmbiguityNode {
        const clone: AmbiguityNode = { [AMBIGUOUS]: node[AMBIGUOUS] };
        for (const key of Object.keys(node)) {
            const child = node[key];
            if (child && typeof child === 'object') {
                clone[key] = this.cloneAmbiguityTree(child as AmbiguityNode);
            }
        }
        return clone;
    }

    private attachMeta(value: T, meta: MetaInfo<T>): ParseResult<T> {
        if (value === null || typeof value !== 'object') {
            const wrapper = Object(value) as T & { [META]: MetaInfo<T> };
            Object.defineProperty(wrapper, META, { value: meta, enumerable: false });
            return wrapper;
        }
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
