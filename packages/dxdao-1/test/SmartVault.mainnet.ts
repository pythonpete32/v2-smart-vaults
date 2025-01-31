import { bn, fp, getForkedNetwork, impersonate, instanceAt, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { assertPermissions, deployment } from '@mimic-fi/v2-smart-vaults-base'
import { expect } from 'chai'
import { Contract } from 'ethers'
import hre, { ethers } from 'hardhat'
import path from 'path'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

describe('SmartVault', () => {
  let smartVault: Contract, wallet: Contract, wrapper: Contract, registry: Contract
  let owner: string, relayers: string[], managers: string[], feeCollector: string, mimic: { [key: string]: string }

  before('deploy mimic', async () => {
    // TODO: this should be read from input once Mimic is deployed
    const baseDir = path.join(process.cwd(), '../base')
    const input = await deployment.readInput(getForkedNetwork(hre), baseDir)
    await impersonate(input.admin, fp(100))
    mimic = await deployment.deploy(getForkedNetwork(hre), 'test', baseDir)
  })

  before('load accounts', async () => {
    const input = await deployment.readInput(getForkedNetwork(hre))
    owner = input.accounts.owner
    relayers = input.accounts.relayers
    managers = input.accounts.managers
    feeCollector = input.accounts.feeCollector
    registry = await instanceAt('IRegistry', mimic.Registry)
  })

  before('deploy smart vault', async () => {
    // TODO: this should be executed directly using the deployment script once Mimic is deployed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const script = require('../deploy/index.ts').default
    const input = deployment.readInput(getForkedNetwork(hre))
    input.mimic = mimic
    input.params.registry = mimic.Registry
    input.params.smartVaultParams.impl = mimic.SmartVault
    input.params.smartVaultParams.walletParams.impl = mimic.Wallet
    input.params.smartVaultParams.walletParams.priceOracle = mimic.PriceOracle
    await script(input, deployment.writeOutput('test'))
    const { Wrapper, SmartVault, Wallet } = deployment.readOutput('test')

    wrapper = await instanceAt('Wrapper', Wrapper)
    wallet = await instanceAt('Wallet', Wallet)
    smartVault = await instanceAt('SmartVault', SmartVault)
  })

  describe('smart vault', () => {
    it('uses the correct implementation', async () => {
      expect(await registry.implementationOf(smartVault.address)).to.be.equal(mimic.SmartVault)
    })

    it('has set its permissions correctly', async () => {
      await assertPermissions(smartVault, [
        { name: 'owner', account: owner, roles: ['authorize', 'unauthorize', 'setWallet', 'setAction'] },
        { name: 'wrapper', account: wrapper, roles: [] },
        { name: 'managers', account: managers, roles: [] },
        { name: 'relayers', account: relayers, roles: [] },
        { name: 'feeCollector', account: feeCollector, roles: [] },
      ])
    })

    it('whitelists the actions', async () => {
      expect(await smartVault.isActionWhitelisted(wrapper.address)).to.be.true
    })
  })

  describe('wallet', () => {
    it('uses the correct implementation', async () => {
      expect(await registry.implementationOf(wallet.address)).to.be.equal(mimic.Wallet)
    })

    it('has set its permissions correctly', async () => {
      await assertPermissions(wallet, [
        {
          name: 'owner',
          account: owner,
          roles: [
            'authorize',
            'unauthorize',
            'collect',
            'withdraw',
            'wrap',
            'unwrap',
            'claim',
            'join',
            'exit',
            'swap',
            'setStrategy',
            'setPriceFeed',
            'setPriceFeeds',
            'setPriceOracle',
            'setSwapConnector',
            'setSwapFee',
            'setPerformanceFee',
            'setWithdrawFee',
          ],
        },
        { name: 'wrapper', account: wrapper, roles: ['wrap', 'withdraw'] },
        { name: 'managers', account: managers, roles: [] },
        { name: 'relayers', account: relayers, roles: [] },
        { name: 'feeCollector', account: feeCollector, roles: ['setFeeCollector'] },
      ])
    })

    it('sets a fee collector', async () => {
      expect(await wallet.feeCollector()).to.be.equal(feeCollector)
    })

    it('sets no swap fee', async () => {
      const swapFee = await wallet.swapFee()

      expect(swapFee.pct).to.be.equal(0)
      expect(swapFee.cap).to.be.equal(0)
      expect(swapFee.token).to.be.equal(ZERO_ADDRESS)
      expect(swapFee.period).to.be.equal(0)
    })

    it('sets no withdraw fee', async () => {
      const withdrawFee = await wallet.withdrawFee()

      expect(withdrawFee.pct).to.be.equal(0)
      expect(withdrawFee.cap).to.be.equal(0)
      expect(withdrawFee.token).to.be.equal(ZERO_ADDRESS)
      expect(withdrawFee.period).to.be.equal(0)
    })

    it('sets no performance fee', async () => {
      const performanceFee = await wallet.performanceFee()

      expect(performanceFee.pct).to.be.equal(0)
      expect(performanceFee.cap).to.be.equal(0)
      expect(performanceFee.token).to.be.equal(ZERO_ADDRESS)
      expect(performanceFee.period).to.be.equal(0)
    })

    it('sets a price oracle', async () => {
      expect(await wallet.priceOracle()).to.be.equal(mimic.PriceOracle)
    })

    it('does not set a swap connector', async () => {
      expect(await wallet.swapConnector()).to.be.equal(ZERO_ADDRESS)
    })

    it('sets a price feed for WETH-USDC', async () => {
      expect(await wallet.getPriceFeed(USDC, WETH)).not.to.be.equal(ZERO_ADDRESS)
      expect(await wallet.getPrice(WETH, USDC)).to.be.gt(bn(1300e6))
    })
  })

  describe('wrapper', () => {
    it('has set its permissions correctly', async () => {
      await assertPermissions(wrapper, [
        {
          name: 'owner',
          account: owner,
          roles: [
            'authorize',
            'unauthorize',
            'setWallet',
            'setLimits',
            'setRelayer',
            'setThreshold',
            'setRecipient',
            'call',
          ],
        },
        { name: 'wrapper', account: wrapper, roles: [] },
        { name: 'managers', account: managers, roles: ['call'] },
        { name: 'relayers', account: relayers, roles: ['call'] },
        { name: 'feeCollector', account: feeCollector, roles: [] },
      ])
    })

    it('has the proper wallet set', async () => {
      expect(await wrapper.wallet()).to.be.equal(wallet.address)
    })

    it('sets the owner as the recipient', async () => {
      expect(await wrapper.recipient()).to.be.equal(owner)
    })

    it('sets the expected token threshold params', async () => {
      expect(await wrapper.thresholdToken()).to.be.equal(USDC)
      expect(await wrapper.thresholdAmount()).to.be.equal(bn(200e6))
    })

    it('sets the expected gas limits', async () => {
      expect(await wrapper.gasPriceLimit()).to.be.equal(bn(100e9))
      expect(await wrapper.totalCostLimit()).to.be.equal(0)
      expect(await wrapper.payingGasToken()).to.be.equal(WETH)
    })

    it('whitelists the requested relayers', async () => {
      for (const relayer of relayers) {
        expect(await wrapper.isRelayer(relayer)).to.be.true
      }
    })

    it('does not whitelist managers as relayers', async () => {
      for (const manager of managers) {
        expect(await wrapper.isRelayer(manager)).to.be.false
      }
    })

    it('can wrap WETH when passing the threshold', async () => {
      const bot = await impersonate(relayers[0], fp(100))
      const weth = await instanceAt('IERC20', WETH)
      const previousOwnerBalance = await weth.balanceOf(owner)
      const previousFeeCollectorBalance = await weth.balanceOf(feeCollector)

      await bot.sendTransaction({ to: wallet.address, value: fp(0.1) })
      await expect(wrapper.connect(bot).call()).to.be.revertedWith('MIN_THRESHOLD_NOT_MET')

      await bot.sendTransaction({ to: wallet.address, value: fp(0.5) })
      await wrapper.connect(bot).call()

      expect(await ethers.provider.getBalance(wallet.address)).to.be.equal(0)

      const currentFeeCollectorBalance = await weth.balanceOf(feeCollector)
      const relayedCost = currentFeeCollectorBalance.sub(previousFeeCollectorBalance)
      const currentOwnerBalance = await weth.balanceOf(owner)
      const expectedWrappedBalance = fp(0.6).sub(relayedCost)
      expect(currentOwnerBalance).to.be.equal(previousOwnerBalance.add(expectedWrappedBalance))
    })
  })
})
