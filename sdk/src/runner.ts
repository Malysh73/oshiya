// SPDX-License-Identifier: BUSL-1.1
// SPDX-FileCopyrightText: Copyright 2021-22 Panther Ventures Limited Gibraltar

import {utils} from 'ethers';

import {BatchProcessing} from './batch-processing';
import {bigintToBytes32} from './bigint-conversions';
import {LogFn, log as defaultLog} from './logging';
import {Miner} from './miner';
import {EMPTY_TREE_ROOT, MinerTree} from './miner-tree';
import {MiningStats, addToListAndCount, logAndCount} from './mining-stats';
import {QueueProcessing} from './queue-processing';
import {Subgraph} from './subgraph';
import {BusBatchOnboardedEvent, ProofInputs, UtxoBusQueuedEvent} from './types';
import {ZKProver} from './zk-prover';

async function prepareProof(
    queueProcessing: QueueProcessing,
    miner: Miner,
    copyOfTree: MinerTree,
    utxos: UtxoBusQueuedEvent[],
    queueId: number,
    log: LogFn = defaultLog,
): Promise<ProofInputs> {
    try {
        return queueProcessing.prepareProofForQueue(
            miner.address,
            copyOfTree,
            utxos,
            queueId,
        );
    } catch (e) {
        log('Error while preparing proof');
        throw e;
    }
}

async function generateProof(
    zkProver: ZKProver,
    proofInputs: any,
    log: LogFn = defaultLog,
): Promise<any> {
    try {
        log('Generating proof');
        return await zkProver.generateProof(proofInputs);
    } catch (e) {
        log(
            `Error while generating proof: ${
                e instanceof Error ? e.message : e
            }`,
        );
        throw e;
    }
}

async function submitProof(
    miner: Miner,
    proof: any,
    proofInputs: any,
    queueAndUtxos: any,
    log: LogFn = defaultLog,
): Promise<void> {
    try {
        log('Submitting proof');
        await miner.mineQueue(
            miner.address,
            BigInt(queueAndUtxos.queue.queueId),
            proofInputs,
            proof,
        );
    } catch (e) {
        log('Error while submitting proof');
        throw e;
    }
}

export async function coldStart(
    subgraphId: string,
    log: LogFn = defaultLog,
): Promise<[MinerTree, number, number[]]> {
    log('Starting cold start');
    const [tree, filledBatches] = await initializeMinerTree(subgraphId);
    const insertedQueueIds = filledBatches.map(batch => Number(batch.queueId));
    const startingBlock = await getOldestBlockNumber(subgraphId);

    log(
        `Cold start finished. Start chain scanning from ${
            isFinite(startingBlock) ? startingBlock : 'genesis'
        } block`,
    );
    return [tree, startingBlock, insertedQueueIds];
}

// Initializes MinerTree and returns sorted onboarded batches
async function initializeMinerTree(
    subgraphId: string,
): Promise<[MinerTree, BusBatchOnboardedEvent[]]> {
    const tree = new MinerTree();
    const subgraph = new Subgraph(subgraphId);
    const filledBranches = await subgraph.getFilledBranches();
    filledBranches.sort((a, b) => a.branchIndex - b.branchIndex);
    filledBranches.forEach(branch => {
        tree.insertFilledBranch(branch);
    });

    const nextBranchIndex = filledBranches.reduce(
        (max, branch) => Math.max(max, branch.branchIndex),
        0,
    );

    const filledBatches = await subgraph.getOnboardedBatches(
        nextBranchIndex << 10,
    );
    filledBatches.sort((a, b) => a.batchIndex - b.batchIndex);
    filledBatches.forEach(batch => tree.insertBatch(batch));
    return [tree, filledBatches];
}

// Gets oldest block number excluding inserted queueIds
async function getOldestBlockNumber(subgraphId: string): Promise<number> {
    const subgraph = new Subgraph(subgraphId);
    return subgraph.getOldestBlockNumber();
}

async function simulateAddUtxo(
    miner: Miner,
    miningStats: MiningStats,
    log: LogFn = defaultLog,
) {
    try {
        await miner.simulateAddUtxosToBusQueue();
        logAndCount('Inserted UTXOs.', miningStats, log);
        logAndCount(
            'Checking and updating inserted batches.',
            miningStats,
            log,
        );
    } catch (e: any) {
        console.error(e);
    }
}

async function mineUtxos(
    miner: Miner,
    zkProver: ZKProver,
    batchProcessing: BatchProcessing,
    queueProcessing: QueueProcessing,
    miningStats: MiningStats,
    log: LogFn = defaultLog,
) {
    try {
        await batchProcessing.checkInsertedBatchesAndUpdateMinerTree();

        logAndCount('Checking BusTree root.', miningStats, log);
        let currentRoot = await miner.getBusTreeRoot();
        currentRoot =
            currentRoot === bigintToBytes32(0n) ? EMPTY_TREE_ROOT : currentRoot;
        if (currentRoot !== batchProcessing.tree.root) {
            logAndCount(
                'BusTree root is not up-to-date. Wait for sync',
                miningStats,
            );
            log(
                `BusTree root ${batchProcessing.tree.root} is not up-to-date with smart contract ${currentRoot}. Please wait for synchronization`,
            );
            return;
        }

        logAndCount('Fetching and handling queue and UTXOs.', miningStats, log);
        const queueAndUtxos =
            await queueProcessing.fetchAndHandleQueueAndUtxos();
        if (!queueAndUtxos) {
            logAndCount('No queue and UTXOs found', miningStats, log);
            return;
        }
        addToListAndCount(
            'utxos in queue',
            queueAndUtxos.utxos.length,
            miningStats,
        );
        addToListAndCount(
            'reward for queue, ZKP',
            Number(utils.formatEther(queueAndUtxos.queue.reward)),
            miningStats,
        );

        log('Preparing and submitting proof.');
        const copyOfTree = batchProcessing.tree.copy();
        const proofInputs = await prepareProof(
            queueProcessing,
            miner,
            copyOfTree,
            queueAndUtxos.utxos,
            queueAndUtxos.queue.queueId,
            log,
        );

        const [proof, publicSignals] = await generateProof(
            zkProver,
            proofInputs,
            log,
        );
        logAndCount('Generated proof', miningStats, log);
        miningStats.incrementStats('generatedProof');

        await submitProof(miner, proof, publicSignals, queueAndUtxos, log);
        logAndCount('Submitted proof', miningStats, log);
        miningStats.incrementStats('submittedProof');

        batchProcessing.tree = copyOfTree;
        batchProcessing.setBusBatchIsOnboarded(queueAndUtxos.queue.queueId);

        log('Proof submitted');
        log(`New BusTree root: ${batchProcessing.tree.root}`);
        logAndCount('Mining success', miningStats, log);
        miningStats.incrementStats('miningSuccess');

        addToListAndCount(
            'Mined reward, ZKP',
            Number(utils.formatEther(queueAndUtxos.queue.reward)),
            miningStats,
        );
        addToListAndCount(
            'Mined utxos',
            queueAndUtxos.utxos.length,
            miningStats,
        );
    } catch (e: any) {
        console.error(e);
        logAndCount(`Mining error: ${e}`, miningStats, log);
        miningStats.incrementStats('miningError');
    }
}

export async function doWork(
    miner: Miner,
    zkProver: ZKProver,
    batchProcessing: BatchProcessing,
    queueProcessing: QueueProcessing,
    miningStats: MiningStats,
    isForceSimulation: boolean = false,
    log: LogFn = defaultLog,
): Promise<void> {
    // Mine UTXOs.
    await mineUtxos(
        miner,
        zkProver,
        batchProcessing,
        queueProcessing,
        miningStats,
        log,
    );

    // Determine whether a simulation is needed.
    const shouldSimulate =
        isForceSimulation || (await miner.hasPendingQueues());

    // If a simulation is needed, simulate the addition of a UTXO.
    if (shouldSimulate) {
        await simulateAddUtxo(miner, miningStats, log);
    }
}
