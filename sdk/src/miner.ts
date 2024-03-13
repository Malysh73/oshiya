// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: Copyright 2024 Panther Protocol Foundation

import {ContractReceipt, Wallet, utils} from 'ethers';

import {BusQueues, PantherBusTree} from './contract/bus-tree-types';
import {initializeBusContract} from './contracts';
import {LogFn, log as defaultLog} from './logging';
import {BusQueueRecStructOutput} from './types';

const MIN_REWARD = utils.parseEther('1');

function selectHighestN<T>(
    array: Array<T>,
    valueKey: keyof T,
    timeKey: keyof T,
    N: number,
): Array<T> {
    return [...array]
        .sort((a: T, b: T) => {
            if ((b[valueKey] as any) === (a[valueKey] as any)) {
                // If the values are the same, prefer the older block.
                return Number(a[timeKey]) - Number(b[timeKey]);
            } else {
                // Otherwise, prefer the higher value.
                return Number(b[valueKey]) - Number(a[valueKey]);
            }
        })
        .slice(0, N);
}

function getRandomElement<T>(array: Array<T>): T {
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}

export class Miner {
    public readonly address: string;
    private readonly busContract: PantherBusTree;

    private log: LogFn;

    constructor(
        privKey: string,
        rpcURL: string,
        contractAddress: string,
        log: LogFn = defaultLog,
    ) {
        const wallet = new Wallet(privKey);
        this.address = wallet.address;
        this.busContract = initializeBusContract(
            wallet,
            rpcURL,
            contractAddress,
        );
        this.log = log;
    }

    public async getHighestRewardQueue(): Promise<BusQueueRecStructOutput> {
        const queues = await this.getPendingQueues();
        const queuesWithMoreThanMinReward = queues.filter(
            q => q.reward.gt(MIN_REWARD) && q.remainingBlocks == 0,
        );
        const topFive = selectHighestN(
            queuesWithMoreThanMinReward,
            'reward',
            'firstUtxoBlock',
            5,
        );
        return getRandomElement(topFive);
    }

    public async getPendingQueues(): Promise<
        BusQueues.BusQueueRecStructOutput[]
    > {
        const queues = await this.busContract.getOldestPendingQueues(255);
        this.log(`Found ${queues.length} queue(s)`);
        return queues;
    }

    public async hasPendingQueues(): Promise<boolean> {
        const pendingQueues = await this.getPendingQueues();
        // Check if there are any pending queues with at least one UTXO
        return pendingQueues.some(
            (queue: BusQueues.BusQueueRecStructOutput) => queue.nUtxos > 0,
        );
    }

    public async mineQueue(
        minerAddress: string,
        queueId: bigint,
        publicSignals: any,
        proof: any,
    ): Promise<ContractReceipt> {
        const tx = await this.busContract.onboardQueue(
            minerAddress,
            queueId,
            publicSignals,
            proof,
            {
                gasLimit: 1_000_000,
            },
        );
        this.log(`Submitted tx ${tx.hash}`);
        return await tx.wait();
    }

    public async simulateAddUtxosToBusQueue(): Promise<ContractReceipt> {
        const tx = await this.busContract.simulateAddUtxosToBusQueue({
            gasLimit: 500_000,
        });
        this.log(`Submitted tx ${tx.hash} for generating random utxos`);
        return tx.wait();
    }

    public async getBusTreeRoot(): Promise<string> {
        return await this.busContract.getRoot();
    }
}
