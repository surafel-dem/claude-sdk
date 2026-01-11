/**
 * CLI Entry Point
 *
 * Run a single research query from command line.
 */

import 'dotenv/config';
import { runAgent, getMode } from './sandbox/index.js';

async function main() {
    const prompt = process.argv[2] || 'What are the latest AI developments?';

    console.log(`\n🔍 Query: "${prompt}"`);
    console.log(`   Mode: ${getMode()}\n`);

    for await (const message of runAgent(prompt)) {
        if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
                if ('text' in block) {
                    process.stdout.write(block.text);
                } else if ('name' in block) {
                    console.log(`\n📦 [${block.name}]`);
                }
            }
        }

        if (message.type === 'result') {
            console.log(`\n\n✅ ${message.subtype} (${message.num_turns} turns, $${message.total_cost_usd?.toFixed(4)})`);
        }
    }
}

main().catch(console.error);
