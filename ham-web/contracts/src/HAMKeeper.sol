// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title HAMKeeper
/// @notice Gelato-compatible automation contract.
///         Checks whether any maze day is past its settlement window
///         and calls HAMMaze.settle() if so.
///         Register this at https://app.gelato.network as a "Resolver" task.
interface IHAMMaze {
    function settle(uint256 mazeId) external;
    function settled(uint256 mazeId) external view returns (bool);
    function dayStart(uint256 mazeId) external view returns (uint256);
    function pot(uint256 mazeId) external view returns (uint256);
}

contract HAMKeeper {
    uint256 public constant SETTLEMENT_DELAY = 24 hours;

    IHAMMaze public immutable hammaze;
    address   public immutable owner;

    constructor(address _hammaze) {
        hammaze = IHAMMaze(_hammaze);
        owner   = msg.sender;
    }

    // ─── Gelato Resolver ──────────────────────────────────────────────────────
    // Gelato calls checker() off-chain every block to decide whether to execute.
    // Returns (canExec, execPayload).

    function checker(uint256 mazeId)
        external
        view
        returns (bool canExec, bytes memory execPayload)
    {
        if (hammaze.settled(mazeId))            return (false, bytes("Already settled"));
        if (hammaze.pot(mazeId) == 0)           return (false, bytes("No pot"));
        uint256 start = hammaze.dayStart(mazeId);
        if (start == 0)                         return (false, bytes("No mints yet"));
        if (block.timestamp < start + SETTLEMENT_DELAY)
                                                return (false, bytes("Too soon"));

        execPayload = abi.encodeCall(this.execute, (mazeId));
        canExec     = true;
    }

    // ─── Execute (called by Gelato network) ───────────────────────────────────
    function execute(uint256 mazeId) external {
        hammaze.settle(mazeId);
    }

    // ─── Manual fallback (anyone can call after delay) ────────────────────────
    function manualSettle(uint256 mazeId) external {
        hammaze.settle(mazeId);
    }
}
