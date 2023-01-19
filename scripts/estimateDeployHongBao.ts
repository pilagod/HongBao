import { ethers } from "hardhat"
import { run } from "./utils"

async function main() {
    const hongBaoFactory = await ethers.getContractFactory("HongBao")
    const data = hongBaoFactory.getDeployTransaction().data

    const gas = await ethers.provider.estimateGas({ data })
    console.log(`Gas: ${gas}`)

    const gasPrice = await ethers.provider.getGasPrice()
    console.log(`Gas price: ${gasPrice}`)

    const gasFee = ethers.utils.formatEther(gas.mul(gasPrice))
    console.log(`Gas fee: ${gasFee} ETH`)
}

run(main)
