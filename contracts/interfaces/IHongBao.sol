// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0;
pragma abicoder v2;

interface IHongBao {
    event CampaignCreated(uint256 campaignId);
    event HongBaoWon(string name, uint256 amount);
    event HongBaoLost();

    struct Award {
        string name;
        uint16 count;
        uint256 amount;
    }

    function createCampaign(
        string calldata name,
        address token,
        uint256 expiry,
        address[] calldata participants,
        Award[] calldata awards
    ) external returns (uint256 campaignId);

    function closeCampaign(uint256 campaignId) external;

    struct CampaignInfo {
        address token;
        uint256 remainingAwardAmount;
        Award[] remainingAwards;
    }

    function getCampaignInfo(
        uint256 campaignId
    ) external view returns (CampaignInfo memory campaignInfo);

    function draw(uint256 campaignId) external returns (uint256 amount);
}
