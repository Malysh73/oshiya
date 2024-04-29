# Oshiya Documentation

Panther Oshiya features a critical component in the Panther Protocol ecosystem.

Its primary function is to retrieve pending queues from the BusTree smart contract (SC), generate Succinct Non-interactive Arguments of Knowledge (SNARK) proofs of these queues’ inclusion in a Merkle tree, and submit these proofs with a newly proposed root for validation/updating on chain to the validator contract.

A queue’s legitimacy can be analyzed by comparing it against on-chain Unspent Transaction Outputs (UTXOs) represented in the form of a root of a degenerate Merkle tree. The root of this tree can be calculated and compared against the root stored there.

If the validation is successful, i.e. the proof is valid, the batch of up to 64 UTXOs is recorded on the BusTree Smart Contract: specifically, the insertion of the root of a binary Merkle tree containing a queue of UTXOs at a specified depth.

Importantly, this simultaneously yields a process requiring relatively low computational power to execute (compared to other methods) whilst maintaining a high level of security. This means the client can be run in a browser, for example, and community members can take the role of [zMiner](https://docs.pantherprotocol.io/docs/ecosystem/ecosystem-operators/zminer), i.e. run Oshiya nodes to gain rewards for properly submitting proofs.

## What next?

- Refresh the [keywords](2_Keywords.md)
- See the [Functional Abstract](3_FunctionalAbstract.md)