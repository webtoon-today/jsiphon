import { Jsiphon } from '../src/jsiphon.js';
import { META, AMBIGUOUS, isAmbiguous, ParseResult } from '../src/types.js';

/**
 * Helper to create an async iterable from an array of strings
 */
export async function* toStream(chunks: string[]): AsyncIterable<string> {
    for (const chunk of chunks) {
        yield chunk;
    }
}

/**
 * Helper to collect all snapshots from parser
 */
export async function collect<T>(parser: Jsiphon<T>): Promise<ParseResult<T>[]> {
    const results: ParseResult<T>[] = [];
    for await (const snapshot of parser) {
        results.push(snapshot);
    }
    return results;
}

/**
 * Helper to get the last result from a parser
 */
export async function getLast<T>(parser: Jsiphon<T>): Promise<ParseResult<T>> {
    const results = await collect(parser);
    return results[results.length - 1];
}

/**
 * Helper to create parser and collect results in one step
 */
export async function parseChunks<T = Record<string, unknown>>(
    chunks: string[],
    options: { trackDelta?: boolean } = {}
): Promise<ParseResult<T>[]> {
    const parser = new Jsiphon<T>({
        stream: toStream(chunks),
        ...options
    });
    return collect(parser);
}

export { Jsiphon, META, AMBIGUOUS, isAmbiguous };
