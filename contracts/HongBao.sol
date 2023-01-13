// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "./interfaces/IHongBao.sol";

contract HongBao is IHongBao {
    function createCampaign(
        string calldata name,
        address token,
        uint256 expiry,
        address[] calldata participants,
        Award[] calldata awards
    ) external override returns (uint256 campaignId) {
        return 0;
    }

    function closeCampaign(uint256 campaignId) external override {
        return;
    }

    function getCampaignInfo(
        uint256 campaignId
    ) external view override returns (CampaignInfo memory campaignInfo) {
        return
            CampaignInfo({
                token: address(0),
                remainingAwardAmount: 0,
                remainingAwards: new Award[](0)
            });
    }

    function draw(
        uint256 campaignId
    ) external override returns (uint256 amount) {
        return 0;
    }
}
