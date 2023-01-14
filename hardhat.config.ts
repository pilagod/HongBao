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
            polygon: process.env.POLYGONSCAN_API_KEY,
            polygonMumbai: process.env.POLYGONSCAN_API_KEY,
        },
    },
}
