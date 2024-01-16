# HongBao

Contracts and operating scripts for HongBao protocol.

## Contract Addresses

### Arbitrum

| Contract | Address                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| HongBao  | [0x8f955E5EB5e18751D8C70560f8A4DC8f9ee8efB0](https://arbiscan.io/address/0x8f955e5eb5e18751d8c70560f8a4dc8f9ee8efb0) |

### Arbitrum Sepolia

| Contract      | Address                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| HongBao       | [0xd93004aE1127166C0D0684fc0E5e074DD624b621](https://sepolia.arbiscan.io/address/0xd93004aE1127166C0D0684fc0E5e074DD624b621) |
| HongBao Token | [0xb665a7b7861fBbD1e2208f92B8A70B34fF04A445](https://sepolia.arbiscan.io/address/0xb665a7b7861fBbD1e2208f92B8A70B34fF04A445) |

### Arbitrum Goerli

| Contract      | Address                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| HongBao       | [0x8f955E5EB5e18751D8C70560f8A4DC8f9ee8efB0](https://goerli.arbiscan.io/address/0x8f955E5EB5e18751D8C70560f8A4DC8f9ee8efB0) |
| HongBao Token | [0x70C173Ea4Fc5adfa91eC33D2B1EeDa9f4ADFA380](https://goerli.arbiscan.io/address/0x70C173Ea4Fc5adfa91eC33D2B1EeDa9f4ADFA380) |

### Polygon Mumbai

| Contract      | Address                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| HongBao       | [0x492b5eA12dFf82edeaEB7f92f27a1f0536c82AFd](https://mumbai.polygonscan.com/address/0x492b5eA12dFf82edeaEB7f92f27a1f0536c82AFd) |
| HongBao Token | [0x70C173Ea4Fc5adfa91eC33D2B1EeDa9f4ADFA380](https://mumbai.polygonscan.com/address/0x70C173Ea4Fc5adfa91eC33D2B1EeDa9f4ADFA380) |

## Deployment

```bash
# Deploy HongBao
$ npx hardhat run scripts/deployHongBao.ts --network {network}
$ npx hardhat verify --network {network} {HongBao address}

# Deploy HongBaoToken
$ npx hardhat run scripts/deployHongBaoToken.ts --network {network}
$ npx hardhat verify --network {network} {HongBaoToken address} "HongBao Token" "HBT"
```

## License

© Cyan Ho (pilagod), 2023-NOW

Released under the [MIT License](https://github.com/pilagod/hongbao/blob/main/LICENSE)
