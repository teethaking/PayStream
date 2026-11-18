// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StreamVault} from "../../src/StreamVault.sol";

interface ITUSD8 is IERC20 {
    function name() external view returns (string memory);
    function version() external view returns (string memory);
    function decimals() external view returns (uint8);
    function nonces(address owner) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function eip712Domain()
        external
        view
        returns (bytes1, string memory, string memory, uint256, address, bytes32, uint256[] memory);
}

/// Runs against the real tUSD8 on QDay Aevum testnet:
///   forge test --match-path 'test/fork/*' --fork-url https://rpc-test.qday.info -vv
/// Skipped when not running on a chain 44005 fork.
contract StreamVaultForkTest is Test {
    ITUSD8 constant TUSD8 = ITUSD8(0x456569838f1d43009A91ebA4263147Afd7233483);
    bytes32 constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    uint128 constant M = 1e6;

    StreamVault vault;
    address employer;
    uint256 employerKey;
    address alice = makeAddr("alice");
    address agent = makeAddr("agent");

    function setUp() public {
        if (block.chainid != 44005) vm.skip(true);
        (employer, employerKey) = makeAddrAndKey("fork-employer");
        vault = new StreamVault(TUSD8);
        deal(address(TUSD8), employer, 10_000 * M);
    }

    /// Reads the domain the same way the web app does: eip712Domain() if present, else name()/version(),
    /// falling back to "tUSD8"/"2"; then asserts it matches DOMAIN_SEPARATOR() on chain.
    function _onchainDomain() internal view returns (string memory name, string memory version) {
        (name, version) = ("tUSD8", "2");
        try TUSD8.eip712Domain() returns (
            bytes1, string memory n, string memory v, uint256, address, bytes32, uint256[] memory
        ) {
            return (n, v);
        } catch {}
        try TUSD8.name() returns (string memory n) {
            name = n;
        } catch {}
        try TUSD8.version() returns (string memory v) {
            version = v;
        } catch {}
    }

    function _separator(string memory name, string memory version) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(TUSD8)
            )
        );
    }

    function test_fork_tokenFacts() public view {
        assertEq(block.chainid, 44005);
        assertEq(TUSD8.decimals(), 6);
        (string memory name, string memory version) = _onchainDomain();
        assertEq(name, "tUSD8");
        assertEq(version, "2");
        assertEq(_separator(name, version), TUSD8.DOMAIN_SEPARATOR());
    }

    function test_fork_depositWithRealPermit() public {
        (string memory name, string memory version) = _onchainDomain();
        bytes32 domain = _separator(name, version);
        assertEq(domain, TUSD8.DOMAIN_SEPARATOR());

        uint256 amt = 2_500 * M;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, employer, address(vault), amt, TUSD8.nonces(employer), deadline));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(employerKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));

        assertEq(TUSD8.allowance(employer, address(vault)), 0);
        vm.prank(employer);
        vault.depositWithPermit(amt, deadline, v, r, s);
        assertEq(vault.treasury(employer), amt);
        assertEq(TUSD8.balanceOf(address(vault)), amt);
        assertEq(TUSD8.nonces(employer), 1);
    }

    function test_fork_permitWithWrongVersionIsRejected() public {
        bytes32 wrong = _separator("tUSD8", "1");
        uint256 amt = 100 * M;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, employer, address(vault), amt, 0, deadline));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(employerKey, keccak256(abi.encodePacked("\x19\x01", wrong, structHash)));
        vm.prank(employer);
        vm.expectRevert(StreamVault.NotAuthorized.selector);
        vault.depositWithPermit(amt, deadline, v, r, s);
    }

    function test_fork_fullPayrollLifecycle() public {
        vm.startPrank(employer);
        TUSD8.approve(address(vault), type(uint256).max);
        vault.deposit(3_000 * M);
        vault.setOperator(agent, 1_000 * M, 1_500 * M, uint40(block.timestamp + 1 days));
        vm.stopPrank();

        uint40 t = uint40(block.timestamp);
        vm.prank(agent);
        uint256 id = vault.createStream(employer, StreamVault.StreamParams(alice, 1_000 * M, t, t, t + 1000, true));

        vm.prank(agent);
        vm.expectRevert(StreamVault.DailyCapExceeded.selector);
        vault.createStream(employer, StreamVault.StreamParams(alice, 600 * M, t, t, t + 1000, true));

        skip(250);
        vault.withdraw(id);
        assertEq(TUSD8.balanceOf(alice), 250 * M);

        uint256 before = TUSD8.balanceOf(employer);
        vm.prank(employer);
        vault.cancel(id);
        assertEq(TUSD8.balanceOf(employer) - before, 750 * M);
        assertEq(TUSD8.balanceOf(address(vault)), 2_000 * M);
    }
}
