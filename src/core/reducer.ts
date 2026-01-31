import type { Action } from './statemachine.js';
import { AMBIGUOUS, type AmbiguityNode } from '../types.js';

// ============ Result State ============

export interface ResultState {
    root: unknown;
    stack: ResultFrame[];
    ambiguityRoot: AmbiguityNode;
}

interface ResultFrame {
    type: 'object' | 'array';
    ref: Record<string, unknown> | unknown[];
    key?: string;  // Pending key for objects, cleared after value is attached
    pathKey?: string | number;  // Key/index used to reach this frame from parent
}

/**
 * Create initial result state
 */
export function createResultState(): ResultState {
    return {
        root: undefined,
        stack: [],
        ambiguityRoot: { [AMBIGUOUS]: true },
    };
}

/**
 * Get path from stack (skip root frame which has no pathKey)
 */
function getPath(stack: ResultFrame[]): (string | number)[] {
    return stack.slice(1).map(f => f.pathKey!);
}

// ============ Reduce Function ============

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
        case 'value_start':
            return handleValueStart(state);
        case 'set_value':
            return handleSetValue(state, action.value);
        case 'set_root':
            return { ...state, root: action.value };
    }
}

// ============ Action Handlers ============

function handleObjectStart(state: ResultState): ResultState {
    const obj: Record<string, unknown> = {};
    const ambNode: AmbiguityNode = { [AMBIGUOUS]: true };

    if (state.stack.length === 0) {
        // Root object
        return {
            root: obj,
            stack: [{ type: 'object', ref: obj }],
            ambiguityRoot: ambNode,
        };
    }

    // Get key/index for this container
    const top = state.stack[state.stack.length - 1];
    const pathKey = top.type === 'object' ? top.key! : (top.ref as unknown[]).length;

    // Attach to parent data
    const newStack = attachToParent(state.stack, obj);

    // Attach to ambiguity tree
    const path = getPath(state.stack);
    const parentNode = getNodeAtPath(state.ambiguityRoot, path);
    parentNode[pathKey] = ambNode;
    markPathAmbiguous(state.ambiguityRoot, path);

    return {
        ...state,
        stack: [...newStack, { type: 'object', ref: obj, pathKey }],
    };
}

function handleArrayStart(state: ResultState): ResultState {
    const arr: unknown[] = [];
    const ambNode: AmbiguityNode = { [AMBIGUOUS]: true };

    if (state.stack.length === 0) {
        // Root array
        return {
            root: arr,
            stack: [{ type: 'array', ref: arr }],
            ambiguityRoot: ambNode,
        };
    }

    // Get key/index for this container
    const top = state.stack[state.stack.length - 1];
    const pathKey = top.type === 'object' ? top.key! : (top.ref as unknown[]).length;

    // Attach to parent data
    const newStack = attachToParent(state.stack, arr);

    // Attach to ambiguity tree
    const path = getPath(state.stack);
    const parentNode = getNodeAtPath(state.ambiguityRoot, path);
    parentNode[pathKey] = ambNode;
    markPathAmbiguous(state.ambiguityRoot, path);

    return {
        ...state,
        stack: [...newStack, { type: 'array', ref: arr, pathKey }],
    };
}

function handleContainerEnd(state: ResultState): ResultState {
    // Mark current container as stable
    const path = getPath(state.stack);
    const node = getNodeAtPath(state.ambiguityRoot, path);
    node[AMBIGUOUS] = false;

    // Update ancestors
    const parentPath = path.slice(0, -1);
    updateAncestorAmbiguity(state.ambiguityRoot, parentPath);

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

    // Create ambiguity node for this key
    const path = getPath(state.stack);
    const parentNode = getNodeAtPath(state.ambiguityRoot, path);
    parentNode[key] = { [AMBIGUOUS]: true };
    markPathAmbiguous(state.ambiguityRoot, path);

    return { ...state, stack: newStack };
}

function handleValueStart(state: ResultState): ResultState {
    if (state.stack.length === 0) return state;

    const top = state.stack[state.stack.length - 1];

    // For arrays, create ambiguity node at next index
    if (top.type === 'array') {
        const index = (top.ref as unknown[]).length;
        const path = getPath(state.stack);
        const parentNode = getNodeAtPath(state.ambiguityRoot, path);
        parentNode[index] = { [AMBIGUOUS]: true };
        markPathAmbiguous(state.ambiguityRoot, path);
    }
    // For objects, node already created by set_key

    return state;
}

function handleSetValue(state: ResultState, value: unknown): ResultState {
    if (state.stack.length === 0) {
        return { ...state, root: value };
    }

    // Get key/index for this value
    const top = state.stack[state.stack.length - 1];
    const key = top.type === 'object' ? top.key! : (top.ref as unknown[]).length;

    // Mark ambiguity node as stable
    const path = getPath(state.stack);
    const parentNode = getNodeAtPath(state.ambiguityRoot, path);
    parentNode[key] = { [AMBIGUOUS]: false };

    // Update ancestors
    updateAncestorAmbiguity(state.ambiguityRoot, path);

    const newStack = attachToParent(state.stack, value);
    return { ...state, stack: newStack };
}

// ============ Data Helpers ============

function attachToParent(stack: ResultFrame[], value: unknown): ResultFrame[] {
    const newStack = [...stack];
    const top = newStack[newStack.length - 1];

    if (top.type === 'object') {
        if (top.key !== undefined) {
            (top.ref as Record<string, unknown>)[top.key] = value;
            newStack[newStack.length - 1] = { ...top, key: undefined };
        }
    } else {
        (top.ref as unknown[]).push(value);
    }

    return newStack;
}

// ============ Ambiguity Helpers ============

function getNodeAtPath(root: AmbiguityNode, path: (string | number)[]): AmbiguityNode {
    let current = root;
    for (const key of path) {
        current = current[key] as AmbiguityNode;
    }
    return current;
}

function markPathAmbiguous(root: AmbiguityNode, path: (string | number)[]): void {
    root[AMBIGUOUS] = true;
    let current = root;
    for (const key of path) {
        current = current[key] as AmbiguityNode;
        if (current) current[AMBIGUOUS] = true;
    }
}

function updateAncestorAmbiguity(root: AmbiguityNode, path: (string | number)[]): void {
    const nodes: AmbiguityNode[] = [root];
    let current = root;
    for (const key of path) {
        current = current[key] as AmbiguityNode;
        if (current) nodes.push(current);
    }

    for (let i = nodes.length - 1; i >= 0; i--) {
        // Only propagate ambiguity UPWARD (set to true), never clear to false.
        // A container's ambiguity should only be cleared by handleContainerEnd
        // when the container is actually closed (receives } or ]).
        if (hasAmbiguousChild(nodes[i])) {
            nodes[i][AMBIGUOUS] = true;
        }
    }
}

function hasAmbiguousChild(node: AmbiguityNode): boolean {
    for (const key of Object.keys(node)) {
        const child = node[key];
        if (child && typeof child === 'object' && (child as AmbiguityNode)[AMBIGUOUS]) {
            return true;
        }
    }
    return false;
}
