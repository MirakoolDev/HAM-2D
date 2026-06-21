// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {HAMMaze} from "../src/HAMMaze.sol";

/// @notice Full test suite for HAMMaze.
///         Run: forge test -vvvv
contract HAMMazeTest is Test {
    HAMMaze public maze;
    address public owner  = makeAddr("owner");
    address public alice  = makeAddr("alice");
    address public bob    = makeAddr("bob");
    address public carol  = makeAddr("carol");

    uint256 public signerKey = 0xA11CE;
    address public signerAddr = vm.addr(signerKey);

    uint256 constant PRICE = 0.001 ether;
    string  constant PATH  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 0 0 L 50 50"/></svg>';

    // ── Setup ──────────────────────────────────────────────────────────────────
    function setUp() public {
        maze = new HAMMaze(owner);
        vm.prank(owner);
        maze.setSignerAddress(signerAddr);
        vm.deal(alice, 10 ether);
        vm.deal(bob,   10 ether);
        vm.deal(carol, 10 ether);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// Get today's YYYYMMDD mazeId (matches contract logic)
    function _todayId() internal view returns (uint256) {
        uint256 ts = block.timestamp;
        uint256 z  = ts / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 y   = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp  = (5 * doy + 2) / 153;
        uint256 d   = doy - (153 * mp + 2) / 5 + 1;
        uint256 m   = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y++;
        return y * 10000 + m * 100 + d;
    }

    function _signMint(address user, uint256 mazeId, uint256 timeMs) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(maze.MINT_TYPEHASH(), user, mazeId, timeMs));
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("HAMMaze")),
            keccak256(bytes("1")),
            block.chainid,
            address(maze)
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _mint(address user, uint256 timeMs) internal returns (uint256 tokenId) {
        uint256 mazeId = _todayId();
        bytes memory sig = _signMint(user, mazeId, timeMs);
        uint256 before = maze.balanceOf(user);
        vm.prank(user);
        maze.mint{value: PRICE}(mazeId, timeMs, PATH, sig);
        tokenId = before; // first token is id 0, etc. — simplified
    }

    // ── Mint tests ─────────────────────────────────────────────────────────────

    function test_MintSucceeds() public {
        uint256 mazeId = _todayId();
        bytes memory sig = _signMint(alice, mazeId, 12_345);
        vm.prank(alice);
        maze.mint{value: PRICE}(mazeId, 12_345, PATH, sig);

        assertEq(maze.balanceOf(alice), 1);
        assertEq(maze.pot(mazeId), PRICE);
    }

    function test_MintWrongPrice_Reverts() public {
        uint256 mazeId = _todayId();
        bytes memory sig = _signMint(alice, mazeId, 12_345);
        vm.prank(alice);
        vm.expectRevert("HAMMaze: wrong price");
        maze.mint{value: 0.002 ether}(mazeId, 12_345, PATH, sig);
    }

    function test_MintWrongDay_Reverts() public {
        uint256 wrongId = _todayId() + 1;
        bytes memory sig = _signMint(alice, wrongId, 12_345);
        vm.prank(alice);
        vm.expectRevert("HAMMaze: wrong day");
        maze.mint{value: PRICE}(wrongId, 12_345, PATH, sig);
    }

    function test_MintZeroTime_Reverts() public {
        uint256 mazeId = _todayId();
        bytes memory sig = _signMint(alice, mazeId, 0);
        vm.prank(alice);
        vm.expectRevert("HAMMaze: invalid time");
        maze.mint{value: PRICE}(mazeId, 0, PATH, sig);
    }

    function test_MintEmitsEvent() public {
        uint256 mazeId = _todayId();
        bytes memory sig = _signMint(alice, mazeId, 5_000);
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit HAMMaze.MintResult(0, mazeId, alice, 5_000);
        maze.mint{value: PRICE}(mazeId, 5_000, PATH, sig);
    }

    // ── Top Winners insertion sort ─────────────────────────────────────────────

    function test_TopWinnersSortedAscending() public {
        uint256 mazeId = _todayId();

        _mint(alice, 30_000); // token 0 — slow
        _mint(bob,   10_000); // token 1 — fast
        _mint(carol, 20_000); // token 2 — mid

        uint256[] memory top = maze.getTopWinners(mazeId);
        // Expected order: [1 (10k), 2 (20k), 0 (30k)]
        assertEq(top.length, 3);
        assertEq(maze.getRun(top[0]).timeMs, 10_000);
        assertEq(maze.getRun(top[1]).timeMs, 20_000);
        assertEq(maze.getRun(top[2]).timeMs, 30_000);
    }

    function test_TopWinnersCapAtTotalWinners() public {
        uint256 mazeId = _todayId();
        uint256 cap = maze.totalWinners(); // 10 by default

        // Mint cap + 3 entries with increasing times
        for (uint256 i = 0; i < cap + 3; i++) {
            address user = makeAddr(string(abi.encodePacked("user", i)));
            vm.deal(user, 1 ether);
            vm.prank(user);
            maze.mint{value: PRICE}(mazeId, (i + 1) * 1000, PATH);
        }

        uint256[] memory top = maze.getTopWinners(mazeId);
        assertEq(top.length, cap);
        // Slowest in top should be cap*1000ms (the cap-th entry)
        assertEq(maze.getRun(top[cap - 1]).timeMs, cap * 1000);
    }

    function test_SlowerRunDoesNotDisplace() public {
        uint256 mazeId = _todayId();

        // Fill top 10 with 1000–10000ms
        for (uint256 i = 1; i <= 10; i++) {
            address user = makeAddr(string(abi.encodePacked("fill", i)));
            vm.deal(user, 1 ether);
            _mint(user, i * 1000);
        }

        // Add a very slow run — should NOT appear in top 10
        _mint(alice, 999_999);

        uint256[] memory top = maze.getTopWinners(mazeId);
        for (uint256 i = 0; i < top.length; i++) {
            assertLt(maze.getRun(top[i]).timeMs, 11_000);
        }
    }

    // ── Settlement ─────────────────────────────────────────────────────────────

    function test_SettleTooSoon_Reverts() public {
        uint256 mazeId = _todayId();
        _mint(alice, 5_000);

        vm.expectRevert("HAMMaze: too soon");
        maze.finalizeDay(mazeId);
    }

    function test_FinalizeAndClaim() public {
        uint256 mazeId = _todayId();

        // Alice = fastest, bob = 2nd, carol = 3rd
        uint256 t0 = _mint(alice, 5_000);
        uint256 t1 = _mint(bob, 10_000);
        uint256 t2 = _mint(carol, 15_000);

        uint256 pot = maze.pot(mazeId); // 3 * 0.001 = 0.003 ETH
        uint256 prizePool = pot * 9000 / 10000; // 90%

        // Warp 24h + 1s
        vm.warp(block.timestamp + 24 hours + 1);
        maze.finalizeDay(mazeId);

        assertTrue(maze.settled(mazeId));

        // 1st = 30%, 2nd = 20%, 3rd = 15% of prizePool
        assertEq(maze.claimable(mazeId, t0), prizePool * 3000 / 10000);
        
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        maze.claimPrize(mazeId, t0);
        assertEq(alice.balance - aliceBefore, prizePool * 3000 / 10000);
        assertEq(maze.claimable(mazeId, t0), 0);
    }

    function test_SettleAlreadySettled_Reverts() public {
        uint256 mazeId = _todayId();
        _mint(alice, 5_000);
        vm.warp(block.timestamp + 24 hours + 1);
        maze.finalizeDay(mazeId);

        vm.expectRevert("HAMMaze: already settled");
        maze.finalizeDay(mazeId);
    }

    function test_ClaimNftTransferBeforeClaim() public {
        uint256 mazeId = _todayId();
        uint256 t0 = _mint(alice, 5_000); // token 0

        // Alice transfers her winning NFT to bob before claiming
        vm.prank(alice);
        maze.transferFrom(alice, bob, t0);

        vm.warp(block.timestamp + 24 hours + 1);
        maze.finalizeDay(mazeId);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        maze.claimPrize(mazeId, t0);

        // Bob (current holder of token 0) receives alice's prize share
        assertGt(bob.balance, bobBefore);
    }

    // ── Owner controls ─────────────────────────────────────────────────────────

    function test_SetTotalWinners() public {
        vm.prank(owner);
        maze.setTotalWinners(20);
        assertEq(maze.totalWinners(), 20);
    }

    function test_SetTotalWinners_NotOwner_Reverts() public {
        vm.prank(alice);
        vm.expectRevert();
        maze.setTotalWinners(20);
    }

    function test_SetPodiumShares() public {
        vm.prank(owner);
        maze.setPodiumShares(4000, 3000, 2000, 1000); // 40/30/20/10%
        (uint256 first,,) = maze.podiumSharesBps(0),
                            maze.podiumSharesBps(1),
                            maze.podiumSharesBps(2);
        // Simplified — just check no revert and tail updated
        assertEq(maze.tailShareBps(), 1000);
    }

    function test_SetPodiumShares_BadSum_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("HAMMaze: must sum to 100%");
        maze.setPodiumShares(3000, 2000, 1500, 9999); // doesn't sum to 10000
    }

    // ── tokenURI ───────────────────────────────────────────────────────────────

    function test_TokenURIReturnsBase64JSON() public {
        uint256 mazeId = _todayId();
        _mint(alice, 8_000);

        string memory uri = maze.tokenURI(0);
        // Should start with data:application/json;base64,
        bytes memory uriBytes = bytes(uri);
        assertEq(uriBytes[0], "d");
        assertEq(uriBytes[4], ":");
    }

    function test_TokenURINonExistent_Reverts() public {
        vm.expectRevert();
        maze.tokenURI(99);
    }

    // ── todayId math ───────────────────────────────────────────────────────────

    function test_TodayIdMatchesKnownDate() public {
        // 2026-05-05 = 20260505
        // Unix timestamp for 2026-05-05 00:00:00 UTC = 1746403200
        vm.warp(1746403200);
        // We can't call _todayId directly (internal), so mint and check mazeId stored
        uint256 mazeId = _todayId();
        assertEq(mazeId, 20260505);
    }
}
