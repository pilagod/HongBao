import JSBI from "jsbi"

export const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96))
export const Q192 = JSBI.exponentiate(Q96, JSBI.BigInt(2))
