import { Jsiphon } from '../src/jsiphon.js';
import { META, AMBIGUOUS } from '../src/types.js';

/**
 * Helper to create an async iterable from an array of strings
 */
export async function* toStream(chunks) {
    for (const chunk of chunks) {
        yield chunk;
    }
}

/**
 * Helper to collect all snapshots from parser
 */
export async function collect(parser) {
    const results = [];
    for await (const snapshot of parser) {
        results.push(snapshot);
    }
    return results;
}

/**
 * Helper to get the last result from a parser
 */
export async function getLast(parser) {
    const results = await collect(parser);
    return results[results.length - 1];
}

/**
 * Helper to create parser and collect results in one step
 */
export async function parseChunks(chunks, options = {}) {
    const parser = new Jsiphon({
        stream: toStream(chunks),
        ...options
    });
    return collect(parser);
}

export { Jsiphon, META, AMBIGUOUS };
