import { ethers } from "hardhat"
import { run } from "./utils"

async function main() {
    const [operator] = await ethers.getSigners()

    const hongBaoFactory = await ethers.getContractFactory("HongBao")
    const hongBao = await hongBaoFactory.connect(operator).deploy()
    await hongBao.deployed()

    console.log(
        `HongBao contract is successfully deployed at ${hongBao.address}`,
    )
}

run(main)
