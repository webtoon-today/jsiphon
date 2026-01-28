/**
 * JSON Streaming Parser State Machine
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                           STATE DIAGRAM                                     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 *                              ┌──────────┐
 *                              │  START   │
 *                              └────┬─────┘
 *                                   │
 *                                   ▼
 *                           ┌──────────────┐
 *                      ┌───▶│ EXPECT_VALUE │◀───────────────────────┐
 *                      │    └──────┬───────┘                         │
 *                      │           │                                 │
 *          ┌───────────┼───────────┼───────────┬──────────┐          │
 *          │           │           │           │          │          │
 *          ▼           ▼           ▼           ▼          ▼          │
 *     ┌────────┐  ┌────────┐  ┌────────┐  ┌───────┐  ┌───────┐       │
 *     │   "    │  │   {    │  │   [    │  │ 0-9/- │  │ t/f/n │       │
 *     └───┬────┘  └───┬────┘  └───┬────┘  └───┬───┘  └───┬───┘       │
 *         │           │           │           │          │           │
 *         ▼           ▼           │           ▼          ▼           │
 *   ┌──────────┐ ┌─────────────┐  │    ┌──────────┐ ┌──────────┐     │
 *   │IN_STRING │ │EXPECT_KEY_  │  │    │IN_NUMBER │ │IN_KEYWORD│     │
 *   │          │ │OR_CLOSE     │  │    │          │ │          │     │
 *   └────┬─────┘ └──────┬──────┘  │    └────┬─────┘ └────┬─────┘     │
 *        │              │         │         │            │           │
 *        │ "            │ "       │         │ delim      │ complete  │
 *        ▼              ▼         │         ▼            ▼           │
 *   ┌──────────┐  ┌──────────┐    │    ┌────────────────────┐        │
 *   │  value   │  │IN_STRING │    │    │  AFTER_VALUE       │        │
 *   │ complete │  │ (as key) │    │    │  (transition based │        │
 *   └────┬─────┘  └────┬─────┘    │    │   on parent type)  │        │
 *        │             │ "        │    └─────────┬──────────┘        │
 *        │             ▼          │              │                   │
 *        │       ┌────────────┐   │              │                   │
 *        │       │EXPECT_COLON│   │              │                   │
 *        │       └─────┬──────┘   │              │                   │
 *        │             │ :        │              │                   │
 *        │             └──────────┼──────────────┘                   │
 *        │                        │                                  │
 *        │    ┌───────────────────┘                                  │
 *        │    │                                                      │
 *        ▼    ▼                                                      │
 *   ┌─────────────────────────┐     ┌─────────────────────────┐      │
 *   │ EXPECT_COMMA_OR_CLOSE   │     │ EXPECT_COMMA_OR_CLOSE   │      │
 *   │ _OBJECT                 │     │ _ARRAY                  │      │
 *   └───────────┬─────────────┘     └───────────┬─────────────┘      │
 *               │                               │                    │
 *         ┌─────┴─────┐                   ┌─────┴─────┐              │
 *         │           │                   │           │              │
 *         ▼           ▼                   ▼           ▼              │
 *         ,           }                   ,           ]              │
 *         │           │                   │           │              │
 *         │           ▼                   │           ▼              │
 *         │      pop stack                │      pop stack           │
 *         │           │                   │           │              │
 *         ▼           │                   └───────────┼──────────────┘
 *    EXPECT_KEY_      │                               │
 *    OR_CLOSE         └───────────────────────────────┘
 *
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                         IN_STRING SUBSTATES                      │
 * └──────────────────────────────────────────────────────────────────┘
 *
 *   ┌──────────┐  \   ┌──────────────────┐  any   ┌──────────┐
 *   │IN_STRING │────▶ │IN_STRING_ESCAPE │───────▶│IN_STRING │
 *   └──────────┘      └──────────────────┘        └──────────┘
 *        │
 *        │ any (not " or \)
 *        ▼
 *   append to buffer
 *
 */

// ============ Token Types ============

export type Token =
    | { type: 'char'; value: string }
    | { type: 'eof' };

// ============ State Types ============

export type State =
    | 'FIND_ROOT'     // Initial: skip junk until { or [
    | 'EXPECT_VALUE'
    | 'EXPECT_KEY_OR_CLOSE'
    | 'EXPECT_COLON'
    | 'EXPECT_COMMA_OR_CLOSE_OBJECT'
    | 'EXPECT_COMMA_OR_CLOSE_ARRAY'
    | 'IN_STRING'
    | 'IN_STRING_ESCAPE'
    | 'IN_NUMBER'
    | 'IN_KEYWORD'
    | 'DONE';         // Root closed: ignore junk tail

// ============ Stack Frame ============

export interface Frame {
    type: 'object' | 'array';
    key?: string;  // For object: pending key
}

// ============ Context ============

export interface Context {
    state: State;
    stack: Frame[];
    buffer: string;
    isParsingKey: boolean;
    // Pending character to reprocess (for number/keyword termination)
    pending: string | null;
}

/**
 * Create initial context
 */
export function createContext(): Context {
    return {
        state: 'FIND_ROOT',
        stack: [],
        buffer: '',
        isParsingKey: false,
        pending: null,
    };
}

// ============ Mutate Function ============

export type MutateResult = {
    ctx: Context;
    action: Action | null;
};

export type Action =
    | { type: 'set_root'; value: unknown }
    | { type: 'object_start' }
    | { type: 'object_end' }
    | { type: 'array_start' }
    | { type: 'array_end' }
    | { type: 'set_key'; key: string }
    | { type: 'set_value'; value: unknown };

/**
 * Pure state machine transition function.
 * Takes current context and a token, returns new context and optional action.
 */
export function mutate({ctx, token}: {ctx: Context, token: Token}): MutateResult {
    if (token.type === 'eof') {
        return { ctx, action: null };
    }

    const char = token.value;

    switch (ctx.state) {
        case 'FIND_ROOT':
            return handleFindRoot(ctx, char);
        case 'EXPECT_VALUE':
            return handleExpectValue(ctx, char);
        case 'EXPECT_KEY_OR_CLOSE':
            return handleExpectKeyOrClose(ctx, char);
        case 'EXPECT_COLON':
            return handleExpectColon(ctx, char);
        case 'EXPECT_COMMA_OR_CLOSE_OBJECT':
            return handleExpectCommaOrCloseObject(ctx, char);
        case 'EXPECT_COMMA_OR_CLOSE_ARRAY':
            return handleExpectCommaOrCloseArray(ctx, char);
        case 'IN_STRING':
            return handleInString(ctx, char);
        case 'IN_STRING_ESCAPE':
            return handleInStringEscape(ctx, char);
        case 'IN_NUMBER':
            return handleInNumber(ctx, char);
        case 'IN_KEYWORD':
            return handleInKeyword(ctx, char);
        case 'DONE':
            return { ctx, action: null };  // Ignore everything after root closes
    }
}

// ============ State Handlers ============

function isWhitespace(c: string): boolean {
    return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

function isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
}

function handleFindRoot(ctx: Context, char: string): MutateResult {
    // Only respond to { or [, skip everything else (junk preamble)
    if (char === '{') {
        return {
            ctx: { ...ctx, state: 'EXPECT_KEY_OR_CLOSE', stack: [{ type: 'object' }] },
            action: { type: 'object_start' },
        };
    }

    if (char === '[') {
        return {
            ctx: { ...ctx, state: 'EXPECT_VALUE', stack: [{ type: 'array' }] },
            action: { type: 'array_start' },
        };
    }

    // Skip junk
    return { ctx, action: null };
}

function handleExpectValue(ctx: Context, char: string): MutateResult {
    if (isWhitespace(char)) {
        return { ctx, action: null };
    }

    if (char === '"') {
        return {
            ctx: { ...ctx, state: 'IN_STRING', buffer: '', isParsingKey: false },
            action: null,
        };
    }

    if (char === '{') {
        return {
            ctx: { ...ctx, state: 'EXPECT_KEY_OR_CLOSE', stack: [...ctx.stack, { type: 'object' }] },
            action: { type: 'object_start' },
        };
    }

    if (char === '[') {
        return {
            ctx: { ...ctx, state: 'EXPECT_VALUE', stack: [...ctx.stack, { type: 'array' }] },
            action: { type: 'array_start' },
        };
    }

    if (char === ']' && ctx.stack.length > 0 && ctx.stack[ctx.stack.length - 1].type === 'array') {
        const newStack = ctx.stack.slice(0, -1);
        return {
            ctx: { ...ctx, state: afterValue(newStack), stack: newStack },
            action: { type: 'array_end' },
        };
    }

    if (char === '-' || isDigit(char)) {
        return {
            ctx: { ...ctx, state: 'IN_NUMBER', buffer: char },
            action: null,
        };
    }

    if (char === 't' || char === 'f' || char === 'n') {
        return {
            ctx: { ...ctx, state: 'IN_KEYWORD', buffer: char },
            action: null,
        };
    }

    return { ctx, action: null };
}

function handleExpectKeyOrClose(ctx: Context, char: string): MutateResult {
    if (isWhitespace(char)) {
        return { ctx, action: null };
    }

    if (char === '"') {
        return {
            ctx: { ...ctx, state: 'IN_STRING', buffer: '', isParsingKey: true },
            action: null,
        };
    }

    if (char === '}') {
        const newStack = ctx.stack.slice(0, -1);
        return {
            ctx: { ...ctx, state: afterValue(newStack), stack: newStack },
            action: { type: 'object_end' },
        };
    }

    return { ctx, action: null };
}

function handleExpectColon(ctx: Context, char: string): MutateResult {
    if (isWhitespace(char)) {
        return { ctx, action: null };
    }

    if (char === ':') {
        return {
            ctx: { ...ctx, state: 'EXPECT_VALUE' },
            action: null,
        };
    }

    return { ctx, action: null };
}

function handleExpectCommaOrCloseObject(ctx: Context, char: string): MutateResult {
    if (isWhitespace(char)) {
        return { ctx, action: null };
    }

    if (char === ',') {
        return {
            ctx: { ...ctx, state: 'EXPECT_KEY_OR_CLOSE' },
            action: null,
        };
    }

    if (char === '}') {
        const newStack = ctx.stack.slice(0, -1);
        return {
            ctx: { ...ctx, state: afterValue(newStack), stack: newStack },
            action: { type: 'object_end' },
        };
    }

    return { ctx, action: null };
}

function handleExpectCommaOrCloseArray(ctx: Context, char: string): MutateResult {
    if (isWhitespace(char)) {
        return { ctx, action: null };
    }

    if (char === ',') {
        return {
            ctx: { ...ctx, state: 'EXPECT_VALUE' },
            action: null,
        };
    }

    if (char === ']') {
        const newStack = ctx.stack.slice(0, -1);
        return {
            ctx: { ...ctx, state: afterValue(newStack), stack: newStack },
            action: { type: 'array_end' },
        };
    }

    return { ctx, action: null };
}

function handleInString(ctx: Context, char: string): MutateResult {
    if (char === '"') {
        if (ctx.isParsingKey) {
            // Update the top frame with the key
            const newStack = [...ctx.stack];
            newStack[newStack.length - 1] = { ...newStack[newStack.length - 1], key: ctx.buffer };
            return {
                ctx: { ...ctx, state: 'EXPECT_COLON', buffer: '', stack: newStack },
                action: { type: 'set_key', key: ctx.buffer },
            };
        } else {
            return {
                ctx: { ...ctx, state: afterValue(ctx.stack), buffer: '' },
                action: { type: 'set_value', value: ctx.buffer },
            };
        }
    }

    if (char === '\\') {
        return {
            ctx: { ...ctx, state: 'IN_STRING_ESCAPE' },
            action: null,
        };
    }

    return {
        ctx: { ...ctx, buffer: ctx.buffer + char },
        action: null,
    };
}

function handleInStringEscape(ctx: Context, char: string): MutateResult {
    const escapeMap: Record<string, string> = {
        'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'f': '\f',
        '\\': '\\', '"': '"', '/': '/',
    };
    const escaped = escapeMap[char] ?? char;

    return {
        ctx: { ...ctx, state: 'IN_STRING', buffer: ctx.buffer + escaped },
        action: null,
    };
}

function handleInNumber(ctx: Context, char: string): MutateResult {
    if (isDigit(char) || char === '.' || char === 'e' || char === 'E' || char === '+' || char === '-') {
        return {
            ctx: { ...ctx, buffer: ctx.buffer + char },
            action: null,
        };
    }

    // Number complete
    const num = parseFloat(ctx.buffer);
    return {
        ctx: { ...ctx, state: afterValue(ctx.stack), buffer: '', pending: char },
        action: { type: 'set_value', value: num },
    };
}

function handleInKeyword(ctx: Context, char: string): MutateResult {
    if (char >= 'a' && char <= 'z') {
        const newBuffer = ctx.buffer + char;

        // Check for complete keywords
        if (newBuffer === 'true' || newBuffer === 'false' || newBuffer === 'null') {
            const value = newBuffer === 'true' ? true : newBuffer === 'false' ? false : null;
            return {
                ctx: { ...ctx, state: afterValue(ctx.stack), buffer: '' },
                action: { type: 'set_value', value },
            };
        }

        return {
            ctx: { ...ctx, buffer: newBuffer },
            action: null,
        };
    }

    // Keyword ended early (incomplete) - guess the value
    let value: boolean | null = null;
    if ('true'.startsWith(ctx.buffer)) value = true;
    else if ('false'.startsWith(ctx.buffer)) value = false;

    return {
        ctx: { ...ctx, state: afterValue(ctx.stack), buffer: '', pending: char },
        action: { type: 'set_value', value },
    };
}

// ============ Helpers ============

function afterValue(stack: Frame[]): State {
    if (stack.length === 0) {
        return 'DONE';  // Root closed, ignore trailing junk
    }
    const top = stack[stack.length - 1];
    return top.type === 'object' ? 'EXPECT_COMMA_OR_CLOSE_OBJECT' : 'EXPECT_COMMA_OR_CLOSE_ARRAY';
}
