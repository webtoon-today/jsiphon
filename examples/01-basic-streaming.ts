/**
 * Basic Streaming Example
 *
 * Demonstrates how jsiphon parses incomplete JSON as it streams in.
 * Run: npx tsx examples/01-basic-streaming.ts
 */

import { Jsiphon, META } from '../src/index.js';

// Mock a streaming response (simulates LLM output arriving in chunks)
async function* mockStream(): AsyncIterable<string> {
    const chunks = [
        '{"message": "Hel',
        'lo, ',
        'World!',
        '", "status": "com',
        'plete"}'
    ];

    for (const chunk of chunks) {
        await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
        console.log(`[Stream] Received chunk: ${JSON.stringify(chunk)}`);
        yield chunk;
    }
}

interface Response {
    message: string;
    status: string;
}

async function main() {
    console.log('--- Basic Streaming Example ---\n');

    const parser = new Jsiphon<Response>({
        stream: mockStream()
    });

    let iteration = 1;
    for await (const snapshot of parser) {
        console.log(`\n[Snapshot ${iteration}]`);
        console.log(`  message: "${snapshot.message}"`);
        console.log(`  status:  "${snapshot.status ?? '(not yet)'}"`);
        iteration++;
    }

    console.log('\n--- Done ---');
}

main();
