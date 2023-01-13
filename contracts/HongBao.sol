// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./interfaces/IHongBao.sol";

contract HongBao is IHongBao, Ownable {
    using SafeERC20 for IERC20;

    struct Campaign {
        uint256 id;
        string name;
        address owner;
        address token;
        uint256 expiry;
        uint256 remainingAwardAmount;
        uint256 remainingDrawCount;
        Award[] remainingAwards;
        mapping(address => bool) participants;
    }

    uint256 public createCampaignFee = 0;

    uint256 private lastCampaignId = 0;
    mapping(uint256 => Campaign) private campaign;

    function createCampaign(
        string calldata name,
        address token,
        uint256 expiry,
        address[] calldata participants,
        Award[] calldata awards
    ) external payable override returns (uint256 campaignId) {
        require(msg.value >= createCampaignFee, "Fee is not enough to create campaign");
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
        c.remainingDrawCount = totalAwardCount > participants.length
            ? totalAwardCount
            : participants.length;
        for (uint i = 0; i < awards.length; i++) {
            c.remainingAwards.push(awards[i]);
        }
        for (uint i = 0; i < participants.length; i++) {
            c.participants[participants[i]] = true;
        }

        emit CampaignCreated(campaignId);
    }

    function closeCampaign(uint256 campaignId) external override {
        Campaign storage c = campaign[campaignId];
        require(c.id > 0, "Campaign doesn't exist");
        require(c.owner == msg.sender, "Only owner can close the campaign");
        require(c.expiry <= block.timestamp, "Campaign is still in progress");

        IERC20(c.token).safeTransfer(msg.sender, c.remainingAwardAmount);
        delete campaign[campaignId];
    }

    function draw(
        uint256 campaignId
    ) external override returns (uint256 amount) {
        Campaign storage c = campaign[campaignId];
        require(c.id > 0, "Campaign doesn't exist");
        require(c.expiry > block.timestamp, "Campaign is already expired");
        require(c.participants[msg.sender], "Not authorzied to draw");

        c.participants[msg.sender] = false;

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
            return 0;
        }

        IERC20(c.token).safeTransfer(msg.sender, award.amount);
        emit HongBaoWon(award.name, award.amount);

        return award.amount;
    }

    function getCampaignInfo(
        uint256 campaignId
    ) external view override returns (CampaignInfo memory campaignInfo) {
        Campaign storage c = campaign[campaignId];
        require(c.id > 0, "Campaign doesn't exist");
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

    /* admin */

    function setCreateCampaignFee(uint256 amount) external onlyOwner {
       createCampaignFee = amount;
    }
}
