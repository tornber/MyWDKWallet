import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerTron from '@tetherto/wdk-wallet-tron'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import 'dotenv/config'
/**
 * Production-Grade Multi-Chain Wallet Manager
 * Features:
 * - Encrypted seed phrase storage
 * - Multi-account support (BIP-44)
 * - Transaction signing & sending
 * - Fee estimation
 * - Balance monitoring
 * - Error handling & logging
 * - Wallet backup/recovery
 */

export class WalletApp {
  constructor(config = {}) {
    this.config = {
      storageDir: config.storageDir || './wallet-data',
      encryptionKey: config.encryptionKey || process.env.WALLET_ENCRYPTION_KEY,
      networks: {
        ethereum: {
          provider: config.ethereumProvider || 'https://eth.drpc.org',
          chainId: config.ethereumChainId || 1,
          testnet: config.ethereumTestnet || false
        },
        tron: {
          provider: config.tronProvider || 'https://api.trongrid.io',
          testnet: config.tronTestnet || false
        },
        bitcoin: {
          network: config.bitcoinNetwork || 'mainnet',
          host: config.bitcoinHost || 'electrum.blockstream.info',
          port: config.bitcoinPort || 50001
        }
      },
      accounts: config.accounts || 5, // Number of accounts to derive
      ...config
    }

    this.wdk = null
    this.accounts = {}
    this.logger = this.createLogger()
  }

  /**
   * Enhanced logging with timestamps and levels
   */
  createLogger() {
    return {
      info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      error: (msg, err) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err || ''),
      warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
      success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`)
    }
  }

  /**
   * Initialize wallet with encryption support
   */
  async initialize(seedPhrase = null) {
    try {
      this.logger.info('Initializing wallet...')

      // Create storage directory if it doesn't exist
      if (!fs.existsSync(this.config.storageDir)) {
        fs.mkdirSync(this.config.storageDir, { recursive: true })
        this.logger.info(`Created storage directory: ${this.config.storageDir}`)
      }

      // Load or generate seed phrase
      let phrase = seedPhrase
      if (!phrase) {
        const savedPhrase = this.loadEncryptedSeedPhrase()
        if (savedPhrase) {
          phrase = savedPhrase
          this.logger.info('Loaded existing seed phrase from storage')
        } else {
          phrase = WDK.getRandomSeedPhrase()
          this.saveSeedPhrase(phrase)
          this.logger.success('Generated and saved new seed phrase')
        }
      }



      // Initialize WDK with multi-chain support
      this.wdk = new WDK(phrase)
        .registerWallet('ethereum', WalletManagerEvm, {
          provider: this.config.networks.ethereum.provider
        })
        .registerWallet('tron', WalletManagerTron, {
          provider: this.config.networks.tron.provider,
          headers: {
            'TRON-PRO-API-KEY': process.env.TRON_API_KEY || ''
          }
        })
        .registerWallet('bitcoin', WalletManagerBtc, {
          network: this.config.networks.bitcoin.network,
          host: this.config.networks.bitcoin.host,
          port: this.config.networks.bitcoin.port
        })

      this.logger.success('Wallets registered for Ethereum, TRON, and Bitcoin')

      // Derive multiple accounts (BIP-44)
      await this.deriveAccounts()

      return true
    } catch (error) {
      this.logger.error('Initialization failed:', error)
      throw error
    }
  }

  /**
   * Derive multiple accounts from seed phrase
   */
  async deriveAccounts() {
    try {
      const chains = ['ethereum', 'tron', 'bitcoin']
      this.accounts = {}

      for (const chain of chains) {
        this.accounts[chain] = []
        for (let i = 0; i < this.config.accounts; i++) {
          const account = await this.wdk.getAccount(chain, i)
          const address = await account.getAddress()
          this.accounts[chain].push({
            index: i,
            account,
            address,
            balance: null,
            lastUpdated: null
          })
        }
      }

      this.logger.success(`Derived ${this.config.accounts} accounts for each chain`)
    } catch (error) {
      this.logger.error('Account derivation failed:', error)
      throw error
    }
  }

  /**
   * Get all addresses across all chains
   */
  async getAllAddresses() {
    const addresses = {}
    for (const [chain, accts] of Object.entries(this.accounts)) {
      addresses[chain] = accts.map(a => ({
        index: a.index,
        address: a.address
      }))
    }
    return addresses
  }

  /**
   * Check balances across all accounts
   */
  async checkAllBalances(verbose = true) {
    try {
      this.logger.info('Fetching balances...')
      const balances = {}

      for (const [chain, chainAccounts] of Object.entries(this.accounts)) {
        balances[chain] = {}
        for (const acctData of chainAccounts) {
          const balance = await acctData.account.getBalance()
          acctData.balance = balance
          acctData.lastUpdated = new Date()
          balances[chain][acctData.index] = {
            address: acctData.address,
            balance: balance.toString(),
            unit: chain === 'bitcoin' ? 'sats' : 'units'
          }

          if (verbose) {
            this.logger.info(
              `${chain.toUpperCase()} Account ${acctData.index}: ${acctData.address.substring(0, 20)}... = ${balance.toString()}`
            )
          }
        }
      }

      return balances
    } catch (error) {
      this.logger.error('Balance check failed:', error)
      throw error
    }
  }

  /**
   * Estimate transaction fees
   */
  async estimateTransactionFees(chain, toAddress, amount) {
    try {
      this.logger.info(`Estimating ${chain} transaction fee...`)
      const account = this.accounts[chain][0].account // Use first account

      const quote = await account.quoteSendTransaction({
        to: toAddress,
        value: amount
      })

      const estimatedFee = {
        chain,
        amount: quote.fee.toString(),
        gasLimit: quote.gasLimit?.toString() || 'N/A',
        gasPrice: quote.gasPrice?.toString() || 'N/A',
        estimatedTime: quote.estimatedTime || 'variable'
      }

      this.logger.info(`Estimated fee: ${estimatedFee.amount}`)
      return estimatedFee
    } catch (error) {
      this.logger.error(`Fee estimation failed for ${chain}:`, error)
      throw error
    }
  }

  /**
   * Send transaction
   */
  async sendTransaction(chain, accountIndex = 0, toAddress, amount) {
    try {
      this.logger.info(`Sending ${chain} transaction...`)

      if (!this.accounts[chain] || !this.accounts[chain][accountIndex]) {
        throw new Error(`Account ${accountIndex} not found for ${chain}`)
      }

      const account = this.accounts[chain][accountIndex].account

      // Estimate fee first
      const feeEstimate = await this.estimateTransactionFees(chain, toAddress, amount)
      this.logger.warn(`Estimated fee: ${feeEstimate.amount} ${feeEstimate.chain === 'bitcoin' ? 'sats' : 'units'}`)

      // Send transaction
      const result = await account.sendTransaction({
        to: toAddress,
        value: amount
      })

      const txInfo = {
        chain,
        from: this.accounts[chain][accountIndex].address,
        to: toAddress,
        amount: amount.toString(),
        txHash: result.hash,
        timestamp: new Date(),
        fee: feeEstimate.amount
      }

      // Save transaction history
      this.saveTransactionHistory(txInfo)

      this.logger.success(`Transaction sent! Hash: ${result.hash}`)
      return txInfo
    } catch (error) {
      this.logger.error(`Transaction failed for ${chain}:`, error)
      throw error
    }
  }

  /**
   * Encrypt and save seed phrase
   */
  saveSeedPhrase(seedPhrase) {
    if (!this.config.encryptionKey) {
      this.logger.warn('No encryption key provided. Saving seed phrase unencrypted.')
    }

    const encrypted = this.config.encryptionKey
      ? this.encrypt(seedPhrase, this.config.encryptionKey)
      : seedPhrase

    const filePath = path.join(this.config.storageDir, '.seed')
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 })
    this.logger.success('Seed phrase saved securely')
  }

  /**
   * Load and decrypt seed phrase
   */
  loadEncryptedSeedPhrase() {
    const filePath = path.join(this.config.storageDir, '.seed')
    if (!fs.existsSync(filePath)) return null

    const encrypted = fs.readFileSync(filePath, 'utf-8')

    if (!this.config.encryptionKey) {
      return encrypted
    }

    try {
      return this.decrypt(encrypted, this.config.encryptionKey)
    } catch (error) {
      this.logger.error('Failed to decrypt seed phrase:', error)
      return null
    }
  }

  /**
   * Save transaction history
   */
  saveTransactionHistory(txInfo) {
    const historyPath = path.join(this.config.storageDir, 'transaction-history.json')
    let history = []

    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
    }

    history.push(txInfo)
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(chain = null) {
    const historyPath = path.join(this.config.storageDir, 'transaction-history.json')
    if (!fs.existsSync(historyPath)) return []

    let history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))

    if (chain) {
      history = history.filter(tx => tx.chain === chain)
    }

    return history
  }

  /**
   * Export wallet backup
   */
  exportBackup() {
    const backup = {
      addresses: this.accounts,
      transactions: this.getTransactionHistory(),
      timestamp: new Date(),
      warning: 'Keep this backup secure. Anyone with access to it can access your wallets.'
    }

    const backupPath = path.join(
      this.config.storageDir,
      `backup-${Date.now()}.json`
    )

    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
    this.logger.success(`Backup exported to: ${backupPath}`)
    return backupPath
  }

  /**
   * Simple encryption (use proper crypto library in production)
   */
  encrypt(text, key) {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      crypto.scryptSync(key, 'salt', 32),
      iv
    )
    let encrypted = cipher.update(text, 'utf-8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  }

  /**
   * Simple decryption
   */
  decrypt(text, key) {
    const [iv, encrypted] = text.split(':')
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      crypto.scryptSync(key, 'salt', 32),
      Buffer.from(iv, 'hex')
    )
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8')
    decrypted += decipher.final('utf-8')
    return decrypted
  }

  startBalanceMonitoring(intervalMs = 30000) {
  if (this.balanceMonitor) {
    clearInterval(this.balanceMonitor)
  }

  // Fetch immediately
  this.checkAllBalances()
    .catch(error => this.logger.error('Initial balance update failed:', error))

  // Then refresh periodically
  this.balanceMonitor = setInterval(async () => {
    try {
      await this.checkAllBalances(false)
      this.logger.success('Balances updated')
    } catch (error) {
      this.logger.error('Balance update failed:', error)
    }
  }, intervalMs)

  this.logger.info(
    `Balance monitoring started. Refresh interval: ${intervalMs / 1000}s`
  )
}


  /**
   * Cleanup
   */
  async dispose() {
  if (this.balanceMonitor) {
    clearInterval(this.balanceMonitor)
    this.balanceMonitor = null
  }

  if (this.wdk) {
    await this.wdk.dispose()
    this.logger.success('Wallet disposed')
  }
}

}

/**
 * Demo usage
 */
async function main() {
  const wallet = new WalletApp({
    storageDir: './my-wallet',

    // Keep this key unchanged between restarts.
    encryptionKey:
      process.env.WALLET_ENCRYPTION_KEY || 'your-secret-key-change-this',

    accounts: 3
  })

  try {
    // Loads ./my-wallet/.seed if it already exists.
    // Otherwise generates and saves a new seed.
    await wallet.initialize()

    // Show addresses once at startup
    const addresses = await wallet.getAllAddresses()

    console.log('\n📍 All Addresses:')
    console.log(JSON.stringify(addresses, null, 2))

    // Start ONE balance monitor.
    // It checks immediately, then every 60 seconds.
    wallet.startBalanceMonitoring(60000)

    console.log('\n💰 Balance monitoring is running...')
    console.log('Press Ctrl+C to stop.\n')

    // Keep Node.js alive.
    await new Promise(() => {})

  } catch (error) {
    wallet.logger.error('Fatal error:', error)
    await wallet.dispose()
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down...')

  try {
    await wallet?.dispose()
  } catch (error) {
    console.error('Shutdown error:', error)
  }

  process.exit(0)
})

main()

