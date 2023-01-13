import { expect } from "chai"
import { BigNumber, Signer, Wallet } from "ethers"
import { ethers } from "hardhat"
import {
    SnapshotRestorer,
    setBalance,
    takeSnapshot,
} from "@nomicfoundation/hardhat-network-helpers"
import { ERC20Mintable, HongBao } from "~/typechain-types"
import { ContractUtil } from "~/util"

describe("HongBao", () => {
    let snapshot: SnapshotRestorer

    let operator: Signer
    let hongBao: HongBao
    let token: ERC20Mintable

    before(async () => {
        ;[operator] = await ethers.getSigners()

        const hongBaoFactory = await ethers.getContractFactory("HongBao")
        hongBao = await hongBaoFactory.connect(operator).deploy()

        const erc20Factory = await ethers.getContractFactory("ERC20Mintable")
        token = await erc20Factory.connect(operator).deploy("TKN", "TKN")

        await token
            .connect(operator)
            .approve(hongBao.address, ethers.constants.MaxUint256)
        await token
            .connect(operator)
            .mint(operator.getAddress(), ethers.utils.parseEther("10000"))

        snapshot = await takeSnapshot()
    })

    beforeEach(async () => {
        await snapshot.restore()
    })

    it("should be able to draw all the awards", async () => {
        const awards = [
            {
                name: "First Prize",
                count: 1,
                amount: ethers.utils.parseEther("100"),
            },
            {
                name: "Second Prize",
                count: 2,
                amount: ethers.utils.parseEther("10"),
            },
            {
                name: "Third Prize",
                count: 3,
                amount: ethers.utils.parseEther("1"),
            },
        ]
        const participants = await createParticipants(10)

        const createCampaignTx = await hongBao.connect(operator).createCampaign(
            "Test",
            token.address,
            Date.now(),
            participants.map((p) => p.getAddress()),
            awards,
        )
        const createCampaignReceipt = await createCampaignTx.wait()
        const [
            {
                args: { campaignId },
            },
        ] = ContractUtil.parseEventLogsByName(
            hongBao,
            "CampaignCreated",
            createCampaignReceipt.logs,
        )

        const drawResult = {
            wonCount: 0,
            lostCount: 0,
        }
        for (const p of participants) {
            const drawTx = await hongBao.connect(p).draw(campaignId)
            const drawReceipt = await drawTx.wait()
            drawResult.wonCount += ContractUtil.parseEventLogsByName(
                hongBao,
                "HongBaoWon",
                drawReceipt.logs,
            ).length
            drawResult.lostCount += ContractUtil.parseEventLogsByName(
                hongBao,
                "HongBaoLost",
                drawReceipt.logs,
            ).length
        }
        expect(drawResult.wonCount).to.equal(6)
        expect(drawResult.lostCount).to.equal(4)

        let totalDrawAmount = BigNumber.from(0)
        for (const p of participants) {
            const balance = await token.balanceOf(p.getAddress())
            totalDrawAmount = totalDrawAmount.add(balance)
        }
        const totalAwardAmount = awards.reduce(
            (r, a) => r.add(a.amount.mul(a.count)),
            BigNumber.from(0),
        )
        expect(totalDrawAmount).to.equal(totalAwardAmount)
    })

    async function createParticipants(count: number): Promise<Signer[]> {
        const participants: Signer[] = []

        for (let i = 0; i < count; i++) {
            const participant = Wallet.createRandom().connect(ethers.provider)
            await setBalance(
                participant.address,
                ethers.utils.parseEther("100"),
            )
            participants.push(participant)
        }

        return participants
    }
})
