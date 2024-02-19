# HongBao

Contracts and operating scripts for HongBao protocol.

## Contract Addresses

### Arbitrum Sepolia

| Contract      | Address                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| HongBao Token | [0xb665a7b7861fBbD1e2208f92B8A70B34fF04A445](https://sepolia.arbiscan.io/address/0xb665a7b7861fBbD1e2208f92B8A70B34fF04A445) |

### Arbitrum Goerli

| Contract      | Address                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| HongBao Token | [0x70C173Ea4Fc5adfa91eC33D2B1EeDa9f4ADFA380](https://goerli.arbiscan.io/address/0x70C173Ea4Fc5adfa91eC33D2B1EeDa9f4ADFA380) |

### Polygon Mumbai

| Contract      | Address                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
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
