// Minimal ABIs for the COUR protocol, hand-extracted from deployments/abi/*.json
// (which are forge tables) and the compiled artifacts in out/*.
// Only the functions/events the monitor actually uses are included, typed `as const`
// so viem can infer argument and return types.

export const factoryAbi = [
  // --- views ---
  { type: 'function', name: 'launchesPaused', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'launchAllowlistEnabled', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'launchFee', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pendingOwner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'stockAllowed', inputs: [{ name: 'stock', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  // --- events ---
  {
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'curve', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'stock', type: 'address', indexed: false },
      { name: 'creatorFeeBps', type: 'uint16', indexed: false },
      { name: 'creatorMode', type: 'uint8', indexed: false },
      { name: 'feeRecipient', type: 'address', indexed: false },
      { name: 'startPriceX', type: 'uint256', indexed: false },
      { name: 'metadataURI', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Graduated',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'tokenLiquidity', type: 'uint256', indexed: false },
      { name: 'stockLiquidity', type: 'uint256', indexed: false },
      { name: 'positionId', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'StockSet',
    inputs: [
      { name: 'stock', type: 'address', indexed: true },
      { name: 'allowed', type: 'bool', indexed: false },
      { name: 'refPool', type: 'address', indexed: false },
      { name: 'refKind', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LaunchParamsSet',
    inputs: [
      { name: 'startMcUsd', type: 'uint256', indexed: false },
      { name: 'gradMcUsd', type: 'uint256', indexed: false },
      { name: 'minRefLiqUsd', type: 'uint256', indexed: false },
      { name: 'launchFee', type: 'uint256', indexed: false },
    ],
  },
  { type: 'event', name: 'LaunchesPausedSet', inputs: [{ name: 'paused', type: 'bool', indexed: false }] },
  {
    type: 'event',
    name: 'LaunchAllowlistSet',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'allowed', type: 'bool', indexed: false },
    ],
  },
  { type: 'event', name: 'LaunchAllowlistEnabledSet', inputs: [{ name: 'enabled', type: 'bool', indexed: false }] },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
] as const;

export const feeVaultAbi = [
  // --- views ---
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'treasury', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'platformOwed', inputs: [{ name: 'stock', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  // --- events ---
  {
    type: 'event',
    name: 'FeeTaken',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'stockFee', type: 'uint256', indexed: false },
      { name: 'toCreatorSide', type: 'uint256', indexed: false },
      { name: 'toPlatform', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BuybackExecuted',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'stockIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'burned', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PlatformClaimed',
    inputs: [
      { name: 'stock', type: 'address', indexed: true },
      { name: 'treasury', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FeeClaimed',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FeeRecipientChanged',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'oldRecipient', type: 'address', indexed: true },
      { name: 'newRecipient', type: 'address', indexed: true },
    ],
  },
  { type: 'event', name: 'TreasurySet', inputs: [{ name: 'treasury', type: 'address', indexed: true }] },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
] as const;

export const routerAbi = [
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'ethInPath', inputs: [{ name: 'stock', type: 'address' }], outputs: [{ type: 'bytes' }], stateMutability: 'view' },
  {
    type: 'event',
    name: 'EthInPathSet',
    inputs: [
      { name: 'stock', type: 'address', indexed: true },
      { name: 'path', type: 'bytes', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
] as const;

export const priceReaderAbi = [
  {
    type: 'function',
    name: 'stockUsd',
    inputs: [{ name: 'stock', type: 'address' }],
    outputs: [
      { name: 'priceX18', type: 'uint256' },
      { name: 'source', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  { type: 'function', name: 'twapWindow', inputs: [], outputs: [{ type: 'uint32' }], stateMutability: 'view' },
  { type: 'function', name: 'refLiquidityUsd', inputs: [{ name: 'stock', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
] as const;

// COURHook emits FeeTaken too (same signature as the vault's).
export const hookAbi = [
  {
    type: 'event',
    name: 'FeeTaken',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'stockFee', type: 'uint256', indexed: false },
      { name: 'toCreatorSide', type: 'uint256', indexed: false },
      { name: 'toPlatform', type: 'uint256', indexed: false },
    ],
  },
] as const;

// ERC-20 subset + an optional `paused()` probe for stock-issuer pause detection.
export const stockProbeAbi = [
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
] as const;
