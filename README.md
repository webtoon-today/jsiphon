# jsiphon

An append-only streaming JSON parser for TypeScript. Parse incomplete JSON as it streams in - previously parsed data is never removed or mutated, only extended. Perfect for real-time parsing of LLM outputs, chunked HTTP responses, or any scenario where JSON arrives incrementally.

## Features

- **Append-Only Model** - Data is only added, never removed or mutated as the stream progresses
- **Partial JSON Parsing** - Extract values from incomplete JSON as it streams in
- **Ambiguity Tracking** - Know when parsed values are assumed due to incomplete input
- **Delta Tracking** - Get only newly added content for efficient UI updates
- **Junk Text Tolerant** - Skips preamble text before `{`/`[` and ignores trailing text after root closes
- **Never Throws** - Invalid input returns `{}` or partial results, never exceptions
- **Objects/Arrays Only** - Root must be `{` or `[`. Primitive roots return `{}`
- **Type Safe** - Full TypeScript support with generics
- **Zero Dependencies** - Lightweight and self-contained

## Append-Only Design

This library follows an append-only model: as JSON streams in, data is only added, never removed or mutated.

|       | Chunk 1      |   | Chunk 2        |   | Chunk 3          |
|-------|--------------|---|----------------|---|------------------|
|Stream |`{"msg": "Hel`| → |`{"msg": "Hello`| → |`{"msg": "Hello"}`|
|Value  |`{msg: "Hel"}`|   |`{msg: "Hello"}`|   |`{msg: "Hello"}`  |
|Delta  |`{msg: "Hel"}`|   |`{msg: "lo"}`   |   |`{msg: ""}`       |


**Why append-only?**

- **Predictable** - Once a value appears, it stays. No need to handle deletions or mutations.
- **Efficient UI updates** - Deltas contain only new content. Append directly to DOM without diffing.
- **Natural fit for streaming** - JSON from LLMs and APIs arrives incrementally; this parser matches that model.

The delta represents only what was added since the last snapshot. For strings, this means the new characters appended. For arrays, the new elements added. For objects, new properties or extended values.

## Installation

```bash
npm install jsiphon
```

## Quick Start

```typescript
import { Jsiphon, META } from 'jsiphon';

// Create a parser with an async iterable stream
const parser = new Jsiphon<{ name: string; age: number }>({
    stream: fetchStream('/api/data'), // Any AsyncIterable<string>
});

// Iterate over parsed snapshots as they arrive
for await (const snapshot of parser) {
    console.log(snapshot.name);            // Partial or complete value
    console.log(snapshot[META].ambiguous); // true when values are assumed/incomplete
    console.log(snapshot[META].delta);     // What changed since last snapshot
}
```

## API

### `Jsiphon<T>`

The main parser class. Create one instance per stream.

```typescript
const parser = new Jsiphon<T>({
    stream: AsyncIterable<string>,
    trackDelta?: boolean,  // Default: true
});
```

#### Constructor Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `stream` | `AsyncIterable<string>` | Yes | The source stream yielding text chunks |
| `trackDelta` | `boolean` | No | Enable delta tracking (default: `true`) |

#### Async Iteration

The parser itself is an `AsyncIterable`. Each iteration yields a snapshot of the current parsed state.

```typescript
for await (const snapshot of parser) {
    // snapshot is ParseResult<T>
    console.log(snapshot);           // The parsed value
    console.log(snapshot[META]);     // Metadata
}
```

#### Properties

##### `value: T`

The current parsed value. Available after iteration starts.

##### `meta: MetaInfo`

Current metadata about the parse state.

```typescript
interface MetaInfo {
    ambiguous: boolean;        // true when parsed values are assumed/incomplete
    reason?: AmbiguityReason;  // Why the value is ambiguous (when ambiguous is true)
    text: string;              // The accumulated input text
    delta?: DeepPartial<T>;    // What changed since last snapshot
}
```

### `META`

A unique symbol used to access metadata on snapshots.

```typescript
import { META } from 'jsiphon';

for await (const snapshot of parser) {
    console.log(snapshot[META].ambiguous);
    console.log(snapshot[META].delta);
}
```

### `ParseResult<T>`

The type yielded during iteration. Your parsed object `T` with an additional `[META]` property.

```typescript
type ParseResult<T> = T & { [META]: MetaInfo };
```

## Examples

### Parsing Streaming LLM Output

```typescript
import { Jsiphon, META } from 'jsiphon';

interface LLMResponse {
    answer: string;
    sources: string[];
}

async function* streamFromAPI(): AsyncIterable<string> {
    const response = await fetch('/api/chat', { method: 'POST' });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield decoder.decode(value);
    }
}

async function handleLLMStream() {
    const parser = new Jsiphon<LLMResponse>({
        stream: streamFromAPI(),
    });

    for await (const snapshot of parser) {
        // Update UI with partial data
        updateAnswerDisplay(snapshot.answer);

        if (!snapshot[META].ambiguous) {
            // No ambiguous means all values are confirmed
            showSources(snapshot.sources);
        }
    }
}
```

### Using Deltas for Efficient UI Updates

```typescript
interface ChatMessage {
    role: string;
    content: string;
}

const parser = new Jsiphon<ChatMessage>({
    stream: chatStream,
});

for await (const snapshot of parser) {
    const delta = snapshot[META].delta;

    if (delta?.content) {
        // Append only the new content to the UI
        appendToMessageBubble(delta.content);
    }
}
```

### Handling Nested Objects

```typescript
interface UserData {
    user: {
        name: string;
        profile: {
            age: number;
            city: string;
        };
    };
}

const parser = new Jsiphon<UserData>({
    stream: userDataStream,
});

for await (const snapshot of parser) {
    console.log(snapshot.user?.name);
    console.log(snapshot.user?.profile?.age);
    console.log(snapshot[META].ambiguous); // true while streaming
    console.log(snapshot[META].reason);    // e.g., "number value may continue"
}
```

### Handling Arrays

```typescript
interface TodoList {
    items: Array<{ id: number; text: string; done: boolean }>;
}

const parser = new Jsiphon<TodoList>({
    stream: todoStream,
});

for await (const snapshot of parser) {
    // Render items as they stream in
    renderTodoList(snapshot.items);
}
```

### Using with ReadableStream

```typescript
import { Jsiphon } from 'jsiphon';

// Helper to convert ReadableStream to AsyncIterable
async function* readableToIterable(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield decoder.decode(value);
        }
    } finally {
        reader.releaseLock();
    }
}

const response = await fetch('/api/stream');
const parser = new Jsiphon<MyType>({
    stream: readableToIterable(response.body!),
});

for await (const snapshot of parser) {
    console.log(snapshot);
}
```

### Using with Server-Sent Events (SSE)

```typescript
async function* sseToIterable(url: string) {
    const eventSource = new EventSource(url);

    try {
        while (true) {
            const event = await new Promise<MessageEvent>((resolve, reject) => {
                eventSource.onmessage = resolve;
                eventSource.onerror = reject;
            });
            yield event.data;
        }
    } finally {
        eventSource.close();
    }
}

const parser = new Jsiphon<MyType>({
    stream: sseToIterable('/api/events'),
});
```

## Ambiguity Scenarios

The parser tracks ambiguous when values are assumed due to incomplete input:

| Input | `snapshot` value | Ambiguity | Reason |
|-------|------------------|-----------|--------|
| `{` | `{}` | false | - |
| `{"` | `{}` | true | property name is not closed |
| `{"key"` | `{key: undefined}` | false | - |
| `{"key":` | `{key: undefined}` | false | - |
| `{"key": "val` | `{key: "val"}` | true | string value is not closed |
| `{"key": 123` | `{key: 123}` | true | number value may continue |
| `{"key": "value"}` | `{key: "value"}` | false | - |

## TypeScript Support

The parser is fully generic and type-safe:

```typescript
interface User {
    name: string;
    age: number;
    email?: string;
}

const parser = new Jsiphon<User>({
    stream: userStream,
});

for await (const snapshot of parser) {
    // TypeScript knows snapshot.name is string
    console.log(snapshot.name?.toUpperCase());
}
```

## License

MIT
