// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {StreamVault} from "../src/StreamVault.sol";

/// Local stand-in for tUSD8: 6 decimals, EIP-2612 permit.
contract MockUSD8 is ERC20, ERC20Permit {
    constructor() ERC20("tUSD8", "tUSD8") ERC20Permit("tUSD8") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract StreamVaultTest is Test {
    MockUSD8 usd;
    StreamVault vault;

    address employer;
    uint256 employerKey;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address agent = address(0xA6E47);

    uint256 constant M = 1e6; // 1 tUSD8

    function setUp() public {
        (employer, employerKey) = makeAddrAndKey("employer");
        usd = new MockUSD8();
        vault = new StreamVault(usd);
        usd.mint(employer, 100_000 * M);
        vm.warp(1_000_000);
        vm.prank(employer);
        usd.approve(address(vault), type(uint256).max);
    }

    function _params(address to, uint128 amt, uint40 start, uint40 cliff, uint40 end, bool c)
        internal
        pure
        returns (StreamVault.StreamParams memory)
    {
        return StreamVault.StreamParams(to, amt, start, cliff, end, c);
    }

    function _fundAndCreate(uint128 amt, uint40 cliffOffset, uint40 duration, bool cancelable)
        internal
        returns (uint256 id)
    {
        vm.startPrank(employer);
        vault.deposit(amt);
        uint40 t = uint40(block.timestamp);
        id = vault.createStream(employer, _params(alice, amt, t, t + cliffOffset, t + duration, cancelable));
        vm.stopPrank();
    }

    // ------------------------------------------------------------- vesting math

    function test_linearVesting() public {
        uint256 id = _fundAndCreate(1000 * M, 0, 1000, true);
        skip(250);
        assertEq(vault.vestedOf(id), 250 * M);
        vault.withdraw(id);
        assertEq(usd.balanceOf(alice), 250 * M);
        skip(750);
        vault.withdraw(id);
        assertEq(usd.balanceOf(alice), 1000 * M);
        assertEq(usd.balanceOf(address(vault)), 0);
    }

    function test_cliffBlocksUntilReached() public {
        uint256 id = _fundAndCreate(1000 * M, 500, 1000, true);
        skip(499);
        assertEq(vault.vestedOf(id), 0);
        vm.expectRevert(StreamVault.NothingToWithdraw.selector);
        vault.withdraw(id);
        skip(1); // at cliff, half has vested
        assertEq(vault.vestedOf(id), 500 * M);
    }

    function test_anyoneCanTriggerButRecipientGetsPaid() public {
        uint256 id = _fundAndCreate(1000 * M, 0, 1000, true);
        skip(1000);
        vm.prank(bob);
        vault.withdraw(id);
        assertEq(usd.balanceOf(alice), 1000 * M);
        assertEq(usd.balanceOf(bob), 0);
    }

    // ------------------------------------------------------------------ cancel

    function test_cancelSplitsVestedAndRefund() public {
        uint256 id = _fundAndCreate(1000 * M, 0, 1000, true);
        skip(400);
        uint256 before = usd.balanceOf(employer);
        vm.prank(employer);
        vault.cancel(id);
        assertEq(usd.balanceOf(employer) - before, 600 * M);
        skip(5000); // nothing more vests after cancel
        vault.withdraw(id);
        assertEq(usd.balanceOf(alice), 400 * M);
        assertEq(usd.balanceOf(address(vault)), 0);
    }

    function test_cancelBeforeCliffRefundsAll() public {
        uint256 id = _fundAndCreate(1000 * M, 500, 1000, true);
        skip(100);
        uint256 before = usd.balanceOf(employer);
        vm.prank(employer);
        vault.cancel(id);
        assertEq(usd.balanceOf(employer) - before, 1000 * M);
    }

    function test_nonCancelableReverts() public {
        uint256 id = _fundAndCreate(1000 * M, 0, 1000, false);
        vm.prank(employer);
        vm.expectRevert(StreamVault.NotCancelable.selector);
        vault.cancel(id);
    }

    function test_onlySenderCanCancel() public {
        uint256 id = _fundAndCreate(1000 * M, 0, 1000, true);
        vm.prank(alice);
        vm.expectRevert(StreamVault.NotAuthorized.selector);
        vault.cancel(id);
    }

    function test_cannotCancelTwice() public {
        uint256 id = _fundAndCreate(1000 * M, 0, 1000, true);
        vm.startPrank(employer);
        vault.cancel(id);
        vm.expectRevert(StreamVault.AlreadyCanceled.selector);
        vault.cancel(id);
        vm.stopPrank();
    }

    // ----------------------------------------------------------------- batching

    function test_batchPayroll() public {
        vm.startPrank(employer);
        vault.deposit(3000 * M);
        uint40 t = uint40(block.timestamp);
        StreamVault.StreamParams[] memory ps = new StreamVault.StreamParams[](3);
        ps[0] = _params(alice, 1000 * M, t, t, t + 100, true);
        ps[1] = _params(bob, 1000 * M, t, t, t + 200, true);
        ps[2] = _params(alice, 1000 * M, t, t + 50, t + 300, false);
        uint256[] memory ids = vault.createStreams(employer, ps);
        vm.stopPrank();
        assertEq(ids.length, 3);
        assertEq(vault.treasury(employer), 0);
        assertEq(vault.getStream(ids[1]).recipient, bob);
    }

    // ----------------------------------------------------------------- treasury

    function test_depositWithPermit() public {
        uint256 amt = 500 * M;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                employer,
                address(vault),
                amt,
                usd.nonces(employer),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usd.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(employerKey, digest);

        vm.prank(employer);
        usd.approve(address(vault), 0); // prove permit alone is enough
        vm.prank(employer);
        vault.depositWithPermit(amt, deadline, v, r, s);
        assertEq(vault.treasury(employer), amt);
    }

    function test_withdrawTreasury() public {
        vm.startPrank(employer);
        vault.deposit(100 * M);
        vault.withdrawTreasury(40 * M);
        vm.expectRevert(StreamVault.InsufficientTreasury.selector);
        vault.withdrawTreasury(61 * M);
        vm.stopPrank();
        assertEq(vault.treasury(employer), 60 * M);
    }

    function test_cannotStreamMoreThanTreasury() public {
        vm.startPrank(employer);
        vault.deposit(100 * M);
        uint40 t = uint40(block.timestamp);
        vm.expectRevert(StreamVault.InsufficientTreasury.selector);
        vault.createStream(employer, _params(alice, 101 * M, t, t, t + 10, true));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- operators

    function _grantAgent() internal {
        vm.startPrank(employer);
        vault.deposit(10_000 * M);
        vault.setOperator(agent, 1000 * M, 1500 * M, uint40(block.timestamp + 7 days));
        vm.stopPrank();
    }

    function test_operatorWithinCaps() public {
        _grantAgent();
        uint40 t = uint40(block.timestamp);
        vm.prank(agent);
        uint256 id = vault.createStream(employer, _params(alice, 1000 * M, t, t, t + 100, true));
        assertEq(vault.getStream(id).sender, employer);
    }

    function test_operatorPerStreamCap() public {
        _grantAgent();
        uint40 t = uint40(block.timestamp);
        vm.prank(agent);
        vm.expectRevert(StreamVault.PerStreamCapExceeded.selector);
        vault.createStream(employer, _params(alice, 1001 * M, t, t, t + 100, true));
    }

    function test_operatorDailyCapResetsNextDay() public {
        _grantAgent();
        uint40 t = uint40(block.timestamp);
        vm.startPrank(agent);
        vault.createStream(employer, _params(alice, 1000 * M, t, t, t + 100, true));
        vm.expectRevert(StreamVault.DailyCapExceeded.selector);
        vault.createStream(employer, _params(alice, 600 * M, t, t, t + 100, true));
        vm.stopPrank();

        skip(1 days);
        t = uint40(block.timestamp);
        vm.prank(agent);
        vault.createStream(employer, _params(alice, 600 * M, t, t, t + 100, true));
    }

    function test_operatorExpires() public {
        _grantAgent();
        skip(7 days);
        uint40 t = uint40(block.timestamp);
        vm.prank(agent);
        vm.expectRevert(StreamVault.OperatorExpired.selector);
        vault.createStream(employer, _params(alice, 10 * M, t, t, t + 100, true));
    }

    function test_operatorRevoked() public {
        _grantAgent();
        vm.prank(employer);
        vault.revokeOperator(agent);
        uint40 t = uint40(block.timestamp);
        vm.prank(agent);
        vm.expectRevert(StreamVault.NotAuthorized.selector);
        vault.createStream(employer, _params(alice, 10 * M, t, t, t + 100, true));
    }

    function test_operatorCannotCancelOrDrainTreasury() public {
        _grantAgent();
        uint40 t = uint40(block.timestamp);
        vm.prank(agent);
        uint256 id = vault.createStream(employer, _params(alice, 100 * M, t, t, t + 100, true));
        vm.startPrank(agent);
        vm.expectRevert(StreamVault.NotAuthorized.selector);
        vault.cancel(id);
        vm.expectRevert(StreamVault.InsufficientTreasury.selector);
        vault.withdrawTreasury(1); // agent has no treasury of its own
        vm.stopPrank();
    }

    function test_strangerCannotCreateOnEmployersBehalf() public {
        vm.prank(employer);
        vault.deposit(100 * M);
        uint40 t = uint40(block.timestamp);
        vm.prank(bob);
        vm.expectRevert(StreamVault.NotAuthorized.selector);
        vault.createStream(employer, _params(bob, 100 * M, t, t, t + 100, true));
    }

    // -------------------------------------------------------------------- fuzz

    function testFuzz_neverPaysMoreThanTotal(uint128 amt, uint32 dur, uint32 elapsed) public {
        amt = uint128(bound(amt, 1, 50_000 * M));
        dur = uint32(bound(dur, 1, 365 days));
        uint256 id = _fundAndCreate(amt, 0, dur, true);
        skip(elapsed);
        uint128 v = vault.vestedOf(id);
        assertLe(v, amt);
        if (elapsed >= dur) assertEq(v, amt);
    }

    function testFuzz_cancelConservesFunds(uint128 amt, uint32 dur, uint32 elapsed) public {
        amt = uint128(bound(amt, 1, 50_000 * M));
        dur = uint32(bound(dur, 1, 365 days));
        uint256 id = _fundAndCreate(amt, 0, dur, true);
        skip(elapsed);
        uint256 employerBefore = usd.balanceOf(employer);
        vm.prank(employer);
        vault.cancel(id);
        uint256 refund = usd.balanceOf(employer) - employerBefore;
        uint128 owed = vault.withdrawableOf(id);
        assertEq(refund + owed, amt);
    }

    function testFuzz_invalidScheduleReverts(uint40 start, uint40 cliff, uint40 end) public {
        vm.assume(end <= start || cliff < start || cliff > end);
        vm.startPrank(employer);
        vault.deposit(10 * M);
        vm.expectRevert(StreamVault.InvalidSchedule.selector);
        vault.createStream(employer, _params(alice, 10 * M, start, cliff, end, true));
        vm.stopPrank();
    }
}
