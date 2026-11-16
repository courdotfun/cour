// ABIs copied from deployments/abi/*.json (bare arrays). Cast to viem's Abi so
// readContract / writeContract accept them. Call sites use string functionName +
// explicit result casts, so loose typing is fine here.
import type { Abi } from "viem";
import COURFactory from "./abi/COURFactory.json";
import COURRouter from "./abi/COURRouter.json";
import COURPriceReader from "./abi/COURPriceReader.json";
import COURCurve from "./abi/COURCurve.json";
import COURFeeVault from "./abi/COURFeeVault.json";
import COURToken from "./abi/COURToken.json";
import COURHook from "./abi/COURHook.json";
import GraduationImpl from "./abi/GraduationImpl.json";

export const factoryAbi = COURFactory as Abi;
export const routerAbi = COURRouter as Abi;
export const priceReaderAbi = COURPriceReader as Abi;
export const curveAbi = COURCurve as Abi;
export const feeVaultAbi = COURFeeVault as Abi;
export const tokenAbi = COURToken as Abi;
export const hookAbi = COURHook as Abi;
export const graduationAbi = GraduationImpl as Abi;

// Minimal ERC-20 ABI for arbitrary stock tokens (USDG, WETH, NVDA, ...).
export const erc20Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

// Uniswap SwapRouter02 exactInput / exactInputSingle (subset used by stock pages).
export const swapRouter02Abi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "exactInput",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "path", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;
