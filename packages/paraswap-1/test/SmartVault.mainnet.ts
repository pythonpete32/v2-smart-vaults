import {
  bn,
  fp,
  getForkedNetwork,
  getSigner,
  impersonate,
  instanceAt,
  MONTH,
  NATIVE_TOKEN_ADDRESS,
  ZERO_ADDRESS,
} from '@mimic-fi/v2-helpers'
import { assertPermissions, deployment } from '@mimic-fi/v2-smart-vaults-base'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import hre, { ethers } from 'hardhat'
import path from 'path'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const WHALE = '0x075e72a5edf65f0a5f44699c7654c1a76941ddc8'

describe('SmartVault', () => {
  let smartVault: Contract, wallet: Contract, mimic: { [key: string]: string }
  let withdrawer: Contract, erc20Claimer: Contract, nativeClaimer: Contract, feeClaimer: Contract
  let owner: string, swapSigner: string, relayers: string[], managers: string[], feeCollector: string

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
    swapSigner = input.accounts.swapSigner
    feeCollector = input.accounts.feeCollector
    feeClaimer = await instanceAt('IFeeClaimer', input.accounts.feeClaimer)
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
    input.params.smartVaultParams.walletParams.swapConnector = mimic.SwapConnector
    await script(input, deployment.writeOutput('test'))
    const output = deployment.readOutput('test')

    wallet = await instanceAt('Wallet', output.Wallet)
    smartVault = await instanceAt('SmartVault', output.SmartVault)
    withdrawer = await instanceAt('Withdrawer', output.Withdrawer)
    erc20Claimer = await instanceAt('ERC20Claimer', output.ERC20Claimer)
    nativeClaimer = await instanceAt('NativeClaimer', output.NativeClaimer)
  })

  describe('smart vault', () => {
    it('has set its permissions correctly', async () => {
      await assertPermissions(smartVault, [
        { name: 'owner', account: owner, roles: ['authorize', 'unauthorize', 'setWallet', 'setAction'] },
        { name: 'withdrawer', account: withdrawer, roles: [] },
        { name: 'erc20Claimer', account: erc20Claimer, roles: [] },
        { name: 'nativeClaimer', account: nativeClaimer, roles: [] },
        { name: 'managers', account: managers, roles: [] },
        { name: 'relayers', account: relayers, roles: [] },
      ])
    })

    it('whitelists the actions', async () => {
      expect(await smartVault.isActionWhitelisted(erc20Claimer.address)).to.be.true
      expect(await smartVault.isActionWhitelisted(nativeClaimer.address)).to.be.true
    })
  })

  describe('wallet', () => {
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
        { name: 'feeCollector', account: feeCollector, roles: ['setFeeCollector'] },
        { name: 'withdrawer', account: withdrawer, roles: ['withdraw'] },
        { name: 'erc20Claimer', account: erc20Claimer, roles: ['call', 'swap', 'withdraw'] },
        { name: 'nativeClaimer', account: nativeClaimer, roles: ['call', 'wrap', 'withdraw'] },
        { name: 'managers', account: managers, roles: [] },
        { name: 'relayers', account: relayers, roles: [] },
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

    it('sets a swap connector', async () => {
      expect(await wallet.swapConnector()).to.be.equal(mimic.SwapConnector)
    })

    it('sets a price feed for WETH-USDC', async () => {
      expect(await wallet.getPriceFeed(USDC, WETH)).not.to.be.equal(ZERO_ADDRESS)
      expect(await wallet.getPrice(WETH, USDC)).to.be.gt(bn(1300e6))
    })
  })

  describe('withdrawer', () => {
    it('has set its permissions correctly', async () => {
      await assertPermissions(withdrawer, [
        {
          name: 'owner',
          account: owner,
          roles: [
            'authorize',
            'unauthorize',
            'setWallet',
            'setLimits',
            'setRelayer',
            'setTimeLock',
            'setRecipient',
            'call',
          ],
        },
        { name: 'withdrawer', account: withdrawer, roles: [] },
        { name: 'erc20Claimer', account: erc20Claimer, roles: [] },
        { name: 'nativeClaimer', account: nativeClaimer, roles: [] },
        { name: 'managers', account: managers, roles: ['call'] },
        { name: 'relayers', account: relayers, roles: ['call'] },
      ])
    })

    it('has the proper wallet set', async () => {
      expect(await withdrawer.wallet()).to.be.equal(wallet.address)
    })

    it('sets the owner as the recipient', async () => {
      expect(await withdrawer.recipient()).to.be.equal(owner)
    })

    it('sets the expected time-lock', async () => {
      expect(await withdrawer.period()).to.be.equal(MONTH)
      expect(await withdrawer.nextResetTime()).not.to.be.eq(0)
    })

    it('sets the expected gas limits', async () => {
      expect(await withdrawer.gasPriceLimit()).to.be.equal(bn(100e9))
      expect(await withdrawer.totalCostLimit()).to.be.equal(0)
      expect(await withdrawer.payingGasToken()).to.be.equal(WETH)
    })

    it('whitelists the requested relayers', async () => {
      for (const relayer of relayers) {
        expect(await withdrawer.isRelayer(relayer)).to.be.true
      }
    })

    it('does not whitelist managers as relayers', async () => {
      for (const manager of managers) {
        expect(await withdrawer.isRelayer(manager)).to.be.false
      }
    })
  })

  describe('erc20 claimer', () => {
    it('has set its permissions correctly', async () => {
      await assertPermissions(erc20Claimer, [
        {
          name: 'owner',
          account: owner,
          roles: [
            'authorize',
            'unauthorize',
            'setWallet',
            'setLimits',
            'setRelayer',
            'setSwapSigner',
            'setFeeClaimer',
            'setThreshold',
            'call',
          ],
        },
        { name: 'withdrawer', account: withdrawer, roles: [] },
        { name: 'erc20Claimer', account: erc20Claimer, roles: [] },
        { name: 'nativeClaimer', account: nativeClaimer, roles: [] },
        { name: 'managers', account: managers, roles: ['call'] },
        { name: 'relayers', account: relayers, roles: ['call'] },
      ])
    })

    it('has the proper wallet set', async () => {
      expect(await erc20Claimer.wallet()).to.be.equal(wallet.address)
    })

    it('sets the expected fee claimer params', async () => {
      expect(await erc20Claimer.swapSigner()).to.be.equal(swapSigner)
      expect(await erc20Claimer.feeClaimer()).to.be.equal(feeClaimer.address)
    })

    it('sets the expected token threshold params', async () => {
      expect(await erc20Claimer.thresholdToken()).to.be.equal(USDC)
      expect(await erc20Claimer.thresholdAmount()).to.be.equal(bn(1000e6))
    })

    it('sets the expected gas limits', async () => {
      expect(await erc20Claimer.gasPriceLimit()).to.be.equal(bn(100e9))
      expect(await erc20Claimer.totalCostLimit()).to.be.equal(0)
      expect(await erc20Claimer.payingGasToken()).to.be.equal(WETH)
    })

    it('whitelists the requested relayers', async () => {
      for (const relayer of relayers) {
        expect(await erc20Claimer.isRelayer(relayer)).to.be.true
      }
    })

    it('does not whitelist managers as relayers', async () => {
      for (const manager of managers) {
        expect(await erc20Claimer.isRelayer(manager)).to.be.false
      }
    })

    describe('call', async () => {
      let bot: SignerWithAddress, usdc: Contract, weth: Contract

      before('load accounts', async () => {
        bot = await impersonate(relayers[0])
        usdc = await instanceAt('IERC20', USDC)
        weth = await instanceAt('IERC20', WETH)
      })

      it.skip('can claim a token amount when passing the threshold', async () => {
        const previousWalletBalance = await weth.balanceOf(wallet.address)
        const previousFeeCollectorBalance = await weth.balanceOf(feeCollector)

        const signer = await getSigner()
        await erc20Claimer.connect(await impersonate(owner)).setSwapSigner(signer.address)

        // TODO: Use Paraswap API
        const amountIn = bn(200e6)
        const minAmountOut = bn(0) // pick from API response
        const deadline = 0 // pick from API response
        const data = '0x' // pick from API response
        const signature = await signer.signMessage(
          ethers.utils.arrayify(
            ethers.utils.solidityKeccak256(
              ['address', 'address', 'bool', 'uint256', 'uint256', 'uint256', 'bytes'],
              [USDC, WETH, false, amountIn, minAmountOut, deadline, data]
            )
          )
        )

        const whale = await impersonate(WHALE, fp(100))
        await usdc.connect(whale).transfer(feeClaimer.address, amountIn)
        const augustusSwapper = await impersonate(await feeClaimer.augustusSwapper(), fp(10))
        await feeClaimer.connect(augustusSwapper).registerFee(wallet.address, USDC, fp(0.5))
        await erc20Claimer.connect(bot).call(USDC, amountIn, minAmountOut, deadline, data, signature)

        expect(await feeClaimer.getBalance(USDC, wallet.address)).to.be.equal(0)

        const currentFeeCollectorBalance = await weth.balanceOf(feeCollector)
        const relayedCost = currentFeeCollectorBalance.sub(previousFeeCollectorBalance)
        const currentWalletBalance = await weth.balanceOf(wallet.address)
        const expectedClaimedBalance = minAmountOut.sub(relayedCost)
        expect(currentWalletBalance).to.be.equal(previousWalletBalance.add(expectedClaimedBalance))
      })
    })
  })

  describe('native claimer', () => {
    it('has set its permissions correctly', async () => {
      await assertPermissions(nativeClaimer, [
        {
          name: 'owner',
          account: owner,
          roles: [
            'authorize',
            'unauthorize',
            'setWallet',
            'setLimits',
            'setRelayer',
            'setFeeClaimer',
            'setThreshold',
            'call',
          ],
        },
        { name: 'withdrawer', account: withdrawer, roles: [] },
        { name: 'erc20Claimer', account: erc20Claimer, roles: [] },
        { name: 'nativeClaimer', account: nativeClaimer, roles: [] },
        { name: 'managers', account: managers, roles: ['call'] },
        { name: 'relayers', account: relayers, roles: ['call'] },
      ])
    })

    it('has the proper wallet set', async () => {
      expect(await nativeClaimer.wallet()).to.be.equal(wallet.address)
    })

    it('sets the expected gas limits', async () => {
      expect(await nativeClaimer.gasPriceLimit()).to.be.equal(bn(100e9))
      expect(await nativeClaimer.totalCostLimit()).to.be.equal(0)
      expect(await nativeClaimer.payingGasToken()).to.be.equal(WETH)
    })

    it('sets the expected fee claimer params', async () => {
      expect(await nativeClaimer.feeClaimer()).to.be.equal(feeClaimer.address)
    })

    it('sets the expected token threshold params', async () => {
      expect(await nativeClaimer.thresholdToken()).to.be.equal(USDC)
      expect(await nativeClaimer.thresholdAmount()).to.be.equal(bn(1000e6))
    })

    it('whitelists the requested relayers', async () => {
      for (const relayer of relayers) {
        expect(await nativeClaimer.isRelayer(relayer)).to.be.true
      }
    })

    it('does not whitelist managers as relayers', async () => {
      for (const manager of managers) {
        expect(await nativeClaimer.isRelayer(manager)).to.be.false
      }
    })

    describe('call', async () => {
      let weth: Contract
      let bot: SignerWithAddress, augustusSwapper: SignerWithAddress

      before('load accounts', async () => {
        bot = await impersonate(relayers[0], fp(100))
        augustusSwapper = await impersonate(await feeClaimer.augustusSwapper(), fp(10))
      })

      before('load weth', async () => {
        weth = await instanceAt(
          '@mimic-fi/v2-wallet/artifacts/contracts/IWrappedNativeToken.sol/IWrappedNativeToken',
          WETH
        )
      })

      it('can claim ETH when passing the threshold', async () => {
        const previousWalletBalance = await weth.balanceOf(wallet.address)
        const previousFeeCollectorBalance = await weth.balanceOf(feeCollector)

        await bot.sendTransaction({ to: feeClaimer.address, value: fp(0.5) })
        await feeClaimer.connect(augustusSwapper).registerFee(wallet.address, NATIVE_TOKEN_ADDRESS, fp(0.5))
        await expect(nativeClaimer.connect(bot).call(NATIVE_TOKEN_ADDRESS)).to.be.revertedWith('MIN_THRESHOLD_NOT_MET')

        await bot.sendTransaction({ to: feeClaimer.address, value: fp(0.5) })
        await feeClaimer.connect(augustusSwapper).registerFee(wallet.address, NATIVE_TOKEN_ADDRESS, fp(0.5))
        await nativeClaimer.connect(bot).call(NATIVE_TOKEN_ADDRESS)

        expect(await feeClaimer.getBalance(NATIVE_TOKEN_ADDRESS, wallet.address)).to.be.equal(0)

        const currentFeeCollectorBalance = await weth.balanceOf(feeCollector)
        const relayedCost = currentFeeCollectorBalance.sub(previousFeeCollectorBalance)
        const currentWalletBalance = await weth.balanceOf(wallet.address)
        const expectedWrappedBalance = fp(1).sub(relayedCost)
        expect(currentWalletBalance).to.be.equal(previousWalletBalance.add(expectedWrappedBalance))
      })

      it('can claim WETH when passing the threshold', async () => {
        const previousWalletBalance = await weth.balanceOf(wallet.address)
        const previousFeeCollectorBalance = await weth.balanceOf(feeCollector)

        await weth.connect(bot).deposit({ value: fp(0.5) })
        await weth.connect(bot).transfer(feeClaimer.address, fp(0.5))
        await feeClaimer.connect(augustusSwapper).registerFee(wallet.address, WETH, fp(0.5))
        await expect(nativeClaimer.connect(bot).call(WETH)).to.be.revertedWith('MIN_THRESHOLD_NOT_MET')

        await weth.connect(bot).deposit({ value: fp(0.5) })
        await weth.connect(bot).transfer(feeClaimer.address, fp(0.5))
        await feeClaimer.connect(augustusSwapper).registerFee(wallet.address, WETH, fp(0.5))
        await nativeClaimer.connect(bot).call(WETH)

        expect(await feeClaimer.getBalance(WETH, wallet.address)).to.be.equal(0)

        const currentFeeCollectorBalance = await weth.balanceOf(feeCollector)
        const relayedCost = currentFeeCollectorBalance.sub(previousFeeCollectorBalance)
        const currentWalletBalance = await weth.balanceOf(wallet.address)
        const expectedWrappedBalance = fp(1).sub(relayedCost)
        expect(currentWalletBalance).to.be.equal(previousWalletBalance.add(expectedWrappedBalance))
      })
    })
  })
})
