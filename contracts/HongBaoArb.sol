// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./interfaces/ArbSys.sol";
import "./HongBao.sol";

contract HongBaoArb is HongBao {
    function getBlockNumber() internal view override returns (uint256) {
        // https://docs.arbitrum.io/for-devs/dev-tools-and-resources/precompiles#common-precompiles
        // https://docs.arbitrum.io/for-devs/concepts/differences-between-arbitrum-ethereum/block-numbers-and-time#arbitrum-block-numbers
        return ArbSys(address(0x64)).arbBlockNumber();
    }
}
