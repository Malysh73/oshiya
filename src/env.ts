import { Wallet } from 'ethers';

import { EnvVariables } from './types';

export const requiredVars: Array<keyof EnvVariables> = [
    'INTERVAL',
    'PRIVATE_KEY',
    'RPC_URL',
    'CONTRACT_ADDRESS',
    'SUBGRAPH_ID',
];

function logEnvVariable(v: keyof EnvVariables | 'MINER_ADDRESS', value: string | number) {
    console.log(`${v}: ${value}`);
}

export function parseEnvVariables(env: NodeJS.ProcessEnv): EnvVariables {
    const parsed: Partial<EnvVariables> = {};

    for (const varName of requiredVars) {
        if (!env[varName]) {
            throw new Error(`Required environment variable missing: ${varName}`);
        }

        if (varName === 'INTERVAL') {
            parsed[varName] = parseInt(env[varName]!);
        } else {
            parsed[varName] = env[varName]!;
        }
    }

    return parsed as EnvVariables;
}

export function logSettings(env: EnvVariables): void {
    console.log('='.repeat(90));

    for (const v of requiredVars) {
        if (v === 'PRIVATE_KEY') {
            logEnvVariable('MINER_ADDRESS', new Wallet(env[v]).address);
        } else {
            logEnvVariable(v, env[v]);
        }
    }

    console.log('='.repeat(90));
}
