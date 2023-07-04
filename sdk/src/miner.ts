// SPDX-License-Identifier: BUSL-1.1
// SPDX-FileCopyrightText: Copyright 2021-22 Panther Ventures Limited Gibraltar

import {ContractReceipt, Wallet} from 'ethers';

import {BusTree} from './contract/bus-tree-types';
import {initializeBusContract} from './contracts';
import {LogFn, log as defaultLog} from './logging';
import {BusQueueRecStructOutput} from './types';

export class Miner {
    public readonly address: string;
    private readonly busContract: BusTree;

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
        let queues = await this.busContract.getOldestPendingQueues(255);
        queues = queues.filter(
            (q: BusQueueRecStructOutput) => Number(q.nUtxos) == 64,
        );

        return queues.reduce(
            (max: BusQueueRecStructOutput, q: BusQueueRecStructOutput) =>
                max.reward.gt(q.reward) ? max : q,
            queues[0],
        );
    }

    public async mineQueue(
        minerAddress: string,
        queueId: bigint,
        newBusTreeRoot: string,
        newBranchRoot: string,
        batchRoot: string,
        proof: any,
    ): Promise<ContractReceipt> {
        const tx = await this.busContract.onboardQueue(
            minerAddress,
            queueId,
            newBusTreeRoot,
            batchRoot,
            newBranchRoot,
            proof,
        );
        this.log(`Submitted tx ${tx.hash}`);
        return await tx.wait();
    }

    public async getBusTreeRoot(): Promise<string> {
        return await this.busContract.busTreeRoot();
    }
}
