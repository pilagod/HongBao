import { expect } from "chai"
import { BigNumber, BigNumberish, Signer, Wallet } from "ethers"
import { ethers } from "hardhat"
import { PayableOverrides } from "@ethersproject/contracts"
import {
    SnapshotRestorer,
    setBalance,
    takeSnapshot,
    time,
} from "@nomicfoundation/hardhat-network-helpers"
import { ERC20Mintable, HongBao, IERC20, IHongBao } from "~/typechain-types"
import { ContractUtil } from "~/util"

describe("HongBao", () => {
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
    const totalAwardAmount = awards.reduce(
        (r, a) => r.add(a.amount.mul(a.count)),
        BigNumber.from(0),
    )
    const totalAwardCount = awards.reduce((r, a) => r + a.count, 0)

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

    describe("createCampaign", async () => {
        it("should not allow to create campaign when token balance is not enough to cover all the awards", async () => {
            const ownerBalance = await token.balanceOf(operator.getAddress())

            const ownerBalanceNotEnough = () =>
                createCampaign(operator, {
                    name: "Test",
                    token: token.address,
                    expiry: Date.now(),
                    participants: [],
                    awards: [
                        {
                            name: "Prize",
                            count: 100,
                            amount: ownerBalance,
                        },
                    ],
                })

            await expect(ownerBalanceNotEnough()).to.be.reverted
        })

        it("should not allow to create campaign which is already expired", async () => {
            const currentTimestamp = await time.latest()

            const createExpiredCampaign = () =>
                createCampaign(operator, {
                    name: "Test",
                    token: token.address,
                    expiry: currentTimestamp - 1,
                    participants: [],
                    awards: [],
                })

            await expect(createExpiredCampaign()).to.be.reverted
        })

        it("should not allow to create campaign when fee is not enough", async () => {
            await hongBao.setCreateCampaignFee(ethers.utils.parseEther("100"))

            const createCampaignFeeNotEnough = () =>
                createCampaign(
                    operator,
                    {
                        name: "Test",
                        token: token.address,
                        expiry: Date.now(),
                        participants: [],
                        awards: [],
                    },
                    {
                        value: ethers.utils.parseEther("1"),
                    },
                )

            await expect(createCampaignFeeNotEnough()).to.be.reverted
        })
    })

    describe("draw", () => {
        it("should allow participant to draw only once", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                name: "Test",
                token: token.address,
                expiry: Date.now(),
                participants,
                awards,
            })

            await draw(campaignId, participants)

            await expect(draw(campaignId, participants)).to.be.reverted
        })

        it("should not allow to draw expired campaign", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                name: "Test",
                token: token.address,
                expiry: (await time.latest()) + 60,
                participants,
                awards,
            })
            await time.increase(120)

            await expect(draw(campaignId, participants)).to.be.reverted
        })

        it("should be able to draw all the awards when participants is more than awards", async () => {
            const participants = await createParticipants(10)

            const campaignId = await createCampaign(operator, {
                name: "Test",
                token: token.address,
                expiry: Date.now(),
                participants,
                awards,
            })

            const drawResult = await draw(campaignId, participants)
            expect(drawResult.wonCount).to.equal(totalAwardCount)
            expect(drawResult.lostCount).to.equal(
                participants.length - totalAwardCount,
            )

            const totalDrawAmount = await getTotalDrawAmount(
                token,
                participants,
            )
            expect(totalDrawAmount).to.equal(totalAwardAmount)
        })

        it("should let every participant draw award when participants is less than awards", async () => {
            const participants = await createParticipants(5)

            const campaignId = await createCampaign(operator, {
                name: "Test",
                token: token.address,
                expiry: Date.now(),
                participants,
                awards,
            })

            const drawResult = await draw(campaignId, participants)
            expect(drawResult.wonCount).to.equal(participants.length)
            expect(drawResult.lostCount).to.equal(0)

            const totalDrawAmount = await getTotalDrawAmount(
                token,
                participants,
            )
            expect(totalDrawAmount).to.be.lt(totalAwardAmount)
        })
    })

    /* utils */

    async function createCampaign(
        owner: Signer,
        args: {
            name: string
            token: string
            expiry: number
            participants: Signer[]
            awards: IHongBao.AwardStruct[]
        },
        overrides?: PayableOverrides,
    ): Promise<BigNumber> {
        const createCampaignTx = await hongBao.connect(owner).createCampaign(
            args.name,
            args.token,
            args.expiry,
            args.participants.map((p) => p.getAddress()),
            args.awards,
            overrides ?? {},
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

        return campaignId
    }

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

    async function draw(campaignId: BigNumberish, participants: Signer[]) {
        const result = {
            wonCount: 0,
            lostCount: 0,
        }

        for (const p of participants) {
            const drawTx = await hongBao.connect(p).draw(campaignId)
            const drawReceipt = await drawTx.wait()
            result.wonCount += ContractUtil.parseEventLogsByName(
                hongBao,
                "HongBaoWon",
                drawReceipt.logs,
            ).length
            result.lostCount += ContractUtil.parseEventLogsByName(
                hongBao,
                "HongBaoLost",
                drawReceipt.logs,
            ).length
        }

        return result
    }

    async function getTotalDrawAmount(
        token: IERC20,
        participants: Signer[],
    ): Promise<BigNumber> {
        let totalDrawAmount = BigNumber.from(0)

        for (const p of participants) {
            const balance = await token.balanceOf(p.getAddress())
            totalDrawAmount = totalDrawAmount.add(balance)
        }

        return totalDrawAmount
    }
})
