import type { Address } from "viem";

export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export type BscContractAddresses = {
  portal: Address;
  vaultPortal: Address;
  splitVaultFactory: Address;
  multiSendCallOnly: Address;
  pancakeV2Router: Address;
  wbnb: Address;
};

export function getBscContractAddresses(chainId: 56 | 97): BscContractAddresses {
  if (chainId === 56) {
    return {
      portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
      vaultPortal: "0x90497450f2a706f1951b5bdda52B4E5d16f34C06",
      splitVaultFactory: "0xfab75Dc774cB9B38b91749B8833360B46a52345F",
      multiSendCallOnly: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
      pancakeV2Router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
      wbnb: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
    };
  }
  return {
    portal: "0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9",
    vaultPortal: "0x027e3704fC5C16522e9393d04C60A3ac5c0d775f",
    splitVaultFactory: "0x1ae091F75D593eb7dC6539600a185C8A6076A424",
    multiSendCallOnly: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
    pancakeV2Router: "0x0000000000000000000000000000000000000000",
    wbnb: "0x0000000000000000000000000000000000000000"
  };
}
