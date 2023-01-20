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
    let snapshot: SnapshotRestorer

    let operator: Signer
    let other: Signer

    let hongBao: HongBao
    let token: ERC20Mintable

    before(async () => {
        ;[operator, other] = await ethers.getSigners()

        const hongBaoFactory = await ethers.getContractFactory("HongBao")
        hongBao = await hongBaoFactory.connect(operator).deploy()

        const erc20Factory = await ethers.getContractFactory("ERC20Mintable")
        token = await erc20Factory.connect(operator).deploy("TKN", "TKN")

        for (const signer of [operator, other]) {
            await token
                .connect(signer)
                .approve(hongBao.address, ethers.constants.MaxUint256)
            await token
                .connect(operator)
                .mint(signer.getAddress(), ethers.utils.parseEther("10000"))
        }

        snapshot = await takeSnapshot()
    })

    beforeEach(async () => {
        await snapshot.restore()
    })

    describe("getCampaignType", () => {
        it("should revert when campaign doesn't exist", async () => {
            await expect(hongBao.getCampaignType(123)).to.be.reverted
        })

        it("should be able to distinguish classic campaign", async () => {
            const campaignId = await createCampaign(operator, {
                token: token.address,
                participants: [],
                awards: [],
            })

            const campaignType = await hongBao.getCampaignType(campaignId)

            expect(campaignType).to.equal(0)
        })

        it("should be able to distinguish snatch campaign", async () => {
            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount: ethers.utils.parseEther("200"),
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("20"),
            })

            const campaignType = await hongBao.getCampaignType(campaignId)

            expect(campaignType).to.equal(1)
        })
    })

    /* Classic Campaign */

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

    describe("createCampaign", async () => {
        it("should not allow to create campaign when fee is not enough", async () => {
            await hongBao.setCreateCampaignFee(ethers.utils.parseEther("100"))

            const createWithFeeNotEnough = () =>
                createCampaign(
                    operator,
                    {
                        token: token.address,
                        participants: [],
                        awards: [],
                    },
                    {
                        value: ethers.utils.parseEther("1"),
                    },
                )

            await expect(createWithFeeNotEnough()).to.be.reverted
        })

        it("should not allow to create campaign when owner's token balance is not enough to cover all the awards", async () => {
            const ownerBalance = await token.balanceOf(operator.getAddress())

            const ownerBalanceNotEnough = () =>
                createCampaign(operator, {
                    token: token.address,
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

        it("should not allow to create expired campaign", async () => {
            const createExpiredCampaign = async () =>
                createCampaign(operator, {
                    token: token.address,
                    expiry: (await time.latest()) - 1,
                    participants: [],
                    awards: [],
                })

            await expect(createExpiredCampaign()).to.be.reverted
        })
    })

    describe("closeCampaign", () => {
        it("should allow only owner to close the campaign", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                expiry: (await time.latest()) + 60,
                participants,
                awards: [],
            })
            await time.increase(600)

            const tx = hongBao
                .connect(participants[0])
                .closeCampaign(campaignId)
            await expect(tx).to.be.reverted
        })

        it("should not allow to close unexpired campaign", async () => {
            const campaignId = await createCampaign(operator, {
                token: token.address,
                expiry: (await time.latest()) + 60,
                participants: [],
                awards: [],
            })

            const tx = hongBao.connect(operator).closeCampaign(campaignId)
            await expect(tx).to.be.reverted
        })

        it("should collect remaining amount back to owner and delete the campaign", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                expiry: (await time.latest()) + 60,
                participants,
                awards,
            })
            const {
                logs: [award],
            } = await draw(campaignId, participants)

            await time.increase(600)

            const balanceBefore = await token.balanceOf(operator.getAddress())

            const tx = await hongBao.connect(operator).closeCampaign(campaignId)
            const receipt = await tx.wait()
            const [{ args }] = ContractUtil.parseEventLogsByName(
                hongBao,
                "CampaignClosed",
                receipt.logs,
            )
            expect(args.campaignId).to.equal(campaignId)

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

        it("should be able to handle hundred level participants", async () => {
            const awards = [
                {
                    name: "First",
                    count: 10,
                    amount: ethers.utils.parseEther("10"),
                },
                {
                    name: "Second",
                    count: 20,
                    amount: ethers.utils.parseEther("7"),
                },
                {
                    name: "Third",
                    count: 30,
                    amount: ethers.utils.parseEther("5"),
                },
                {
                    name: "Fourth",
                    count: 40,
                    amount: ethers.utils.parseEther("3"),
                },
                {
                    name: "Fifth",
                    count: 150,
                    amount: ethers.utils.parseEther("1"),
                },
            ]
            const participants = await createParticipants(250)

            const campaignId = await createCampaign(operator, {
                token: token.address,
                participants,
                awards,
            })

            await draw(campaignId, participants)

            const totalDrawAmount = await getTotalBalance(token, participants)
            expect(totalDrawAmount).to.equal(
                awards.reduce(
                    (r, a) => r.add(a.amount.mul(a.count)),
                    BigNumber.from(0),
                ),
            )
        })
    })

    describe("getCampaignInfo", () => {
        it("should get campaign info", async () => {
            const participants = await createParticipants(1)

            const campaignId = await createCampaign(operator, {
                token: token.address,
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

    describe("createSnatchCampaign", () => {
        it("should not allow to create campaign when fee is not enough", async () => {
            await hongBao.setCreateCampaignFee(ethers.utils.parseEther("100"))

            const createWithFeeNotEnough = () =>
                createSnatchCampaign(
                    operator,
                    {
                        token: token.address,
                        amount: ethers.utils.parseEther("200"),
                        minSnatchAmount: ethers.utils.parseEther("10"),
                        maxSnatchAmount: ethers.utils.parseEther("20"),
                    },
                    {
                        value: ethers.utils.parseEther("1"),
                    },
                )

            await expect(createWithFeeNotEnough()).to.be.reverted
        })

        it("should not allow to create campaign when owner's token balance is not enough", async () => {
            const ownerBalance = await token.balanceOf(operator.getAddress())

            const createWithBalanceNotEnough = () =>
                createSnatchCampaign(operator, {
                    token: token.address,
                    amount: ownerBalance.add(1),
                    minSnatchAmount: ethers.utils.parseEther("10"),
                    maxSnatchAmount: ethers.utils.parseEther("20"),
                })

            await expect(createWithBalanceNotEnough()).to.be.reverted
        })

        it("should not allow to create expired campaign", async () => {
            const createExpiredCampaign = async () =>
                createSnatchCampaign(operator, {
                    token: token.address,
                    amount: ethers.utils.parseEther("200"),
                    expiry: (await time.latest()) - 60,
                    minSnatchAmount: ethers.utils.parseEther("10"),
                    maxSnatchAmount: ethers.utils.parseEther("20"),
                })

            await expect(createExpiredCampaign()).to.be.reverted
        })

        it("should ensure min snatch amount to be less than max snatch amount", async () => {
            const createInvalidSnatchAmountCampaign = async () =>
                createSnatchCampaign(operator, {
                    token: token.address,
                    amount: ethers.utils.parseEther("200"),
                    minSnatchAmount: ethers.utils.parseEther("10"),
                    maxSnatchAmount: ethers.utils.parseEther("5"),
                })

            await expect(createInvalidSnatchAmountCampaign()).to.be.reverted
        })
    })

    describe("closeSnatchCampaign", () => {
        it("should allow only owner to close campaign", async () => {
            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount: ethers.utils.parseEther("200"),
                expiry: (await time.latest()) + 60,
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("20"),
            })
            const participants = await createParticipants(1)

            await time.increase(600)

            const tx = hongBao
                .connect(participants[0])
                .closeSnatchCampaign(campaignId)
            await expect(tx).to.be.reverted
        })

        it("should not allow to close unexpired campaign", async () => {
            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount: ethers.utils.parseEther("200"),
                expiry: (await time.latest()) + 60,
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("20"),
            })

            const tx = hongBao.connect(operator).closeSnatchCampaign(campaignId)
            expect(tx).to.be.reverted
        })

        it("should collect remaining amount back to owner and delete the campaign", async () => {
            const amount = ethers.utils.parseEther("200")

            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount,
                expiry: (await time.latest()) + 60,
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("20"),
            })
            const participants = await createParticipants(1)

            const [snatchAmount] = await snatch(campaignId, participants)
            await time.increase(600)

            const balanceBefore = await token.balanceOf(operator.getAddress())

            const tx = await hongBao
                .connect(operator)
                .closeSnatchCampaign(campaignId)
            const receipt = await tx.wait()
            const [{ args }] = ContractUtil.parseEventLogsByName(
                hongBao,
                "CampaignClosed",
                receipt.logs,
            )
            expect(args.campaignId).to.equal(campaignId)

            const balanceAfter = await token.balanceOf(operator.getAddress())

            expect(balanceAfter.sub(balanceBefore).add(snatchAmount)).to.equal(
                amount,
            )
            await expect(hongBao.getSnatchCampaignInfo(campaignId)).to.be
                .reverted
        })
    })

    describe("snatch", () => {
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
            const snatchCount = 2

            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount: ethers.utils.parseEther("200"),
                snatchCount,
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("20"),
            })

            const participants = await createParticipants(1)

            await snatch(campaignId, participants, 2)

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

        it("should allow to snatch when min and max amount are same", async () => {
            const amount = ethers.utils.parseEther("100")
            const minSnatchAmount = ethers.utils.parseEther("10")
            const maxSnatchAmount = ethers.utils.parseEther("10")

            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount,
                minSnatchAmount,
                maxSnatchAmount,
            })
            const participants = await createParticipants(10)

            await snatch(campaignId, participants)

            const totalSnatchAmount = await getTotalBalance(token, participants)
            expect(totalSnatchAmount).to.equal(amount)
        })
    })

    describe("refillSnatchCampaign", () => {
        it("should allow only owner to refill the snatch campaign", async () => {
            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount: ethers.utils.parseEther("100"),
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("10"),
            })

            const tx = hongBao
                .connect(other)
                .refillSnatchCampaign(campaignId, 1)
            await expect(tx).to.be.reverted
        })

        it("should refill the snatch campaign", async () => {
            const amount = ethers.utils.parseEther("15")
            const refillAmount = ethers.utils.parseEther("5")

            const campaignId = await createSnatchCampaign(operator, {
                token: token.address,
                amount,
                minSnatchAmount: ethers.utils.parseEther("10"),
                maxSnatchAmount: ethers.utils.parseEther("10"),
            })
            const [p1, p2] = await createParticipants(2)

            await snatch(campaignId, [p1])
            await expect(snatch(campaignId, [p2])).to.be.reverted

            const tx = await hongBao
                .connect(operator)
                .refillSnatchCampaign(campaignId, refillAmount)
            const receipt = await tx.wait()
            const [{ args }] = ContractUtil.parseEventLogsByName(
                hongBao,
                "CampaignRefilled",
                receipt.logs,
            )
            expect(args.campaignId).to.equal(campaignId)
            expect(args.amount).to.equal(refillAmount)

            await snatch(campaignId, [p2])

            const campaign = await hongBao.getSnatchCampaignInfo(campaignId)
            expect(campaign.remainingAmount).to.equal(0)

            const totalSnatchAmount = await getTotalBalance(token, [p1, p2])
            expect(totalSnatchAmount).to.equal(amount.add(refillAmount))
        })
    })

    /* Admin */

    describe("collectFee", () => {
        it("should allow only owner to collect", async () => {
            const [other] = await createParticipants(1)

            const tx = hongBao.connect(other).collectFee(other.getAddress())

            await expect(tx).to.be.reverted
        })

        it("should collect all fee from creating campaign", async () => {
            const fee = ethers.utils.parseEther("1")
            const feeCollector = Wallet.createRandom().connect(ethers.provider)

            await hongBao.setCreateCampaignFee(fee)

            await createCampaign(
                operator,
                {
                    token: token.address,
                    participants: [],
                    awards: [],
                },
                {
                    value: fee,
                },
            )

            const hongBaoFeeBefore = await ethers.provider.getBalance(
                hongBao.address,
            )
            expect(hongBaoFeeBefore).to.equal(fee)

            const tx = await hongBao
                .connect(operator)
                .collectFee(feeCollector.address)
            const receipt = await tx.wait()
            const [{ args }] = ContractUtil.parseEventLogsByName(
                hongBao,
                "FeeCollected",
                receipt.logs,
            )
            expect(args.recipient).to.equal(feeCollector.address)
            expect(args.amount).to.equal(fee)

            const hongBaoFeeAfter = await ethers.provider.getBalance(
                hongBao.address,
            )
            expect(hongBaoFeeAfter).to.equal(0)

            const feeCollectorBalance = await ethers.provider.getBalance(
                feeCollector.address,
            )
            expect(feeCollectorBalance).to.equal(fee)
        })
    })

    /* Utils */

    async function createCampaign(
        owner: Signer,
        args: {
            name?: string
            token: string
            expiry?: number
            participantDrawCount?: number
            participants: Signer[]
            awards: IHongBao.AwardStruct[]
        },
        overrides?: PayableOverrides,
    ): Promise<BigNumber> {
        const createCampaignTx = await hongBao.connect(owner).createCampaign(
            args.name ?? "Test",
            args.token,
            args.expiry ?? Date.now(),
            args.participantDrawCount ?? 1,
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
            snatchCount?: number
            minSnatchAmount: BigNumberish
            maxSnatchAmount: BigNumberish
        },
        overrides?: PayableOverrides,
    ): Promise<BigNumber> {
        const createSnatchCampaignTx = await hongBao
            .connect(owner)
            .createSnatchCampaign(
                args.name ?? "Test",
                args.token,
                args.amount,
                args.expiry ?? Date.now(),
                args.snatchCount ?? 1,
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

    async function snatch(
        campaignId: BigNumberish,
        participants: Signer[],
        round: number = 1,
    ) {
        const results: BigNumber[] = []

        for (let i = 0; i < round; i++) {
            for (const p of participants) {
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
