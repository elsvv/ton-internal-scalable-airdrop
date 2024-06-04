import { Address, toNano } from '@ton/core';
import { Airdrop } from '../wrappers/Airdrop';
import { NetworkProvider, compile } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const airdropAddress = Address.parse('');

    const airdrop = provider.open(Airdrop.createFromAddress(airdropAddress));

    const amountToWithdraw = toNano(1_000);

    await airdrop.sendWithdrawJettons(provider.sender(), amountToWithdraw);
}
