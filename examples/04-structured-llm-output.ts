/**
 * Structured LLM Output Example
 *
 * Demonstrates parsing structured JSON from an LLM while streaming.
 * Get the best of both worlds: strict format + real-time display.
 *
 * Run: npx tsx examples/04-structured-llm-output.ts
 */

import { Jsiphon, META, isAmbiguous } from '../src/index.js';

// Simulates an LLM responding with structured JSON (like OpenAI's JSON mode)
async function* mockStructuredLLMResponse(): AsyncIterable<string> {
    const chunks = [
        '{"answer": "The capital of France is ',
        'Paris. It is located in the ',
        'north-central part of the country.',
        '", "confidence": 0.9',
        '5, "sources": ["wiki',
        'pedia.org", "britannica',
        '.com"]}'
    ];

    for (const chunk of chunks) {
        await new Promise(resolve => setTimeout(resolve, 250));
        yield chunk;
    }
}

interface LLMResponse {
    answer: string;
    confidence: number;
    sources: string[];
}

async function main() {
    console.log('--- Structured LLM Output Example ---\n');
    console.log('User: What is the capital of France?\n');
    console.log('Assistant (streaming):');

    const parser = new Jsiphon<LLMResponse>({
        stream: mockStructuredLLMResponse()
    });

    for await (const snapshot of parser) {
        const delta = snapshot[META].delta;
        const ambiguous = snapshot[META].ambiguous;

        // Stream the answer text in real-time
        if (delta?.answer) {
            process.stdout.write(delta.answer);
        }

        // Show confidence when it's finalized
        if (snapshot.confidence !== undefined && !isAmbiguous(ambiguous.confidence)) {
            // Only show once when confidence becomes stable
            if (delta?.confidence !== undefined) {
                console.log(`\n\n[Confidence: ${(snapshot.confidence * 100).toFixed(0)}%]`);
            }
        }

        // Show sources when the array is complete
        if (!isAmbiguous(ambiguous.sources) && snapshot.sources?.length) {
            if (delta?.sources?.length) {
                console.log(`[Sources: ${snapshot.sources.join(', ')}]`);
            }
        }
    }

    console.log('\n--- Done ---');
}

main();
