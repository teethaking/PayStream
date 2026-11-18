// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StreamVault
/// @notice Payroll and vesting streams in a single stablecoin (tUSD8 on QDay Aevum).
///         Employers fund a treasury (optionally with one EIP-2612 signature), then create
///         cliff + linear streams, singly or as a batch. A human or an AI payroll agent can be
///         granted a scoped, expiring, revocable "operator" role with per-stream and daily spend caps.
///         Operators can only create streams from the employer's treasury; they can never cancel
///         streams or withdraw treasury funds (least privilege).
contract StreamVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types

    struct Stream {
        address sender; // employer / grantor
        address recipient; // employee / beneficiary
        uint128 total; // total amount that will ever vest (shrinks to the vested amount on cancel)
        uint128 withdrawn; // amount already paid out
        uint40 start;
        uint40 cliff; // nothing vests before this timestamp (>= start)
        uint40 end;
        bool cancelable;
        bool canceled;
    }

    struct StreamParams {
        address recipient;
        uint128 amount;
        uint40 start;
        uint40 cliff;
        uint40 end;
        bool cancelable;
    }

    struct Operator {
        uint128 perStreamCap; // max amount for any single stream
        uint128 dailyCap; // max total amount created per UTC day
        uint40 expiry; // operator is invalid at or after this timestamp
        uint40 dayIndex; // day (timestamp / 1 days) that `spentToday` refers to
        uint128 spentToday;
    }

    // ---------------------------------------------------------------- storage

    IERC20 public immutable token;

    uint256 public nextStreamId = 1;
    mapping(uint256 => Stream) private _streams;

    /// @notice Unallocated funds each employer holds in the vault.
    mapping(address => uint256) public treasury;

    mapping(address => mapping(address => Operator)) public operators;

    // ----------------------------------------------------------------- events

    event TreasuryDeposited(address indexed sender, uint256 amount);
    event TreasuryWithdrawn(address indexed sender, uint256 amount);
    event OperatorSet(
        address indexed sender, address indexed operator, uint128 perStreamCap, uint128 dailyCap, uint40 expiry
    );
    event OperatorRevoked(address indexed sender, address indexed operator);
    event StreamCreated(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        uint128 amount,
        uint40 start,
        uint40 cliff,
        uint40 end,
        bool cancelable,
        address createdBy
    );
    event Withdrawn(uint256 indexed id, address indexed recipient, uint128 amount, address triggeredBy);
    event StreamCanceled(uint256 indexed id, address indexed sender, uint128 paidToRecipient, uint128 refunded);

    // ----------------------------------------------------------------- errors

    error ZeroAmount();
    error ZeroAddress();
    error InvalidSchedule();
    error InsufficientTreasury();
    error NotAuthorized();
    error OperatorExpired();
    error PerStreamCapExceeded();
    error DailyCapExceeded();
    error NotCancelable();
    error AlreadyCanceled();
    error NothingToWithdraw();
    error StreamNotFound();

    constructor(IERC20 token_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
    }

    // --------------------------------------------------------------- treasury

    function deposit(uint256 amount) external nonReentrant {
        _deposit(msg.sender, amount);
    }

    /// @notice Fund the treasury with a single signature (no separate approve transaction).
    function depositWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        // A front-run permit would make this call revert; tolerate it if the allowance is already enough.
        try IERC20Permit(address(token)).permit(msg.sender, address(this), amount, deadline, v, r, s) {}
        catch {
            if (token.allowance(msg.sender, address(this)) < amount) revert NotAuthorized();
        }
        _deposit(msg.sender, amount);
    }

    function withdrawTreasury(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (treasury[msg.sender] < amount) revert InsufficientTreasury();
        treasury[msg.sender] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit TreasuryWithdrawn(msg.sender, amount);
    }

    function _deposit(address from, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        treasury[from] += amount;
        token.safeTransferFrom(from, address(this), amount);
        emit TreasuryDeposited(from, amount);
    }

    // -------------------------------------------------------------- operators

    /// @notice Grant (or replace) a scoped payroll operator, e.g. an AI agent's key.
    function setOperator(address operator, uint128 perStreamCap, uint128 dailyCap, uint40 expiry) external {
        if (operator == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert OperatorExpired();
        operators[msg.sender][operator] = Operator({
            perStreamCap: perStreamCap, dailyCap: dailyCap, expiry: expiry, dayIndex: 0, spentToday: 0
        });
        emit OperatorSet(msg.sender, operator, perStreamCap, dailyCap, expiry);
    }

    /// @notice Instantly revoke an operator.
    function revokeOperator(address operator) external {
        delete operators[msg.sender][operator];
        emit OperatorRevoked(msg.sender, operator);
    }

    // ---------------------------------------------------------------- streams

    /// @notice Create one stream funded from `sender`'s treasury. Callable by `sender` or a valid operator.
    function createStream(address sender, StreamParams calldata p) external nonReentrant returns (uint256 id) {
        _authorize(sender, p.amount);
        id = _create(sender, p);
    }

    /// @notice Batch payroll: create many streams in one transaction.
    function createStreams(address sender, StreamParams[] calldata ps)
        external
        nonReentrant
        returns (uint256[] memory ids)
    {
        ids = new uint256[](ps.length);
        for (uint256 i; i < ps.length; ++i) {
            _authorize(sender, ps[i].amount);
            ids[i] = _create(sender, ps[i]);
        }
    }

    function _authorize(address sender, uint128 amount) private {
        if (msg.sender == sender) return;
        Operator storage op = operators[sender][msg.sender];
        if (op.expiry == 0) revert NotAuthorized();
        if (block.timestamp >= op.expiry) revert OperatorExpired();
        if (amount > op.perStreamCap) revert PerStreamCapExceeded();

        uint40 today = uint40(block.timestamp / 1 days);
        uint128 spent = op.dayIndex == today ? op.spentToday : 0;
        if (uint256(spent) + amount > op.dailyCap) revert DailyCapExceeded();
        op.dayIndex = today;
        op.spentToday = spent + amount;
    }

    function _create(address sender, StreamParams calldata p) private returns (uint256 id) {
        if (p.recipient == address(0)) revert ZeroAddress();
        if (p.amount == 0) revert ZeroAmount();
        if (p.end <= p.start || p.cliff < p.start || p.cliff > p.end) revert InvalidSchedule();
        if (treasury[sender] < p.amount) revert InsufficientTreasury();

        treasury[sender] -= p.amount;
        id = nextStreamId++;
        _streams[id] = Stream({
            sender: sender,
            recipient: p.recipient,
            total: p.amount,
            withdrawn: 0,
            start: p.start,
            cliff: p.cliff,
            end: p.end,
            cancelable: p.cancelable,
            canceled: false
        });
        emit StreamCreated(
            id, sender, p.recipient, p.amount, p.start, p.cliff, p.end, p.cancelable, msg.sender
        );
    }

    // ------------------------------------------------------------- withdrawals

    /// @notice Pay out everything currently vested. Anyone may trigger it (keepers, gasless relays);
    ///         funds always go to the recipient.
    function withdraw(uint256 id) external nonReentrant returns (uint128 amount) {
        Stream storage s = _get(id);
        amount = _vested(s) - s.withdrawn;
        if (amount == 0) revert NothingToWithdraw();
        s.withdrawn += amount;
        token.safeTransfer(s.recipient, amount);
        emit Withdrawn(id, s.recipient, amount, msg.sender);
    }

    /// @notice Employer cancels: the vested part stays claimable by the recipient, the rest is refunded.
    function cancel(uint256 id) external nonReentrant {
        Stream storage s = _get(id);
        if (msg.sender != s.sender) revert NotAuthorized();
        if (!s.cancelable) revert NotCancelable();
        if (s.canceled) revert AlreadyCanceled();

        uint128 vested = _vested(s);
        uint128 refund = s.total - vested;
        s.total = vested;
        s.canceled = true;

        if (refund > 0) token.safeTransfer(s.sender, refund);
        emit StreamCanceled(id, s.sender, vested - s.withdrawn, refund);
    }

    // ------------------------------------------------------------------ views

    function getStream(uint256 id) external view returns (Stream memory) {
        return _get(id);
    }

    function vestedOf(uint256 id) external view returns (uint128) {
        return _vested(_get(id));
    }

    function withdrawableOf(uint256 id) external view returns (uint128) {
        Stream storage s = _get(id);
        return _vested(s) - s.withdrawn;
    }

    function _get(uint256 id) private view returns (Stream storage s) {
        s = _streams[id];
        if (s.sender == address(0)) revert StreamNotFound();
    }

    function _vested(Stream storage s) private view returns (uint128) {
        if (s.canceled) return s.total; // total was shrunk to the vested amount at cancel time
        if (block.timestamp < s.cliff) return 0;
        if (block.timestamp >= s.end) return s.total;
        // total * elapsed / duration; cannot overflow in uint256 for uint128 total and uint40 times
        return uint128((uint256(s.total) * (block.timestamp - s.start)) / (s.end - s.start));
    }
}
