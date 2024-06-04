import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { Airdrop, AirdropEntry } from '../wrappers/Airdrop';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { AirdropHelper } from '../wrappers/AirdropHelper';

describe('Airdrop', () => {
    const usersCount = 1_000;

    let code: Cell;
    let codeHelper: Cell;
    let codeJettonMinter: Cell;
    let codeJettonWallet: Cell;

    beforeAll(async () => {
        code = await compile('Airdrop');
        codeHelper = await compile('AirdropHelper');
        codeJettonMinter = await compile('JettonMinter');
        codeJettonWallet = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let airdrop: SandboxContract<Airdrop>;
    let dictionary: Dictionary<number, AirdropEntry>;
    let dictCell: Cell;
    let users: SandboxContract<TreasuryContract>[];
    let jettonMinter: SandboxContract<JettonMinter>;
    let admin: SandboxContract<TreasuryContract>;
    let entries: AirdropEntry[];

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        admin = await blockchain.treasury('admin');

        users = await blockchain.createWallets(usersCount);

        entries = [];
        for (let i = 0; i < usersCount; i++) {
            entries.push({
                address: users[parseInt(i.toString())].address,
                amount: BigInt(Math.floor(Math.random() * 1e9)),
            });
        }
        dictionary = Airdrop.generateEntriesDictionary(entries);

        dictCell = beginCell().storeDictDirect(dictionary).endCell();

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    walletCode: codeJettonWallet,
                    admin: admin.address,
                    content: Cell.EMPTY,
                },
                codeJettonMinter
            )
        );

        await jettonMinter.sendDeploy(admin.getSender(), toNano('0.05'));

        airdrop = blockchain.openContract(
            Airdrop.createFromConfig(
                {
                    adminAddress: admin.address,
                    helperCode: codeHelper,
                    merkleRoot: BigInt('0x' + dictCell.hash().toString('hex')),
                },
                code
            )
        );

        const deployResult = await airdrop.sendDeploy(
            admin.getSender(),
            toNano('0.05'),
            await jettonMinter.getWalletAddressOf(airdrop.address)
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: admin.address,
            to: airdrop.address,
            deploy: true,
            success: true,
        });

        await jettonMinter.sendMint(
            admin.getSender(),
            toNano('0.05'),
            toNano('0.01'),
            airdrop.address,
            toNano('1000000')
        );
    });

    it('should deploy correctly', async () => {
        const data = await airdrop.getAirdropData();
        expect(data.admin_wallet).toEqualAddress(admin.address);
    });

    it('should claim one time', async () => {
        const index = 1;
        const merkleProof = dictionary.generateMerkleProof(index);
        const helper = blockchain.openContract(
            AirdropHelper.createFromConfig(
                {
                    airdrop: airdrop.address,
                    index: 1,
                    proofHash: merkleProof.hash(),
                },
                codeHelper
            )
        );
        const result = await helper.sendDeploy(users[index].getSender(), merkleProof);
        expect(result.transactions).toHaveTransaction({
            on: airdrop.address,
            success: true,
        });
        expect(
            await blockchain
                .openContract(
                    JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[index].address))
                )
                .getJettonBalance()
        ).toEqual(dictionary.get(index)?.amount);
        expect(await helper.getClaimed()).toBeTruthy();
    });

    it('should claim many times', async () => {
        for (let i = 0; i < usersCount; i += 1 + Math.floor(Math.random() * 25)) {
            const merkleProof = dictionary.generateMerkleProof(i);
            const helper = blockchain.openContract(
                AirdropHelper.createFromConfig(
                    {
                        airdrop: airdrop.address,
                        index: i,
                        proofHash: merkleProof.hash(),
                    },
                    codeHelper
                )
            );

            const result = await helper.sendDeploy(users[i].getSender(), merkleProof);
            expect(result.transactions).toHaveTransaction({
                on: airdrop.address,
                success: true,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[i].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(i)!.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }
    });

    it('should not claim if already did', async () => {
        const merkleProof = dictionary.generateMerkleProof(1);

        const helper = blockchain.openContract(
            AirdropHelper.createFromConfig(
                {
                    airdrop: airdrop.address,
                    index: 1,
                    proofHash: merkleProof.hash(),
                },
                codeHelper
            )
        );

        {
            const result = await helper.sendDeploy(users[1].getSender(), merkleProof);
            expect(result.transactions).toHaveTransaction({
                on: airdrop.address,
                success: true,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(1)?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }

        {
            const reuslt = await helper.sendDeploy(users[1].getSender(), merkleProof);
            expect(reuslt.transactions).toHaveTransaction({
                from: users[1].getSender().address,
                to: helper.address,
                success: false,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(1)?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }

        {
            const reuslt = await helper.sendDeploy(users[1].getSender(), merkleProof);
            expect(reuslt.transactions).toHaveTransaction({
                from: users[1].getSender().address,
                to: helper.address,
                success: false,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(1)?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }
    });

    it('should not claim with wrong index', async () => {
        {
            const merkleProof = dictionary.generateMerkleProof(2);
            const helper = blockchain.openContract(
                AirdropHelper.createFromConfig(
                    {
                        airdrop: airdrop.address,
                        index: 1,
                        proofHash: merkleProof.hash(),
                    },
                    codeHelper
                )
            );

            const result = await helper.sendDeploy(users[1].getSender(), merkleProof);
            expect(result.transactions).toHaveTransaction({
                from: helper.address,
                to: airdrop.address,
                success: false,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(0n);
        }

        {
            const merkleProof = dictionary.generateMerkleProof(1);
            const helper = blockchain.openContract(
                AirdropHelper.createFromConfig(
                    {
                        airdrop: airdrop.address,
                        index: 1,
                        proofHash: merkleProof.hash(),
                    },
                    codeHelper
                )
            );
            const result = await helper.sendDeploy(users[1].getSender(), merkleProof);
            expect(result.transactions).toHaveTransaction({
                from: helper.address,
                to: airdrop.address,
                success: true,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(1)?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }
    });

    it('should withdtraw jettons on admin request', async () => {
        const toWithdraw = 10_000_000n;

        {
            const notAdmin = await blockchain.treasury('notAdmin');

            const notAdminJettonWallet = blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(notAdmin.address))
            );

            expect(await notAdminJettonWallet.getJettonBalance()).toEqual(0n);

            const result = await airdrop.sendWithdrawJettons(notAdmin.getSender(), toWithdraw);
            expect(result.transactions).toHaveTransaction({
                from: notAdmin.address,
                to: airdrop.address,
                success: false,
            });
            expect(await notAdminJettonWallet.getJettonBalance()).toEqual(0n);
        }

        {
            const adminJettonWallet = blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(admin.address))
            );

            expect(await adminJettonWallet.getJettonBalance()).toEqual(0n);

            const result = await airdrop.sendWithdrawJettons(admin.getSender(), toWithdraw);
            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: airdrop.address,
                success: true,
            });
            expect(await adminJettonWallet.getJettonBalance()).toEqual(toWithdraw);
        }
    });
});
