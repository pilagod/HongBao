import { ethers } from "hardhat"
import { run } from "./utils"

async function main() {
    const [operator] = await ethers.getSigners()

    const erc20Factory = await ethers.getContractFactory("ERC20Mintable")
    const hongBaoToken = await erc20Factory
        .connect(operator)
        .deploy("HongBao Token", "HBT")
    await hongBaoToken.deployed()

    console.log(
        `HongBao token is successfully deployed at ${hongBaoToken.address}`,
    )
}

run(main)
