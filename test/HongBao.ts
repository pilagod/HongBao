import { expect } from "chai"
import {
    BigNumber,
    BigNumberish,
    ContractTransaction,
    Signer,
    Wallet,
} from "ethers"
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

    /* Classic Campaign */

    describe("createCampaign", async () => {
        it("should not allow to create campaign when owner's token balance is not enough to cover all the awards", async () => {
            const ownerBalance = await token.balanceOf(operator.getAddress())

            const ownerBalanceNotEnough = () =>
                createCampaign(operator, {
                    token: token.address,
                    participantDrawCount: 0,
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
            const createExpiredCampaign = async () =>
                createCampaign(operator, {
                    token: token.address,
                    expiry: (await time.latest()) - 1,
                    participantDrawCount: 0,
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
                        token: token.address,
                        participantDrawCount: 0,
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

    describe("closeCampaign", () => {
        it("should not allow to close unexpired campaign", async () => {
            const campaignId = await createCampaign(operator, {
                token: token.address,
                expiry: (await time.latest()) + 60,
                participantDrawCount: 0,
                participants: [],
                awards: [],
            })

            const tx = hongBao.connect(operator).closeCampaign(campaignId)

            await expect(tx).to.be.reverted
        })

        it("should not allow other than owner to close the campaign", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                expiry: (await time.latest()) + 60,
                participantDrawCount: 0,
                participants,
                awards: [],
            })
            await time.increase(600)

            await expect(
                hongBao.connect(participants[0]).closeCampaign(campaignId),
            ).to.be.reverted
        })

        it("should collect remaining amount back and delete the campaign", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                expiry: (await time.latest()) + 60,
                participantDrawCount: 1,
                participants,
                awards,
            })
            const {
                logs: [award],
            } = await draw(campaignId, participants)

            await time.increase(600)

            const balanceBefore = await token.balanceOf(operator.getAddress())
            await hongBao.connect(operator).closeCampaign(campaignId)
            const balanceAfter = await token.balanceOf(operator.getAddress())

            expect(balanceAfter.sub(balanceBefore)).to.equal(
                totalAwardAmount.sub(award.amount),
            )
            await expect(hongBao.getCampaignInfo(campaignId)).to.be.reverted
        })
    })

    describe("draw", () => {
        it("should not allow participant to draw more than his limit", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                participantDrawCount: 2,
                participants,
                awards,
            })

            await draw(campaignId, participants, 2)

            await expect(draw(campaignId, participants)).to.be.reverted
        })

        it("should not allow to draw expired campaign", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                expiry: (await time.latest()) + 60,
                participantDrawCount: 1,
                participants,
                awards,
            })
            await time.increase(600)

            await expect(draw(campaignId, participants)).to.be.reverted
        })

        it("should be able to draw all the awards when participants is more than awards", async () => {
            const participants = await createParticipants(5)
            const participantDrawCount = 2

            const campaignId = await createCampaign(operator, {
                token: token.address,
                participantDrawCount,
                participants,
                awards,
            })

            const result = await draw(
                campaignId,
                participants,
                participantDrawCount,
            )
            expect(result.count.won).to.equal(totalAwardCount)
            expect(result.count.lost).to.equal(
                participants.length * participantDrawCount - totalAwardCount,
            )

            const totalDrawAmount = await getTotalBalance(token, participants)
            expect(totalDrawAmount).to.equal(totalAwardAmount)
        })

        it("should let every participant draw award when participants is less than awards", async () => {
            const participants = await createParticipants(2)
            const participantDrawCount = 2

            const campaignId = await createCampaign(operator, {
                token: token.address,
                participantDrawCount,
                participants,
                awards,
            })

            const result = await draw(
                campaignId,
                participants,
                participantDrawCount,
            )
            expect(result.count.won).to.equal(
                participants.length * participantDrawCount,
            )
            expect(result.count.lost).to.equal(0)

            const totalDrawAmount = await getTotalBalance(token, participants)
            expect(totalDrawAmount).to.be.lt(totalAwardAmount)
        })
    })

    describe("getCampaignInfo", () => {
        it("should get campaign info", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                participantDrawCount: 1,
                participants,
                awards,
            })
            // Since awards are more than participants, every draw must win an award.
            const {
                logs: [award],
            } = await draw(campaignId, participants)

            const campaign = await hongBao.getCampaignInfo(campaignId)
            expect(campaign.id).to.equal(campaignId)
            expect(campaign.name).to.equal("Test")
            expect(campaign.token).to.equal(token.address)
            expect(campaign.remainingAwardAmount).to.equal(
                totalAwardAmount.sub(award.amount),
            )
            for (let i = 0; i < awards.length; i++) {
                if (awards[i].name === award.name) {
                    expect(campaign.remainingAwards[i].count).to.equal(
                        awards[i].count - 1,
                    )
                }
            }
        })
    })

    describe("getRemainingDrawCount", () => {
        it("should return sender's remaining draw count", async () => {
            const participants = await createParticipants(2)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                participantDrawCount: 2,
                participants,
                awards,
            })

            await draw(campaignId, [participants[0]])

            // Participant 1 should have 1 draw count left
            {
                const drawCount = await hongBao
                    .connect(participants[0])
                    .getRemainingDrawCount(campaignId)
                expect(drawCount).to.equal(1)
            }

            // Participant 2 should have 2 draw count left
            {
                const drawCount = await hongBao
                    .connect(participants[1])
                    .getRemainingDrawCount(campaignId)
                expect(drawCount).to.equal(2)
            }

            // Other than participants should have no draw count
            {
                const drawCount = await hongBao
                    .connect(operator)
                    .getRemainingDrawCount(campaignId)
                expect(drawCount).to.equal(0)
            }
        })
    })

    /* Snatch Campaign */

    describe("snatch", async () => {
        it("should not be able to snatch when campaign balance is less than min snatch amount", async () => {
            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount: ethers.utils.parseEther("1"),
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("20"),
            })
            const participants = await createParticipants(1)

            const snatchWhenBalanceNotEnough = () =>
                snatch(campaignId, participants)

            await expect(snatchWhenBalanceNotEnough()).to.be.reverted
        })

        it("should not allow participant to snatch more than his limit", async () => {
            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount: ethers.utils.parseEther("200"),
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("20"),
            })

            const participants = await createParticipants(1)

            await snatch(campaignId, participants)

            await expect(snatch(campaignId, participants)).to.be.reverted
        })

        it("should snatch remaining amount when snatch amount is more than campaign remaining balance", async () => {
            const amount = ethers.utils.parseEther("10")

            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount,
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("20"),
            })
            const participants = await createParticipants(1)

            await snatch(campaignId, participants)

            const totalSnatchAmount = await getTotalBalance(token, participants)
            expect(totalSnatchAmount).to.equal(amount)
        })

        it("should be able to snatch when campaign has enough balance", async () => {
            const amount = ethers.utils.parseEther("200")
            const minSnatchAmount = ethers.utils.parseEther("10")
            const maxSnatchAmount = ethers.utils.parseEther("20")

            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount,
                minSnatchAmount,
                maxSnatchAmount,
            })
            const participants = await createParticipants(10)

            await snatch(campaignId, participants)

            for (const p of participants) {
                const balance = await token.balanceOf(p.getAddress())
                const result =
                    balance.eq(0) ||
                    (balance.gte(minSnatchAmount) &&
                        balance.lte(maxSnatchAmount))
                expect(result).to.be.true
            }
            const { remainingAmount } = await hongBao.getSnatchCampaignInfo(
                campaignId,
            )
            const totalSnatchAmount = await getTotalBalance(token, participants)
            expect(totalSnatchAmount.add(remainingAmount)).to.equal(amount)
        })
    })

    /* utils */

    async function createCampaign(
        owner: Signer,
        args: {
            name?: string
            token: string
            expiry?: number
            participantDrawCount: number
            participants: Signer[]
            awards: IHongBao.AwardStruct[]
        },
        overrides?: PayableOverrides,
    ): Promise<BigNumber> {
        const createCampaignTx = await hongBao.connect(owner).createCampaign(
            args.name || "Test",
            args.token,
            args.expiry || Date.now(),
            args.participantDrawCount,
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

    async function createSnatchCampaign(
        owner: Signer,
        args: {
            name?: string
            token: string
            amount: BigNumberish
            expiry?: number
            minSnatchAmount: BigNumberish
            maxSnatchAmount: BigNumberish
        },
        overrides?: PayableOverrides,
    ): Promise<BigNumber> {
        const createSnatchCampaignTx = await hongBao
            .connect(owner)
            .createSnatchCampaign(
                args.name || "Test",
                args.token,
                args.amount,
                args.expiry || Date.now(),
                args.minSnatchAmount,
                args.maxSnatchAmount,
                overrides ?? {},
            )
        const createSnatchCampaignReceipt = await createSnatchCampaignTx.wait()
        const [
            {
                args: { campaignId },
            },
        ] = ContractUtil.parseEventLogsByName(
            hongBao,
            "CampaignCreated",
            createSnatchCampaignReceipt.logs,
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

    async function draw(
        campaignId: BigNumberish,
        participants: Signer[],
        round: number = 1,
    ) {
        const result = {
            count: {
                won: 0,
                lost: 0,
            },
            logs: [] as {
                name: string
                amount: BigNumber
            }[],
        }

        for (let i = 0; i < round; i++) {
            for (const p of participants) {
                const drawTx = await hongBao.connect(p).draw(campaignId)
                const drawReceipt = await drawTx.wait()

                const wonLogs = ContractUtil.parseEventLogsByName(
                    hongBao,
                    "HongBaoWon",
                    drawReceipt.logs,
                )
                result.count.won += wonLogs.length
                result.logs.push(
                    ...wonLogs.map((l) => ({
                        name: l.args.name,
                        amount: l.args.amount,
                    })),
                )

                const lostLogs = ContractUtil.parseEventLogsByName(
                    hongBao,
                    "HongBaoLost",
                    drawReceipt.logs,
                )
                result.count.lost += lostLogs.length
                result.logs.push(
                    ...lostLogs.map(() => ({
                        name: "",
                        amount: BigNumber.from(0),
                    })),
                )
            }
        }

        return result
    }

    async function snatch(campaignId: BigNumberish, participants: Signer[]) {
        const results: BigNumber[] = []

        for (const p of participants) {
            // let snatchTx: ContractTransaction
            // try {
            //     snatchTx = await hongBao.connect(p).snatch(campaignId)
            // } catch (e) {
            //     results.push(BigNumber.from(0))
            //     continue
            // }
            const snatchTx = await hongBao.connect(p).snatch(campaignId)
            const snatchReceipt = await snatchTx.wait()
            const [
                {
                    args: { amount },
                },
            ] = ContractUtil.parseEventLogsByName(
                hongBao,
                "HongBaoSnatched",
                snatchReceipt.logs,
            )
            results.push(amount)
        }

        return results
    }

    async function getTotalBalance(
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
