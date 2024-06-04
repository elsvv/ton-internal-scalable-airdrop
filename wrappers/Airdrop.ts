import {
    Dictionary,
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Builder,
    Slice,
    toNano,
} from '@ton/core';

export type AirdropConfig = {
    merkleRoot: bigint;
    adminAddress: Address | null;
    helperCode: Cell;
    forwardPayload?: Cell;
};

export function airdropConfigToCell(config: AirdropConfig): Cell {
    return beginCell()
        .storeAddress(null)
        .storeAddress(config.adminAddress)
        .storeUint(config.merkleRoot, 256)
        .storeRef(config.helperCode)
        .storeMaybeRef(config.forwardPayload)
        .storeUint(Math.floor(Math.random() * 1e9), 64)
        .endCell();
}

export type AirdropEntry = {
    id?: number;
    address: Address;
    amount: bigint;
};

const airdropEntryValue = {
    serialize: (src: AirdropEntry, buidler: Builder) => buidler.storeAddress(src.address).storeCoins(src.amount),
    parse: (src: Slice) => ({
        address: src.loadAddress(),
        amount: src.loadCoins(),
    }),
};

export class Airdrop implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Airdrop(address);
    }

    static createFromConfig(config: AirdropConfig, code: Cell, workchain = 0) {
        const data = airdropConfigToCell(config);
        const init = { code, data };
        return new Airdrop(contractAddress(workchain, init), init);
    }

    static generateEntriesDictionary(entries: AirdropEntry[], useEntryId = false): Dictionary<number, AirdropEntry> {
        let dict: Dictionary<number, AirdropEntry> = Dictionary.empty(Dictionary.Keys.Uint(64), airdropEntryValue);

        if (useEntryId) {
            entries.forEach((entry, i) => {
                if (entry.id === undefined) {
                    throw new Error(`AirdropEntry id missing for ${i} entry`);
                }
                dict.set(entry.id, entry);
            });
        } else {
            entries.forEach((entry, i) => dict.set(i, entry));
        }

        return dict;
    }

    static generateDictFromBoc(src: Cell | Slice): Dictionary<number, AirdropEntry> {
        return Dictionary.loadDirect(Dictionary.Keys.Uint(64), airdropEntryValue, src);
    }

    static parseEntriesDictionary(dictCell: Cell): Dictionary<number, AirdropEntry> {
        return dictCell.beginParse().loadDictDirect(Dictionary.Keys.Uint(64), airdropEntryValue);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, jettonWallet: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x610ca46c, 32).storeUint(0, 64).storeAddress(jettonWallet).endCell(),
        });
    }

    async sendWithdrawJettons(provider: ContractProvider, via: Sender, amount: bigint) {
        await provider.internal(via, {
            value: toNano('0.1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xd0fc5dda, 32).storeUint(0, 64).storeCoins(amount).endCell(),
        });
    }

    async getAirdropData(provider: ContractProvider) {
        const { stack } = await provider.get('get_airdrop_data', []);

        // (data::jetton_wallet, data::merkle_root, data::helper_code, data::admin_wallet)
        return {
            jetton_wallet: stack.readAddress(),
            merkle_root: stack.readBigNumber(),
            helper_code: stack.readCell(),
            admin_wallet: stack.readAddress(),
        };
    }
}
