// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0;
pragma abicoder v2;

interface IHongBao {
    event CampaignClosed(uint256 campaignId);
    event CampaignCreated(uint256 campaignId);
    event CampaignRefilled(uint256 campaignId, uint256 amount);

    enum CampaignType {
        Classic,
        Snatch
    }

    function getCampaignType(
        uint256 campaignId
    ) external view returns (CampaignType);

    /* Classic Campaign */

    event HongBaoWon(string name, uint256 amount);
    event HongBaoLost();

    struct Award {
        string name;
        uint16 count;
        uint256 amount;
    }

    struct CampaignInfo {
        uint256 id;
        string name;
        address token;
        uint256 expiry;
        uint256 remainingAwardAmount;
        Award[] remainingAwards;
    }

    function getCampaignInfo(
        uint256 campaignId
    ) external view returns (CampaignInfo memory info);

    function getRemainingDrawCount(
        uint256 campaignId
    ) external view returns (uint8 remainingDrawCount);

    function createCampaign(
        string calldata name,
        address token,
        uint256 expiry,
        uint8 participantDrawCount,
        address[] calldata participants,
        Award[] calldata awards
    ) external payable returns (uint256 campaignId);

    function closeCampaign(uint256 campaignId) external;

    function draw(
        uint256 campaignId
    ) external returns (string memory name, uint256 amount);

    /* Snatch Campaign */

    event HongBaoSnatched(uint256 amount);

    struct SnatchCampaignInfo {
        string name;
        address token;
        uint256 expiry;
        uint256 minSnatchAmount;
        uint256 maxSnatchAmount;
        uint256 remainingAmount;
    }

    function getSnatchCampaignInfo(
        uint256 campaignId
    ) external view returns (SnatchCampaignInfo memory info);

    function createSnatchCampaign(
        string calldata name,
        address token,
        uint256 amount,
        uint256 expiry,
        uint8 snatchCount,
        uint256 minSnatchAmount,
        uint256 maxSnatchAmount
    ) external payable returns (uint256 campaignId);

    function closeSnatchCampaign(uint256 campaignId) external;

    function refillSnatchCampaign(uint256 campaignId, uint256 amount) external;

    function snatch(uint256 campaignId) external returns (uint256 amount);
}
