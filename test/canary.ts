import { expect } from "chai"
import { ethers } from "hardhat"

describe("Canary test", () => {
    it("should pass this canary test", () => {
        expect(true).to.be.true
    })

    it("should be able to deploy and call contract", async () => {
        const [deployer] = await ethers.getSigners()

        const greeterFactory = await ethers.getContractFactory("Greeter")
        const greeter = await greeterFactory.connect(deployer).deploy()

        const result = await greeter.greet()
        expect(result).to.equal("hello")
    })
})
