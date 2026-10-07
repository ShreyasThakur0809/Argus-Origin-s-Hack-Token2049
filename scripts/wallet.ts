/**
 * Generates the two wallets the demo needs and prints .env lines.
 * Seller signs Masumi terms and receives payments; buyer is the paying agent.
 */
import { Address, PrivateKey } from "@evolution-sdk/evolution";
import { addressFromSeed } from "@evolution-sdk/evolution/sdk/wallet/Derivation";

function gen() {
  const mnemonic = PrivateKey.generateMnemonic();
  const address = Address.toBech32(addressFromSeed(mnemonic, { networkId: 0 }).address);
  return { mnemonic, address };
}

const seller = gen();
const buyer = gen();

console.log("SELLER (receives payments, signs escrow terms — no funding needed to sign)\n");
console.log(`SELLER_MNEMONIC=${seller.mnemonic}`);
console.log(`address: ${seller.address}\n`);
console.log("BUYER (the paying agent — fund this one)\n");
console.log(`BUYER_MNEMONIC=${buyer.mnemonic}`);
console.log(`address: ${buyer.address}\n`);
console.log("1. Paste both MNEMONIC lines into .env");
console.log("2. Fund the BUYER address: https://docs.cardano.org/cardano-testnets/tools/faucet");
