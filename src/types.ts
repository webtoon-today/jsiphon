/**
 * Unique symbol used to access metadata on parse results.
 * Using a symbol prevents collisions with actual JSON keys.
 */
export const META = Symbol('meta');

/**
 * Unique symbol used to access ambiguity state in the ambiguity tree.
 */
export const AMBIGUOUS = Symbol('ambiguous');

/**
 * Check if a node in the ambiguity tree is still streaming/unstable.
 * Returns true if the value or any descendant is still being parsed.
 * Returns true if node is undefined (field not yet seen = still ambiguous).
 */
export function isAmbiguous(node: AmbiguityNode | boolean | undefined): boolean {
    if (node === undefined) return true;  // not yet seen = ambiguous
    if (typeof node === 'boolean') return node;
    return node[AMBIGUOUS];
}

/**
 * Ambiguity tree node - tracks stability at each level.
 * [AMBIGUOUS]: true means this value or any descendant is unstable.
 */
export interface AmbiguityNode {
    [AMBIGUOUS]: boolean;
    [key: string]: AmbiguityNode | boolean;
}

/**
 * Metadata about the current parse state.
 */
export interface MetaInfo<T = unknown> {
    /** Tree tracking stability at each level of the parsed structure */
    ambiguous: AmbiguityNode;

    /** The accumulated raw input text */
    text: string;

    /** What changed since the last snapshot (only present when trackDelta is enabled) */
    delta?: DeepPartial<T>;
}

/**
 * Deep partial type - makes all nested properties optional.
 */
export type DeepPartial<T> = T extends object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T;

/**
 * The result type yielded during iteration.
 * Contains the parsed value T with metadata accessible via [META].
 */
export type ParseResult<T> = T & { [META]: MetaInfo<T> };

/**
 * Options for creating a Jsiphon parser.
 */
export interface ParserOptions {
    /** The source stream yielding text chunks */
    stream: AsyncIterable<string>;

    /** Enable delta tracking between snapshots (default: true) */
    trackDelta?: boolean;
}

/**
 * Token types produced by the lexer.
 */
export type TokenType =
    | 'BEGIN_OBJECT'    // {
    | 'END_OBJECT'      // }
    | 'BEGIN_ARRAY'     // [
    | 'END_ARRAY'       // ]
    | 'COLON'           // :
    | 'COMMA'           // ,
    | 'STRING'          // "..."
    | 'NUMBER'          // 123, -1.5, 1e10
    | 'TRUE'            // true
    | 'FALSE'           // false
    | 'NULL'            // null
    | 'EOF'             // End of input
    | 'INCOMPLETE';     // Incomplete token (e.g., unterminated string)

/**
 * A token produced by the lexer.
 */
export interface Token {
    type: TokenType;

    /** The raw text of the token */
    value: string;

    /** Start position in the input */
    start: number;

    /** End position in the input */
    end: number;

    /** For incomplete tokens, the reason why it's incomplete */
    incompleteReason?: string;
}

/**
 * State of the parser for tracking nested structures.
 */
export type ParserState =
    | 'VALUE'           // Expecting any value
    | 'OBJECT_KEY'      // Expecting object key or }
    | 'OBJECT_COLON'    // Expecting : after key
    | 'OBJECT_VALUE'    // Expecting value after :
    | 'OBJECT_COMMA'    // Expecting , or }
    | 'ARRAY_VALUE'     // Expecting value or ]
    | 'ARRAY_COMMA'     // Expecting , or ]
    | 'END';            // Parsing complete
