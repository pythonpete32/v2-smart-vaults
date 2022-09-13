// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.0;

import '@mimic-fi/v2-wallet/contracts/IWallet.sol';
import '@mimic-fi/v2-helpers/contracts/utils/Arrays.sol';
import '@mimic-fi/v2-price-oracle/contracts/IPriceOracle.sol';
import '@mimic-fi/v2-registry/contracts/registry/IRegistry.sol';
import '@mimic-fi/v2-smart-vaults-base/contracts/BaseDeployer.sol';
import '@mimic-fi/v2-smart-vaults-base/contracts/actions/IAction.sol';

import './actions/Wrapper.sol';

// solhint-disable avoid-low-level-calls

contract SmartVaultDeployer is BaseDeployer {
    struct Params {
        address owner;
        address[] managers;
        IRegistry registry;
        WalletParams walletParams;
        PriceOracleParams priceOracleParams;
        RelayedActionParams relayedActionParams;
        SmartVaultParams smartVaultParams;
    }

    function deploy(Params memory params) external {
        PriceOracle priceOracle = _createPriceOracle(params.registry, params.priceOracleParams, true);
        Wallet wallet = _createWallet(params.registry, params.walletParams, NO_STRATEGY, address(priceOracle), false);
        IAction action = _setupAction(wallet, params);
        _transferAdminPermissions(wallet, params.walletParams.admin);
        _createSmartVault(params.registry, params.smartVaultParams, address(wallet), _actions(action), true);
    }

    function _setupAction(Wallet wallet, Params memory params) internal returns (IAction) {
        // Create and setup action
        Wrapper wrapper = new Wrapper(address(this), wallet);
        address[] memory executors = Arrays.from(params.owner, params.managers, params.relayedActionParams.relayers);
        _setupActionExecutors(wrapper, executors, wrapper.call.selector);
        _setupRelayedAction(wrapper, params.owner, params.relayedActionParams);
        _setupWithdrawalAction(wrapper, params.owner, params.owner);
        _transferAdminPermissions(wrapper, params.owner);

        // Authorize action to wrap and withdraw from wallet
        wallet.authorize(address(wrapper), wallet.wrap.selector);
        wallet.authorize(address(wrapper), wallet.withdraw.selector);
        return wrapper;
    }
}
