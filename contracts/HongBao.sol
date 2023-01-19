// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./interfaces/IHongBao.sol";

contract HongBao is IHongBao, Ownable {
    using SafeERC20 for IERC20;

    uint256 public createCampaignFee = 0;
    uint256 private lastCampaignId = 0;

    function getCampaignType(uint256 campaignId) external view override returns (CampaignType) {
        if (campaign[campaignId].id > 0) {
            return CampaignType.Classic;
        }
        if (snatchCampaign[campaignId].id > 0) {
            return CampaignType.Snatch;
        }
        revert("Campaign doesn't exist");
    }

    /* Classic Campaign */

    struct Campaign {
        uint256 id;
        string name;
        address owner;
        address token;
        uint256 expiry;
        uint256 remainingAwardAmount;
        uint256 remainingDrawCount;
        Award[] remainingAwards;
        mapping(address => uint8) participant;
    }

    mapping(uint256 => Campaign) private campaign;

    function getCampaignInfo(
        uint256 campaignId
    ) external view override returns (CampaignInfo memory info) {
        Campaign storage c = findCampaign(campaignId);
        return
            CampaignInfo({
                id: campaignId,
                name: c.name,
                token: c.token,
                expiry: c.expiry,
                remainingAwardAmount: c.remainingAwardAmount,
                remainingAwards: c.remainingAwards
            });
    }

    function getRemainingDrawCount(
        uint256 campaignId
    ) external view override returns (uint8 remainingDrawCount) {
        Campaign storage c = findCampaign(campaignId);
        return c.participant[msg.sender];
    }

    function createCampaign(
        string calldata name,
        address token,
        uint256 expiry,
        uint8 participantDrawCount,
        address[] calldata participants,
        Award[] calldata awards
    ) external payable override returns (uint256 campaignId) {
        require(
            msg.value >= createCampaignFee,
            "Fee is not enough to create campaign"
        );
        require(expiry > block.timestamp, "Campaign is already expired");

        uint256 totalAwardAmount = 0;
        uint256 totalAwardCount = 0;
        for (uint i = 0; i < awards.length; i++) {
            totalAwardAmount += awards[i].count * awards[i].amount;
            totalAwardCount += awards[i].count;
        }

        IERC20(token).safeTransferFrom(
            msg.sender,
            address(this),
            totalAwardAmount
        );

        campaignId = ++lastCampaignId;

        Campaign storage c = campaign[campaignId];
        c.id = campaignId;
        c.name = name;
        c.owner = msg.sender;
        c.token = token;
        c.expiry = expiry;
        c.remainingAwardAmount = totalAwardAmount;

        uint256 totalDrawCount = participants.length * participantDrawCount;
        c.remainingDrawCount = totalAwardCount > totalDrawCount
            ? totalAwardCount
            : totalDrawCount;

        for (uint i = 0; i < awards.length; i++) {
            c.remainingAwards.push(awards[i]);
        }
        for (uint i = 0; i < participants.length; i++) {
            c.participant[participants[i]] = participantDrawCount;
        }

        emit CampaignCreated(campaignId);
    }

    function closeCampaign(uint256 campaignId) external override {
        Campaign storage c = findCampaign(campaignId);
        require(c.owner == msg.sender, "Only owner can close the campaign");
        require(c.expiry <= block.timestamp, "Campaign is still in progress");

        IERC20(c.token).safeTransfer(msg.sender, c.remainingAwardAmount);
        delete campaign[campaignId];

        emit CampaignClosed(campaignId);
    }

    function draw(
        uint256 campaignId
    ) external override returns (string memory name, uint256 amount) {
        Campaign storage c = findCampaign(campaignId);
        require(c.expiry > block.timestamp, "Campaign is already expired");
        require(c.participant[msg.sender] > 0, "Not authorized to draw");

        c.participant[msg.sender] -= 1;

        uint256 seed = (uint256(
            keccak256(
                abi.encodePacked(
                    block.number,
                    block.timestamp,
                    campaignId,
                    c.remainingDrawCount
                )
            )
        ) % c.remainingDrawCount) + 1;

        Award memory award;
        uint256 cumulator = 0;
        for (uint i = 0; i < c.remainingAwards.length; i++) {
            Award storage a = c.remainingAwards[i];
            cumulator += a.count;
            if (seed <= cumulator) {
                a.count -= 1;
                c.remainingAwardAmount -= a.amount;
                award = a;
                break;
            }
        }
        c.remainingDrawCount -= 1;

        if (award.amount == 0) {
            emit HongBaoLost();
            return ("", 0);
        }

        IERC20(c.token).safeTransfer(msg.sender, award.amount);
        emit HongBaoWon(award.name, award.amount);

        return (award.name, award.amount);
    }


    /* Snatch Campaign */

    struct SnatchCampaign {
        uint256 id;
        string name;
        address owner;
        address token;
        uint256 expiry;
        uint8 snatchCount;
        uint256 minSnatchAmount;
        uint256 maxSnatchAmount;
        uint256 remainingAmount;
        mapping(address => SnatchParticipant) participant;
    }

    struct SnatchParticipant {
        uint8 count;
        bool hasSnatched;
    }

    mapping(uint256 => SnatchCampaign) private snatchCampaign;

    function getSnatchCampaignInfo(
        uint256 campaignId
    ) external view override returns (SnatchCampaignInfo memory info) {
        SnatchCampaign storage sc = findSnatchCampaign(campaignId);
        return
            SnatchCampaignInfo({
                name: sc.name,
                token: sc.token,
                expiry: sc.expiry,
                minSnatchAmount: sc.minSnatchAmount,
                maxSnatchAmount: sc.maxSnatchAmount,
                remainingAmount: sc.remainingAmount
            });
    }

    function createSnatchCampaign(
        string calldata name,
        address token,
        uint256 amount,
        uint256 expiry,
        uint8 snatchCount,
        uint256 minSnatchAmount,
        uint256 maxSnatchAmount
    ) external payable override returns (uint256 campaignId) {
        require(
            msg.value >= createCampaignFee,
            "Fee is not enough to create campaign"
        );
        require(expiry > block.timestamp, "Campaign is already expired");
        require(maxSnatchAmount >= minSnatchAmount, "Snatch amount is invalid");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        campaignId = ++lastCampaignId;

        SnatchCampaign storage sc = snatchCampaign[campaignId];
        sc.id = campaignId;
        sc.name = name;
        sc.owner = msg.sender;
        sc.token = token;
        sc.expiry = expiry;
        sc.snatchCount = snatchCount;
        sc.minSnatchAmount = minSnatchAmount;
        sc.maxSnatchAmount = maxSnatchAmount;
        sc.remainingAmount = amount;

        emit CampaignCreated(campaignId);
    }

    function closeSnatchCampaign(uint256 campaignId) external override {
        SnatchCampaign storage sc = findSnatchCampaign(campaignId);
        require(sc.owner == msg.sender, "Only owner can close the campaign");
        require(sc.expiry < block.timestamp, "Campaign is still in progress");

        IERC20(sc.token).safeTransfer(sc.owner, sc.remainingAmount);
        delete snatchCampaign[campaignId];

        emit CampaignClosed(campaignId);
    }

    function refillSnatchCampaign(uint256 campaignId, uint256 amount) external override {
        SnatchCampaign storage sc = findSnatchCampaign(campaignId);
        require(sc.owner == msg.sender, "Only owner can refill the campaign");

        IERC20(sc.token).safeTransferFrom(msg.sender, address(this), amount);
        sc.remainingAmount += amount;

        emit CampaignRefilled(campaignId, amount);
    }

    function snatch(
        uint256 campaignId
    ) external override returns (uint256 amount) {
        SnatchCampaign storage sc = findSnatchCampaign(campaignId);
        require(
            sc.remainingAmount >= sc.minSnatchAmount,
            "Campaign balance is not enough"
        );

        SnatchParticipant storage sp = sc.participant[msg.sender];
        require(!sp.hasSnatched || sp.count > 0, "Not authorized to snatch");
        if (!sp.hasSnatched) {
            sp.count = sc.snatchCount;
            sp.hasSnatched = true;
        }

        uint256 seed = (uint256(
            keccak256(
                abi.encodePacked(
                    block.number,
                    block.timestamp,
                    campaignId,
                    sc.remainingAmount
                )
            )
        ) % (sc.maxSnatchAmount - sc.minSnatchAmount + 1));

        amount = sc.minSnatchAmount + seed;
        if (amount > sc.remainingAmount) {
            amount = sc.remainingAmount;
        }
        sc.remainingAmount -= amount;
        sp.count -= 1;

        IERC20(sc.token).safeTransfer(msg.sender, amount);

        emit HongBaoSnatched(amount);
    }

    /* Admin */

    event FeeCollected(address recipient, uint256 amount);

    function collectFee(address recipient) external onlyOwner {
        uint256 amount = address(this).balance;
        payable(recipient).transfer(amount);
        emit FeeCollected(recipient, amount);
    }

    function setCreateCampaignFee(uint256 amount) external onlyOwner {
        createCampaignFee = amount;
    }

    /* Internal */

    function findCampaign(
        uint256 campaignId
    ) internal view returns (Campaign storage c) {
        c = campaign[campaignId];
        require(c.id > 0, "Campaign doesn't exist");
    }

    function findSnatchCampaign(
        uint256 campaignId
    ) internal view returns (SnatchCampaign storage sc) {
        sc = snatchCampaign[campaignId];
        require(sc.id > 0, "Campaign doesn't exist");
    }
}
