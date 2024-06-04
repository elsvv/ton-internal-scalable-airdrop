import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, toNano } from '@ton/core';

export type AirdropHelperConfig = {
    airdrop: Address;
    proofHash: Buffer;
    index: number;
};

export function airdropHelperConfigToCell(config: AirdropHelperConfig): Cell {
    return beginCell()
        .storeBit(false)
        .storeAddress(config.airdrop)
        .storeBuffer(config.proofHash, 32)
        .storeUint(config.index, 64)
        .endCell();
}

export class AirdropHelper implements Contract {
    static CODE_CELL = Cell.fromBase64(
        'te6cckEBBQEA0AABFP8A9KQT9LzyyAsBAgFiAwIAEaCY19qJoa4UAQGa0DIhxwDyQNDTAzBxsI4tMYAg1yHTHzCCEEPH1cm68oDtRNDSADH6QNP/0z8wcMjLAFADzxbL/8s/ye1U4NMfAYIJOjymuuMCW4QP8vAEAMIBghAF9eEAvvLiwO1E0NIAAfLSvvpA0//TPzAD0z/XTCD5ACO68uLBgghMS0Bw+wKCEEPH1clwgBDIywUmzxYh+gLLassfEss/zFIwyz/Jgwb7AHHIywBYzxbL/8s/ye1UTQMKHA=='
    );
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new AirdropHelper(address);
    }

    static createFromConfig(config: AirdropHelperConfig, code = AirdropHelper.CODE_CELL, workchain = 0) {
        const data = airdropHelperConfigToCell(config);
        const init = { code, data };
        return new AirdropHelper(contractAddress(workchain, init), init);
    }

    static claimPayload(proof: Cell, queryId = 0) {
        return beginCell().storeUint(0x13a3ca6, 32).storeUint(queryId, 64).storeRef(proof).endCell();
    }

    /**
     * Deploy and send claim message at once.
     * @param via Sender object
     * @param proof dict merkel proof cell
     * @param queryId
     */
    async sendDeploy(provider: ContractProvider, via: Sender, proof: Cell, queryId = 0) {
        await provider.internal(via, {
            value: toNano('0.1'),
            body: AirdropHelper.claimPayload(proof, queryId),
        });
    }

    async sendClaim(provider: ContractProvider, via: Sender, proof: Cell, queryId = 0) {
        await provider.internal(via, {
            value: toNano('0.1'),
            body: AirdropHelper.claimPayload(proof, queryId),
        });
    }

    async getClaimed(provider: ContractProvider): Promise<boolean> {
        if ((await provider.getState()).state.type == 'uninit') {
            return false;
        }
        const stack = (await provider.get('get_claimed', [])).stack;
        return stack.readBoolean();
    }
}
