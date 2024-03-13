// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: Copyright 2024 Panther Protocol Foundation

import {PantherBusTree} from 'contract/bus-tree-types';
import {Contract, Wallet, getDefaultProvider} from 'ethers';

import BUS_ABI from './contract/bus-tree-abi.json';

export function initializeReadOnlyBusContract(
    rpcURL: string,
    contractAddress: string,
): PantherBusTree {
    const provider = getDefaultProvider(rpcURL);
    return new Contract(contractAddress, BUS_ABI, provider) as PantherBusTree;
}

export function initializeBusContract(
    wallet: Wallet,
    rpcURL: string,
    contractAddress: string,
): PantherBusTree {
    const provider = getDefaultProvider(rpcURL);
    const signer = wallet.connect(provider);
    return new Contract(contractAddress, BUS_ABI, signer) as PantherBusTree;
}
