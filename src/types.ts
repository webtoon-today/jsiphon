/**
 * Unique symbol used to access metadata on parse results.
 * Using a symbol prevents collisions with actual JSON keys.
 */
export const META = Symbol('meta');

/**
 * Reason codes for ambiguous parsing.
 */
export type AmbiguityReason =
    | 'property name is not closed'
    | 'string value is not closed'
    | 'number value may continue'
    | 'boolean value is incomplete'
    | 'null value is incomplete';

/**
 * Metadata about the current parse state.
 */
export interface MetaInfo<T = unknown> {
    /** Whether the parsed result contains ambiguous/assumed values due to incomplete input */
    ambiguous: boolean;

    /** Human-readable reason why the value is ambiguous (only present when ambiguous is true) */
    reason?: AmbiguityReason;

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
