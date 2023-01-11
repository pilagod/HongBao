import "dotenv/config"
import "tsconfig-paths/register"

import "hardhat-gas-reporter"
import "@nomiclabs/hardhat-ethers"
import "@nomicfoundation/hardhat-chai-matchers"
import "@typechain/hardhat"

import chai from "chai"
import chaiAsPromised from "chai-as-promised"
chai.use(chaiAsPromised)

module.exports = {
    networks: {
        hardhat: {
            chainId: parseInt(process.env.CHAIN_ID ?? "0", 10),
            forking: {
                url: process.env.FORK_NODE_RPC_URL ?? "",
                blockNumber: parseInt(process.env.FORK_BLOCK_NUMBER ?? "0", 10),
            },
        },
    },
    solidity: {
        compilers: [
            {
                version: "0.7.6",
                settings: {
                    optimizer: {
                        enabled: true,
                    },
                },
            },
        ],
    },
    mocha: {
        timeout: 60000,
    },
}
