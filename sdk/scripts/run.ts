// SPDX-License-Identifier: BUSL-1.1
// SPDX-FileCopyrightText: Copyright 2021-22 Panther Ventures Limited Gibraltar

import {join, resolve} from 'path';

import dotenv from 'dotenv';
import {ethers} from 'ethers';

import {BatchProcessing} from '../src/batch-processing';
import {parseEnvVariables, logSettings} from '../src/env';
import {EventScanner} from '../src/event-scanner';
import {log} from '../src/logging';
import {Miner} from '../src/miner';
import {MiningStats} from '../src/mining-stats';
import {QueueProcessing} from '../src/queue-processing';
import {coldStart, doWork} from '../src/runner';
import {ZKProver} from '../src/zk-prover';
import {MemCache} from '../src/mem-cache';
import {Subgraph} from '../src/subgraph';
import {MinerTree} from '../src/miner-tree';

dotenv.config({path: resolve(__dirname, '../.env')});

async function main() {
    const env = parseEnvVariables(process.env);
    logSettings(env);
    const miner = new Miner(env.PRIVATE_KEY, env.RPC_URL, env.CONTRACT_ADDRESS);
    const zkProver = new ZKProver(
        join(__dirname, '../src/wasm/pantherBusTreeUpdater.wasm'),
        join(__dirname, '../src/wasm/pantherBusTreeUpdater_final.zkey'),
    );

    const [tree, lastScannedBlock, insertedQueueIds] = await coldStart(
        env.SUBGRAPH_ID,
    );
    const db = new MemCache(insertedQueueIds);
    const scanner = new EventScanner(
        env.RPC_URL,
        env.CONTRACT_ADDRESS,
        lastScannedBlock,
        db,
    );

    const batchProcessing = new BatchProcessing(tree, scanner, db);
    const queueProcessing = new QueueProcessing(miner, db);
    const miningStats = new MiningStats();

    log('Setting up work interval');

    while (true) {
        log('Initiating work sequence.');
        await doWork(
            miner,
            zkProver,
            batchProcessing,
            queueProcessing,
            miningStats,
        );
        log('Work sequence completed. Waiting for next interval.');
        miningStats.printMetrics();
        miningStats.writeToFile();
        await new Promise(r =>
            setTimeout(r, Number(process.env.INTERVAL) * 1000),
        );
    }
}

main();
