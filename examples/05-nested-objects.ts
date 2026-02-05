/**
 * Nested Objects Example
 *
 * Shows how jsiphon handles deeply nested JSON structures.
 * Ambiguity tracking works at every level of nesting.
 *
 * Run: npx tsx examples/05-nested-objects.ts
 */

import { Jsiphon, META, isAmbiguous } from '../src/index.js';

interface UserData {
    user: {
        name: string;
        profile: {
            age: number;
            city: string;
            interests: string[];
        };
    };
    timestamp: string;
}

async function main() {
    console.log('--- Nested Objects Example ---\n');

    const parser = new Jsiphon<UserData>({
        stream: mockStream()
    });

    for await (const snapshot of parser) {
        const amb = snapshot[META].ambiguous;

        console.log('[Snapshot]');
        console.log(`  user.name: "${snapshot.user?.name ?? ''}" ${isAmbiguous((amb.user as any)?.name) ? '...' : 'DONE'}`);
        console.log(`  user.profile.age: ${snapshot.user?.profile?.age ?? 'undefined'} ${isAmbiguous((amb.user as any)?.profile?.age) ? '...' : 'DONE'}`);
        console.log(`  user.profile.city: "${snapshot.user?.profile?.city ?? ''}" ${isAmbiguous((amb.user as any)?.profile?.city) ? '...' : 'DONE'}`);
        console.log(`  user.profile.interests: [${snapshot.user?.profile?.interests?.map(i => `"${i}"`).join(', ') ?? ''}] ${isAmbiguous((amb.user as any)?.profile?.interests) ? '...' : 'DONE'}`);
        console.log(`  timestamp: "${snapshot.timestamp ?? ''}" ${isAmbiguous(amb.timestamp) ? '...' : 'DONE'}`);
        console.log();
    }

    console.log('--- Done ---');
}

// --- Mock Stream ---

async function* mockStream(): AsyncIterable<string> {
    const chunks = [
        '{"user": {"name": "Al',
        'ice", "profile": {"age":',
        ' 28, "city": "San Fran',
        'cisco", "interests": ["co',
        'ding", "music',
        '", "hiking"]}},',
        ' "timestamp": "2024-01-15"}'
    ];

    for (const chunk of chunks) {
        await new Promise(resolve => setTimeout(resolve, 300));
        yield chunk;
    }
}

main();
