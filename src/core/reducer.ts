import type { Action, Frame } from './statemachine.js';

// ============ Result State ============

export interface ResultState {
    root: unknown;
    stack: ResultFrame[];
}

interface ResultFrame {
    type: 'object' | 'array';
    ref: Record<string, unknown> | unknown[];
    key?: string;
}

/**
 * Create initial result state
 */
export function createResultState(): ResultState {
    return {
        root: undefined,
        stack: [],
    };
}

// ============ Reduce Function ============

/**
 * Apply an action to the result state, returning new state.
 */
export function reduce({state, action}: {state: ResultState, action: Action}): ResultState {
    switch (action.type) {
        case 'object_start':
            return handleObjectStart(state);
        case 'object_end':
            return handleContainerEnd(state);
        case 'array_start':
            return handleArrayStart(state);
        case 'array_end':
            return handleContainerEnd(state);
        case 'set_key':
            return handleSetKey(state, action.key);
        case 'set_value':
            return handleSetValue(state, action.value);
        case 'set_root':
            return { ...state, root: action.value };
    }
}

// ============ Action Handlers ============

function handleObjectStart(state: ResultState): ResultState {
    const obj: Record<string, unknown> = {};

    if (state.stack.length === 0) {
        // Root object
        return {
            root: obj,
            stack: [{ type: 'object', ref: obj }],
        };
    }

    // Nested object - attach to parent
    const newStack = attachToParent(state.stack, obj);
    return {
        ...state,
        stack: [...newStack, { type: 'object', ref: obj }],
    };
}

function handleArrayStart(state: ResultState): ResultState {
    const arr: unknown[] = [];

    if (state.stack.length === 0) {
        // Root array
        return {
            root: arr,
            stack: [{ type: 'array', ref: arr }],
        };
    }

    // Nested array - attach to parent
    const newStack = attachToParent(state.stack, arr);
    return {
        ...state,
        stack: [...newStack, { type: 'array', ref: arr }],
    };
}

function handleContainerEnd(state: ResultState): ResultState {
    return {
        ...state,
        stack: state.stack.slice(0, -1),
    };
}

function handleSetKey(state: ResultState, key: string): ResultState {
    if (state.stack.length === 0) return state;

    const newStack = [...state.stack];
    const top = { ...newStack[newStack.length - 1], key };
    newStack[newStack.length - 1] = top;

    return { ...state, stack: newStack };
}

function handleSetValue(state: ResultState, value: unknown): ResultState {
    if (state.stack.length === 0) {
        // Root primitive
        return { ...state, root: value };
    }

    const newStack = attachToParent(state.stack, value);
    return { ...state, stack: newStack };
}

// ============ Helpers ============

/**
 * Attach a value to the current parent container.
 * Returns new stack with key cleared (for objects).
 */
function attachToParent(stack: ResultFrame[], value: unknown): ResultFrame[] {
    const newStack = [...stack];
    const top = newStack[newStack.length - 1];

    if (top.type === 'object') {
        if (top.key !== undefined) {
            (top.ref as Record<string, unknown>)[top.key] = value;
            // Clear the key
            newStack[newStack.length - 1] = { ...top, key: undefined };
        }
    } else {
        (top.ref as unknown[]).push(value);
    }

    return newStack;
}