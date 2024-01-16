import "dotenv/config"
import "tsconfig-paths/register"

import "hardhat-gas-reporter"
import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-etherscan"
import "@nomicfoundation/hardhat-chai-matchers"
import "@typechain/hardhat"

import chai from "chai"
import chaiAsPromised from "chai-as-promised"
chai.use(chaiAsPromised)

const accounts = [process.env.OPERATOR_PRIVATE_KEY]

module.exports = {
    networks: {
        arbitrum: {
            chainId: 42161,
            url: "https://arb1.arbitrum.io/rpc",
            accounts,
        },
        arbitrumSepolia: {
            chainId: 421614,
            url: "https://sepolia-rollup.arbitrum.io/rpc",
            accounts,
        },
        arbitrumGoerli: {
            chainId: 421613,
            url: "https://goerli-rollup.arbitrum.io/rpc",
            accounts,
        },
        polygon: {
            chainId: 137,
            url: "https://polygon-rpc.com/",
            accounts,
        },
        polygonMumbai: {
            chainId: 80001,
            url: "https://rpc-mumbai.maticvigil.com/",
            accounts,
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
    etherscan: {
        apiKey: {
            arbitrumOne: process.env.ARBISCAN_API_KEY,
            arbitrumSepolia: process.env.ARBISCAN_API_KEY,
            arbitrumGoerli: process.env.ARBISCAN_API_KEY,
            polygon: process.env.POLYGONSCAN_API_KEY,
            polygonMumbai: process.env.POLYGONSCAN_API_KEY,
        },
        customChains: [
            {
                network: "arbitrumSepolia",
                chainId: 421614,
                urls: {
                    apiURL: "https://api-sepolia.arbiscan.io/api",
                    browserURL: "https://sepolia.arbiscan.io/",
                },
            },
        ],
    },
}
