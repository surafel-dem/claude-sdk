/**
 * CLI Chat Interface
 *
 * Interactive terminal chat with the research agent.
 */

import 'dotenv/config';
import * as readline from 'readline';
import { runAgent } from './sandbox/index.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function chat() {
    console.log('\n🤖 Research Agent (type "exit" to quit)\n');

    const ask = (): Promise<string> =>
        new Promise((resolve) => rl.question('You: ', resolve));

    while (true) {
        const input = await ask();

        if (input.toLowerCase() === 'exit') {
            rl.close();
            break;
        }

        if (!input.trim()) continue;

        process.stdout.write('\nAgent: ');

        for await (const msg of runAgent(input)) {
            if (msg.type === 'assistant' && msg.message?.content) {
                for (const block of msg.message.content) {
                    if ('text' in block) process.stdout.write(block.text);
                }
            }
        }

        console.log('\n');
    }
}

chat().catch(console.error);
