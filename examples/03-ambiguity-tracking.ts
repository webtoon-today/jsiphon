/**
 * Ambiguity Tracking Example
 *
 * Shows how to know when a field is "done" vs still streaming.
 * Use this to safely trigger actions only when data is finalized.
 *
 * Run: npx tsx examples/03-ambiguity-tracking.ts
 */

import { Jsiphon, META, isAmbiguous } from '../src/index.js';

interface UserProfile {
    user: string;
    bio: string;
    verified: boolean;
}

async function main() {
    console.log('--- Ambiguity Tracking Example ---\n');

    const parser = new Jsiphon<UserProfile>({
        stream: mockStream()
    });

    let userActionTaken = false;
    let bioActionTaken = false;

    for await (const snapshot of parser) {
        const ambiguous = snapshot[META].ambiguous;

        console.log('\n[Snapshot]');
        console.log(`  user:     "${snapshot.user ?? ''}" ${isAmbiguous(ambiguous.user) ? '(streaming...)' : '(DONE)'}`);
        console.log(`  bio:      "${snapshot.bio ?? ''}" ${isAmbiguous(ambiguous.bio) ? '(streaming...)' : '(DONE)'}`);
        console.log(`  verified: ${snapshot.verified ?? 'undefined'} ${isAmbiguous(ambiguous.verified) ? '(streaming...)' : '(DONE)'}`);

        // Trigger action only when user field is finalized
        // Check: field exists AND is not ambiguous
        if (!userActionTaken && snapshot.user && !isAmbiguous(ambiguous.user)) {
            console.log(`\n  >> ACTION: User "${snapshot.user}" confirmed - updating page title`);
            userActionTaken = true;
        }

        // Trigger action only when bio is finalized
        // Check: field exists AND is not ambiguous
        if (!bioActionTaken && snapshot.bio && !isAmbiguous(ambiguous.bio)) {
            console.log(`\n  >> ACTION: Bio complete - saving to database`);
            bioActionTaken = true;
        }
    }

    console.log('\n--- Done ---');
}

// --- Mock Stream ---

async function* mockStream(): AsyncIterable<string> {
    const chunks = [
        '{"user": "alice",',      // user is complete after this
        ' "bio": "Software ',
        'engineer ',
        'at ',
        'Acme",',                 // bio is complete after this
        ' "verified": true}'      // verified is complete
    ];

    for (const chunk of chunks) {
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`[Stream] ${JSON.stringify(chunk)}`);
        yield chunk;
    }
}

main();
