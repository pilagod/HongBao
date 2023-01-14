import { ethers } from "hardhat"

async function main() {
    const [operator] = await ethers.getSigners()

    const hongBaoFactory = await ethers.getContractFactory("HongBao")
    const hongBao = await hongBaoFactory.connect(operator).deploy()
    await hongBao.deployed()

    console.log(
        `HongBao contract is successfully deployed at ${hongBao.address}`,
    )
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
