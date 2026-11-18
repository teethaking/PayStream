// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StreamVault} from "../../src/StreamVault.sol";
import {MockUSD8} from "../StreamVault.t.sol";

/// Drives StreamVault through random sequences of employer, operator, recipient and keeper actions
/// and keeps ghost accounting that the invariants compare against.
contract Handler is Test {
    StreamVault public vault;
    MockUSD8 public usd;

    address[2] public employers = [address(0xE1), address(0xE2)];
    address public agent = address(0xA6E47);
    address[3] public recipients = [address(0xA11CE), address(0xB0B), address(0xCA401)];

    uint256[] public streamIds;
    mapping(uint256 => uint128) public originalAmount;
    mapping(uint256 => uint256) public paidOut; // recipient payouts + cancel refund per stream

    uint256 public donated;

    // operator cap ghost state, keyed by employer
    mapping(address => uint256) public grantEpoch;
    mapping(address => uint128) public ghostPerStreamCap;
    mapping(address => uint128) public ghostDailyCap;
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public opSpent; // employer => epoch => day => spent
    uint256 public capViolations;
    uint256 public operatorSuccesses;
    uint256 public operatorBlocked;

    constructor(StreamVault vault_, MockUSD8 usd_) {
        vault = vault_;
        usd = usd_;
        for (uint256 i; i < 2; ++i) {
            usd.mint(employers[i], 1e15);
            vm.prank(employers[i]);
            usd.approve(address(vault), type(uint256).max);
        }
    }

    function streamCount() external view returns (uint256) {
        return streamIds.length;
    }

    function _employer(uint256 seed) internal view returns (address) {
        return employers[seed % 2];
    }

    function deposit(uint256 seed, uint256 amount) external {
        amount = bound(amount, 1, 1e12);
        vm.prank(_employer(seed));
        vault.deposit(amount);
    }

    function withdrawTreasury(uint256 seed, uint256 amount) external {
        address e = _employer(seed);
        uint256 bal = vault.treasury(e);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(e);
        vault.withdrawTreasury(amount);
    }

    function _params(uint256 seed, uint128 amount, uint256 cliffOff, uint256 dur, bool cancelable)
        internal
        view
        returns (StreamVault.StreamParams memory p)
    {
        dur = bound(dur, 1, 400 days);
        cliffOff = bound(cliffOff, 0, dur);
        uint40 start = uint40(block.timestamp - (seed % 3 == 0 ? bound(seed, 0, 30 days) : 0));
        p = StreamVault.StreamParams(
            recipients[seed % 3], amount, start, start + uint40(cliffOff), start + uint40(dur), cancelable
        );
    }

    function _record(uint256 id, uint128 amount) internal {
        streamIds.push(id);
        originalAmount[id] = amount;
    }

    function createStream(uint256 seed, uint128 amount, uint256 cliffOff, uint256 dur, bool cancelable) external {
        address e = _employer(seed);
        uint256 bal = vault.treasury(e);
        if (bal == 0) return;
        amount = uint128(bound(amount, 1, bal));
        vm.prank(e);
        uint256 id = vault.createStream(e, _params(seed, amount, cliffOff, dur, cancelable));
        _record(id, amount);
    }

    function setOperator(uint256 seed, uint128 perStream, uint128 daily, uint256 ttl) external {
        address e = _employer(seed);
        perStream = uint128(bound(perStream, 0, 1e11));
        daily = uint128(bound(daily, 0, 3e11));
        ttl = bound(ttl, 1, 30 days);
        vm.prank(e);
        vault.setOperator(agent, perStream, daily, uint40(block.timestamp + ttl));
        grantEpoch[e]++;
        ghostPerStreamCap[e] = perStream;
        ghostDailyCap[e] = daily;
    }

    function revokeOperator(uint256 seed) external {
        address e = _employer(seed);
        vm.prank(e);
        vault.revokeOperator(agent);
        grantEpoch[e]++;
    }

    /// The agent tries arbitrary amounts, including over-cap ones; only successes are checked against caps.
    function operatorCreate(uint256 seed, uint128 amount, uint256 cliffOff, uint256 dur, bool cancelable) external {
        address e = _employer(seed);
        amount = uint128(bound(amount, 1, 4e11));
        StreamVault.StreamParams[] memory ps = new StreamVault.StreamParams[](1 + seed % 3);
        for (uint256 i; i < ps.length; ++i) {
            ps[i] = _params(seed + i, amount, cliffOff, dur, cancelable);
        }
        vm.prank(agent);
        try vault.createStreams(e, ps) returns (uint256[] memory ids) {
            operatorSuccesses++;
            uint256 day = block.timestamp / 1 days;
            uint256 epoch = grantEpoch[e];
            for (uint256 i; i < ids.length; ++i) {
                _record(ids[i], amount);
                if (amount > ghostPerStreamCap[e]) capViolations++;
                opSpent[e][epoch][day] += amount;
            }
            if (opSpent[e][epoch][day] > ghostDailyCap[e]) capViolations++;
        } catch {
            operatorBlocked++;
        }
    }

    function withdraw(uint256 idx, address keeper) external {
        if (streamIds.length == 0) return;
        uint256 id = streamIds[idx % streamIds.length];
        if (vault.withdrawableOf(id) == 0) return;
        vm.prank(keeper);
        uint128 amt = vault.withdraw(id);
        paidOut[id] += amt;
    }

    function cancel(uint256 idx) external {
        if (streamIds.length == 0) return;
        uint256 id = streamIds[idx % streamIds.length];
        StreamVault.Stream memory s = vault.getStream(id);
        if (!s.cancelable || s.canceled) return;
        uint256 before = usd.balanceOf(s.sender);
        vm.prank(s.sender);
        vault.cancel(id);
        paidOut[id] += usd.balanceOf(s.sender) - before;
    }

    function donate(uint256 amount) external {
        amount = bound(amount, 1, 1e9);
        usd.mint(address(vault), amount);
        donated += amount;
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 1, 10 days));
    }
}

contract StreamVaultInvariantTest is Test {
    StreamVault vault;
    MockUSD8 usd;
    Handler handler;

    function setUp() public {
        vm.warp(100 days);
        usd = new MockUSD8();
        vault = new StreamVault(usd);
        handler = new Handler(vault, usd);
        targetContract(address(handler));
    }

    function _outstanding() internal view returns (uint256 sum) {
        uint256 n = handler.streamCount();
        for (uint256 i; i < n; ++i) {
            StreamVault.Stream memory s = vault.getStream(handler.streamIds(i));
            sum += s.total - s.withdrawn;
        }
    }

    function _treasuries() internal view returns (uint256) {
        return vault.treasury(handler.employers(0)) + vault.treasury(handler.employers(1));
    }

    /// Vault holds at least every treasury balance plus everything still owed to recipients
    /// (unvested + vested-but-unwithdrawn). Without donations the books balance exactly.
    function invariant_solvency() public view {
        uint256 liabilities = _treasuries() + _outstanding();
        uint256 bal = usd.balanceOf(address(vault));
        assertGe(bal, liabilities);
        assertEq(bal, liabilities + handler.donated());
    }

    function invariant_operatorNeverExceedsCaps() public view {
        assertEq(handler.capViolations(), 0);
    }

    /// Payouts plus cancel refunds never exceed a stream's original amount, and per-stream state stays sane.
    function invariant_streamNeverPaysMoreThanTotal() public view {
        uint256 n = handler.streamCount();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.streamIds(i);
            StreamVault.Stream memory s = vault.getStream(id);
            uint128 orig = handler.originalAmount(id);
            assertLe(handler.paidOut(id), orig);
            assertLe(s.total, orig);
            assertLe(s.withdrawn, s.total);
            assertLe(vault.vestedOf(id), s.total);
            assertEq(vault.withdrawableOf(id), vault.vestedOf(id) - s.withdrawn);
            if (!s.canceled) assertEq(s.total, orig);
        }
    }
}
