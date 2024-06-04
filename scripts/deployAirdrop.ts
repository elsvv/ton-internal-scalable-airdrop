import { Address, beginCell, toNano } from '@ton/core';
import { writeFileSync } from 'fs';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Airdrop, AirdropEntry } from '../wrappers/Airdrop';
import { JettonMinter } from '../wrappers/JettonMinter';
import { join } from 'path';

export async function run(provider: NetworkProvider) {
    const entries: AirdropEntry[] = [];

    console.log('Generatind dict...');
    const dict = Airdrop.generateEntriesDictionary(entries);
    console.log('Dict Generated');

    writeFileSync(
        join(__dirname, 'airdrop-data.json'),
        JSON.stringify(
            entries.map((e, index) => {
                console.log('index', index);
                return [
                    e.address.toRawString(),
                    e.amount.toString(),
                    dict.generateMerkleProof(index).toBoc({ idx: false }).toString('base64'),
                ];
            })
        )
    );

    const dictCell = beginCell().storeDictDirect(dict).endCell();
    // const dictBocBase64 = dictCell.toBoc().toString('base64');

    const merkleRoot = BigInt('0x' + dictCell.hash().toString('hex'));

    const jettonMinterAddress = Address.parse('');

    const jettonMinter = provider.open(JettonMinter.createFromAddress(jettonMinterAddress));

    const adminAddress = provider.sender().address!;
    const forwardPayload = beginCell().storeUint(0, 32).storeStringTail('Claimed 🔥').endCell();

    const airdrop = provider.open(
        Airdrop.createFromConfig(
            {
                adminAddress,
                merkleRoot,
                helperCode: await compile('AirdropHelper'),
                forwardPayload,
            },
            await compile('Airdrop')
        )
    );

    await airdrop.sendDeploy(provider.sender(), toNano('0.05'), await jettonMinter.getWalletAddressOf(airdrop.address));

    console.log('Airdrop address:');
    console.log(airdrop.address.toString());
}
