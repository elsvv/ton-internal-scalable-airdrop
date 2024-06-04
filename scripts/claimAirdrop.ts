import { Address, Cell } from '@ton/core';
import { Airdrop } from '../wrappers/Airdrop';
import { NetworkProvider, compile } from '@ton/blueprint';
import { AirdropHelper } from '../wrappers/AirdropHelper';

export async function run(provider: NetworkProvider) {
    // suppose that you have the cell in base64 form stored somewhere
    const dictCell = Cell.fromBase64(
        'te6cckEBBQEAhgACA8/oAgEATUgA8OYDSxw0XZi4OdCD0hNOBW2Fd/rkR/Wmvmc3OwLdEYiLLQXgEAIBIAQDAE0gAkQn3LTRp9vn/K0TXJrWPCeEmrX7VdoMP2KoakM4TmSaO5rKAEAATSACVAuEaWe9itDZsX37JEAijrTCMPqXgvii2bYEKL67Q5odzWUAQC6Eo5U='
    );
    const dict = Airdrop.parseEntriesDictionary(dictCell);

    const entryIndex = 2;

    const proof = dict.generateMerkleProof(entryIndex);

    const helper = provider.open(
        AirdropHelper.createFromConfig(
            {
                airdrop: Address.parse('EQAGUXoAPHIHYleSbSE05egNAlK8YAaYqUQsMho709gMBXU2'),
                index: entryIndex,
                proofHash: proof.hash(),
            },
            await compile('AirdropHelper')
        )
    );

    if (!(await provider.isContractDeployed(helper.address))) {
        // Deploy and claim
        await helper.sendDeploy(provider.sender(), proof);
        await provider.waitForDeploy(helper.address);
    }
}
