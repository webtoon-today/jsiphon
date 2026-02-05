/**
 * Delta Tracking Example
 *
 * Shows how to use delta to get only NEW characters for efficient UI updates.
 * Instead of re-rendering the entire content, just append the delta.
 *
 * Run: npx tsx examples/02-delta-tracking.ts
 */

import { Jsiphon, META } from '../src/index.js';

async function* mockLLMStream(): AsyncIterable<string> {
    const chunks = [
        '{"content": "The ',
        'quick ',
        'brown ',
        'fox ',
        'jumps ',
        'over ',
        'the ',
        'lazy ',
        'dog."}'
    ];

    for (const chunk of chunks) {
        await new Promise(resolve => setTimeout(resolve, 200));
        yield chunk;
    }
}

interface ChatMessage {
    content: string;
}

async function main() {
    console.log('--- Delta Tracking Example ---\n');
    console.log('Simulating real-time chat bubble update:\n');

    const parser = new Jsiphon<ChatMessage>({
        stream: mockLLMStream()
    });

    // Simulate a chat bubble that we append to
    let chatBubble = '';

    for await (const snapshot of parser) {
        const delta = snapshot[META].delta;

        if (delta?.content) {
            // In a real app: chatBubble.textContent += delta.content
            chatBubble += delta.content;

            // Clear line and show current state (simulates UI update)
            process.stdout.write(`\r[Chat Bubble] ${chatBubble}`);
        }
    }

    console.log('\n\n--- Done ---');
    console.log(`Final content: "${chatBubble}"`);
}

main();
