import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerTron from '@tetherto/wdk-wallet-tron'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'


console.log('Starting WDK App...')

const seedPhrase = WDK.getRandomSeedPhrase()
console.log('Generated seed phrase:', seedPhrase)

console.log('Registering wallets...')
const wdkWithWallets = new WDK(seedPhrase)
  .registerWallet('ethereum', WalletManagerEvm, {
    provider: 'https://eth.drpc.org'
  })
  .registerWallet('tron', WalletManagerTron, {
    provider: 'https://api.trongrid.io'
  })
  .registerWallet('bitcoin', WalletManagerBtc, {
    network: 'mainnet',
    host: 'electrum.blockstream.info',
    port: 50001
  })
  .registerWallet('solana', WalletManagerSolana, {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    wsUrl: 'wss://api.mainnet-beta.solana.com'
  })
console.log('Wallets registered for Ethereum, TRON, Bitcoin, and Solana')


console.log('Retrieving accounts...')
const accounts = {
  ethereum: await wdkWithWallets.getAccount('ethereum', 0),
  tron: await wdkWithWallets.getAccount('tron', 0),
  bitcoin: await wdkWithWallets.getAccount('bitcoin', 0)
}
console.log('Resolving addresses:')
for (const [chain, account] of Object.entries(accounts)) {
  const address = await account.getAddress()
  console.log(`   ${chain.toUpperCase()}: ${address}`)
}

// Add this code after the address resolution
console.log('Checking balances...')

for (const [chain, account] of Object.entries(accounts)) {
    const balance = await account.getBalance()
    console.log(`   ${chain.toUpperCase()}: ${balance.toString()} units`)
}

for (const [chain, account] of Object.entries(accounts)) {
  const quote = await account.quoteSendTransaction({
    to: await account.getAddress(),
    value: chain === 'bitcoin' ? 100000000n : chain === 'tron' ? 1000000n : 1000000000000000000n
  })
  console.log(`   ${chain.toUpperCase()}: ${quote.fee.toString()} units`)
}

