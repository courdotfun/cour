// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURPriceReader } from "../../src/interfaces/ICOURPriceReader.sol";

/// @notice Simple price oracle stub for system tests (the real COURPriceReader is exercised against a
///         MockV3Pool in its own unit test). Lets tests set a USD price and reference liquidity directly.
contract MockPriceReader is ICOURPriceReader {
    mapping(address => uint256) public price; // USD per whole stock * 1e18
    mapping(address => uint256) public liq; // USD
    mapping(address => uint256) public mult;

    function setPrice(address stock, uint256 priceX18) external {
        price[stock] = priceX18;
    }

    function setLiq(address stock, uint256 usd) external {
        liq[stock] = usd;
    }

    function setMult(address stock, uint256 m) external {
        mult[stock] = m;
    }

    function stockUsd(address stock) external view returns (uint256 priceX18, uint8 source) {
        priceX18 = price[stock];
        source = 1;
    }

    function refLiquidityUsd(address stock) external view returns (uint256) {
        return liq[stock];
    }

    function uiMultiplier(address stock) external view returns (uint256) {
        uint256 m = mult[stock];
        return m == 0 ? 1e18 : m;
    }

    function bumpCardinality(address, uint16) external { }

    function setRefPool(address, address, RefKind) external { }
}
