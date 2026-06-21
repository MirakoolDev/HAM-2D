// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title HAMMaze
/// @notice Daily maze game. Solve → mint → win the prize pot.
/// @dev ERC-721 where each token = one solved maze run.
///      Prize pool: 75% to top N holders at settlement (24h after first mint).
///      Settlement callable by Gelato keeper or any address.
///      Lives system hook: check ILivesToken for extra-attempt eligibility.
contract HAMMaze is ERC721, Ownable, Pausable, EIP712 {
    using Strings for uint256;

    // ─── Constants ───────────────────────────────────────────────
    uint256 public constant MINT_PRICE = 0.001 ether;
    uint256 public constant SETTLEMENT_DELAY = 24 hours;
    bytes32 public constant MINT_TYPEHASH = keccak256("MintRun(address user,uint256 mazeId,uint256 timeMs)");

    // ─── Podium split (BPS of the 75% prize pool) ────────────────
    // Default: 1st=30%, 2nd=20%, 3rd=15%, 4th-Nth split 35% equally
    uint256    public prizeBps        = 9000;    // 90% to winners by default
    uint256[3] public podiumSharesBps = [3000, 2000, 1500];
    uint256    public tailShareBps    = 3500;
    uint256    public totalWinners    = 10;   // owner-configurable

    // ─── Security ─────────────────────────────────────────────────
    address public signerAddress;

    // ─── Lives system hook ────────────────────────────────────────
    // If set, players holding a LIFE token get extra attempts tracked off-chain.
    // On-chain the contract simply emits an event; enforcement is frontend-side.
    address public livesTokenAddress;

    // ─── Run storage ──────────────────────────────────────────────
    struct Run {
        uint256 mazeId;      // YYYYMMDD date integer
        address minter;
        uint256 timeMs;      // completion time in milliseconds
        string  pathSvg;     // SVG path of solution (normalised to 100x100 viewbox)
        uint256 mintedAt;    // block.timestamp
    }

    uint256 private _nextTokenId;

    mapping(uint256 => Run)      public runs;         // tokenId → Run
    mapping(uint256 => uint256)  public pot;          // mazeId → wei collected
    mapping(uint256 => uint256)  public dayStart;     // mazeId → first mint timestamp
    mapping(uint256 => bool)     public settled;      // mazeId → settled?
    mapping(uint256 => uint256[]) private _topWinners; // mazeId → sorted tokenIds (ascending timeMs)
    mapping(uint256 => mapping(address => uint256)) public claimable; // mazeId => user => wei

    // ─── Events ───────────────────────────────────────────────────
    event MintResult(
        uint256 indexed tokenId,
        uint256 indexed mazeId,
        address minter,
        uint256 timeMs
    );
    event Settled(uint256 indexed mazeId, uint256 totalPot, uint256 prizePool);

    // ─── Constructor ──────────────────────────────────────────────
    constructor(address initialOwner) ERC721("HAM Maze", "HAM") Ownable(initialOwner) EIP712("HAMMaze", "1") {}

    // ─── Mint ──────────────────────────────────────────────────────
    /// @notice Mint a run result as an ERC-721 NFT.
    /// @param mazeId  The YYYYMMDD seed — must equal today's date.
    /// @param timeMs  Completion time in milliseconds.
    /// @param pathSvg SVG path string of the player's solution.
    /// @param signature ECDSA signature from the trusted backend.
    function mint(
        uint256 mazeId,
        uint256 timeMs,
        string calldata pathSvg,
        bytes calldata signature
    ) external payable whenNotPaused {
        require(msg.value == MINT_PRICE, "HAMMaze: wrong price");
        require(mazeId == _todayId(), "HAMMaze: wrong day");
        require(timeMs > 0, "HAMMaze: invalid time");
        require(signerAddress != address(0), "HAMMaze: signer not set");

        bytes32 structHash = keccak256(abi.encode(MINT_TYPEHASH, msg.sender, mazeId, timeMs));
        bytes32 hash = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(hash, signature);
        require(recovered == signerAddress, "HAMMaze: invalid signature");

        uint256 tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);

        runs[tokenId] = Run({
            mazeId:   mazeId,
            minter:   msg.sender,
            timeMs:   timeMs,
            pathSvg:  pathSvg,
            mintedAt: block.timestamp
        });

        pot[mazeId] += msg.value;

        if (dayStart[mazeId] == 0) {
            dayStart[mazeId] = block.timestamp;
        }

        _insertTopWinner(mazeId, tokenId, timeMs);

        emit MintResult(tokenId, mazeId, msg.sender, timeMs);
    }

    // ─── Settlement ───────────────────────────────────────────────
    /// @notice Finalize the prize pot and allocate it to top-N NFT holders.
    ///         Callable by Gelato keeper or any address after 24h.
    function finalizeDay(uint256 mazeId) external {
        require(!settled[mazeId], "HAMMaze: already settled");
        require(dayStart[mazeId] > 0, "HAMMaze: no mints for this day");
        require(
            block.timestamp >= dayStart[mazeId] + SETTLEMENT_DELAY,
            "HAMMaze: too soon"
        );

        uint256[] storage winners = _topWinners[mazeId];
        uint256 n = winners.length; // may be < totalWinners if few mints
        require(n > 0, "HAMMaze: no winners");

        uint256 prizePool = (pot[mazeId] * prizeBps) / 10000;
        uint256 assigned = 0;

        // Podium (1st, 2nd, 3rd)
        for (uint256 i = 0; i < 3 && i < n; i++) {
            uint256 payout = (prizePool * podiumSharesBps[i]) / 10000;
            address winner = ownerOf(winners[i]);
            claimable[mazeId][winner] += payout;
            assigned += payout;
        }

        // Equal tail (4th – Nth)
        if (n > 3) {
            uint256 tailN   = n - 3;
            uint256 tailPot = (prizePool * tailShareBps) / 10000;
            uint256 each    = tailPot / tailN;
            for (uint256 i = 3; i < n; i++) {
                address winner = ownerOf(winners[i]);
                claimable[mazeId][winner] += each;
                assigned += each;
            }
        }

        // Protocol fee — remaining balance
        uint256 protocolFee = pot[mazeId] - assigned;
        _safeTransferEth(owner(), protocolFee);

        settled[mazeId] = true;
        emit Settled(mazeId, pot[mazeId], prizePool);
    }

    // ─── Claiming ─────────────────────────────────────────────────
    /// @notice Allows a winning user to pull their allocated ETH.
    function claimPrize(uint256 mazeId) external whenNotPaused {
        uint256 amount = claimable[mazeId][msg.sender];
        require(amount > 0, "HAMMaze: nothing to claim");
        
        claimable[mazeId][msg.sender] = 0;
        _safeTransferEth(msg.sender, amount);
    }

    /// @notice Admin override to rescue stuck funds in case of emergency.
    function adminClaim(uint256 mazeId, address user) external onlyOwner {
        uint256 amount = claimable[mazeId][user];
        require(amount > 0, "HAMMaze: nothing to claim");
        
        claimable[mazeId][user] = 0;
        _safeTransferEth(owner(), amount);
    }

    // ─── Views ────────────────────────────────────────────────────
    function getTopWinners(uint256 mazeId) external view returns (uint256[] memory) {
        return _topWinners[mazeId];
    }

    function getRun(uint256 tokenId) external view returns (Run memory) {
        return runs[tokenId];
    }

    /// @notice Fully on-chain SVG tokenURI.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Run memory r = runs[tokenId];

        string memory svg = _buildSVG(r, tokenId);
        string memory json = string(abi.encodePacked(
            '{"name":"HAM Maze #', tokenId.toString(),
            '","description":"Daily maze run. Solved in ', r.timeMs.toString(),
            'ms.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Maze","value":"', r.mazeId.toString(),
            '"},{"trait_type":"Time (ms)","value":', r.timeMs.toString(),
            '}]}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    // ─── Owner controls ───────────────────────────────────────────
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setSignerAddress(address signer) external onlyOwner {
        signerAddress = signer;
    }

    function setPrizeBps(uint256 bps) external onlyOwner {
        require(bps <= 10000, "HAMMaze: invalid bps");
        prizeBps = bps;
    }

    /// @notice Raise winner count (e.g. from 10 to 20 as game grows)
    function setTotalWinners(uint256 n) external onlyOwner {
        require(n >= 3, "HAMMaze: need at least 3");
        totalWinners = n;
    }

    /// @notice Rebalance prize split. All four values must sum to 10000.
    function setPodiumShares(
        uint256 first,
        uint256 second,
        uint256 third,
        uint256 tail
    ) external onlyOwner {
        require(first + second + third + tail == 10000, "HAMMaze: must sum to 100%");
        podiumSharesBps = [first, second, third];
        tailShareBps    = tail;
    }

    /// @notice Set the Lives NFT contract address (for future lives system)
    function setLivesToken(address addr) external onlyOwner {
        livesTokenAddress = addr;
    }

    // ─── Internal ─────────────────────────────────────────────────

    /// @dev Converts block.timestamp to YYYYMMDD integer.
    ///      Matches Unity: year*10000 + month*100 + day.
    function _todayId() internal view returns (uint256) {
        uint256 ts = block.timestamp;
        // Days since Unix epoch
        uint256 z = ts / 86400 + 719468;
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

    /// @dev Insertion-sort insert into top-N list (ascending timeMs).
    function _insertTopWinner(uint256 mazeId, uint256 tokenId, uint256 timeMs) internal {
        uint256[] storage top = _topWinners[mazeId];
        uint256 n = top.length;
        uint256 cap = totalWinners;

        // If list has capacity, just append and sort-up
        if (n < cap) {
            top.push(tokenId);
            // Bubble up
            for (uint256 i = n; i > 0; i--) {
                if (runs[top[i]].timeMs < runs[top[i - 1]].timeMs) {
                    (top[i], top[i - 1]) = (top[i - 1], top[i]);
                } else break;
            }
        } else {
            // Only replace if faster than the slowest winner
            uint256 slowest = runs[top[n - 1]].timeMs;
            if (timeMs >= slowest) return;
            top[n - 1] = tokenId;
            // Bubble up
            for (uint256 i = n - 1; i > 0; i--) {
                if (runs[top[i]].timeMs < runs[top[i - 1]].timeMs) {
                    (top[i], top[i - 1]) = (top[i - 1], top[i]);
                } else break;
            }
        }
    }

    /// @dev Builds a minimal on-chain SVG with maze seed + path overlay.
    function _buildSVG(Run memory r, uint256 tokenId) internal pure returns (string memory) {
        // The maze walls can be regenerated deterministically from mazeId,
        // but doing full DFS in Solidity is expensive. For the NFT we embed:
        //  - The maze seed as a label
        //  - The player's path SVG
        //  - A styled card background
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440" ',
            'style="font-family:monospace;background:#f5eec8;">',
            // Background card
            '<rect x="10" y="10" width="380" height="420" rx="14" fill="#ede6b4" stroke="#5c3d1e" stroke-width="3"/>',
            // Title
            '<text x="200" y="52" text-anchor="middle" font-size="22" font-weight="bold" fill="#1a1208" letter-spacing="2">',
            'HAM #', tokenId.toString(),
            '</text>',
            // Maze ID
            '<text x="200" y="78" text-anchor="middle" font-size="12" fill="#7a6845">',
            'Maze ', r.mazeId.toString(),
            '</text>',
            // Time
            '<text x="200" y="130" text-anchor="middle" font-size="44" font-weight="bold" fill="#ff7b00">',
            _formatMs(r.timeMs),
            '</text>',
            // Path canvas area
            '<rect x="40" y="160" width="320" height="220" rx="8" fill="#f5eec8" stroke="#c8b87a" stroke-width="2"/>',
            // Embed player path (already normalised 0-100 viewbox, scale to fit)
            '<g transform="translate(40,160) scale(3.2,2.2)">',
            r.pathSvg,
            '</g>',
            // Footer
            '<text x="200" y="410" text-anchor="middle" font-size="10" fill="#7a6845">playham.xyz</text>',
            '</svg>'
        ));
    }

    /// @dev Format milliseconds as "12.34s"
    function _formatMs(uint256 ms) internal pure returns (string memory) {
        uint256 s = ms / 1000;
        uint256 centis = (ms % 1000) / 10;
        return string(abi.encodePacked(
            s.toString(), ".",
            centis < 10 ? string(abi.encodePacked("0", centis.toString())) : centis.toString(),
            "s"
        ));
    }

    function _safeTransferEth(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "HAMMaze: ETH transfer failed");
    }

    receive() external payable {}
}
