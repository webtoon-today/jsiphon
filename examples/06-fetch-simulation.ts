/**
 * Fetch API Simulation Example
 *
 * Shows a realistic pattern for using jsiphon with fetch() responses.
 * This is the pattern you'd use with real LLM APIs.
 *
 * Run: npx tsx examples/06-fetch-simulation.ts
 */

import { Jsiphon, META } from '../src/index.js';

interface ChatResponse {
    role: string;
    content: string;
    tokens_used: number;
}

async function main() {
    console.log('--- Fetch API Simulation ---\n');
    console.log('// In real code:\n// const response = await fetch("/api/chat", { method: "POST" });');
    console.log('// const parser = new Jsiphon({ stream: streamToIterable(response.body!) });\n');

    // Simulate fetch response
    const mockResponse = { body: createMockReadableStream() };

    const parser = new Jsiphon<ChatResponse>({
        stream: streamToIterable(mockResponse.body)
    });

    console.log('[Streaming response]\n');

    let lastSnapshot: ChatResponse | undefined;
    for await (const snapshot of parser) {
        const delta = snapshot[META].delta;

        if (delta?.content) {
            process.stdout.write(delta.content);
        }
        lastSnapshot = snapshot;
    }

    console.log('\n\n[Stream complete]');
    console.log(`Tokens used: ${lastSnapshot?.tokens_used}`);
}

// --- Helper: Convert ReadableStream to AsyncIterable (commonly needed pattern) ---

async function* streamToIterable(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
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

// --- Mock Stream (simulates a ReadableStream response from fetch()) ---

function createMockReadableStream(): ReadableStream<Uint8Array> {
    const chunks = [
        '{"role": "assistant", ',
        '"content": "Here are 3 interesting facts about space:\\n\\n',
        '1. A day on Venus is longer than its year.\\n',
        '2. Neutron stars can spin 600 times per second.\\n',
        '3. There is a planet made of diamonds.',
        '", "tokens_used": 47}'
    ];

    let index = 0;
    const encoder = new TextEncoder();

    return new ReadableStream({
        async pull(controller) {
            if (index < chunks.length) {
                await new Promise(resolve => setTimeout(resolve, 300));
                controller.enqueue(encoder.encode(chunks[index]));
                index++;
            } else {
                controller.close();
            }
        }
    });
}

main();
