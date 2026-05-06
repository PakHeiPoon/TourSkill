// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IIdentityRegistry} from "./IIdentityRegistry.sol";

/// @title  ReputationRegistry — ERC-8004 feedback authorization
/// @notice Stateless authorization for off-chain feedback. The contract
///         tracks "wallet X is authorized to leave feedback for agent Y";
///         the actual feedback content lives off-chain and is verified by
///         indexers using these on-chain authorizations.
/// @dev    Spec: docs/architecture/02_ERC8004_CONTRACT_DESIGN.md §3 +
///         docs/architecture/06_REPUTATION_DESIGN.md.
///
///         Sybil resistance comes from the auto-authorization path:
///         BookingEscrow.release() calls autoAuthorizeFromBooking, which
///         means a reviewer must have *paid for and settled* a booking
///         before they can leave feedback. Manual authorization
///         (acceptFeedback) is the escape hatch for non-paying reviewers
///         (beta testers, press comps); indexers flag those reviews
///         differently in UI.
contract ReputationRegistry {
    // ─── Storage ───────────────────────────────────────────────────────

    IIdentityRegistry public immutable identityRegistry;

    /// @dev Set in constructor. Only this address can call autoAuthorizeFromBooking.
    ///      Cannot be address(0) — Phase A.2 ships a placeholder which is
    ///      replaced when BookingEscrow deploys in Phase B (we redeploy
    ///      ReputationRegistry pointing at the real escrow then; clean
    ///      slate per Principle 4).
    address public immutable bookingEscrow;

    // (serverAgentId, clientAddress) → authorized?
    mapping(uint256 => mapping(address => bool)) private _feedbackAuth;

    // ─── Events ────────────────────────────────────────────────────────

    event FeedbackAuthorized(
        uint256 indexed serverAgentId,
        address indexed clientAddress,
        bool autoFromBooking
    );

    event FeedbackRevoked(
        uint256 indexed serverAgentId,
        address indexed clientAddress
    );

    // ─── Errors ────────────────────────────────────────────────────────

    error AgentNotFound();
    error NotAgentOwner();
    error NotBookingEscrow();
    error ZeroAddress();

    // ─── Constructor ───────────────────────────────────────────────────

    constructor(address identityRegistry_, address bookingEscrow_) {
        if (identityRegistry_ == address(0)) revert ZeroAddress();
        if (bookingEscrow_   == address(0)) revert ZeroAddress();
        identityRegistry = IIdentityRegistry(identityRegistry_);
        bookingEscrow    = bookingEscrow_;
    }

    // ─── Mutating functions ────────────────────────────────────────────

    /// @notice Manually authorize `clientAddress` to leave feedback for the
    ///         agent identified by `serverAgentId`. Caller must own the agent.
    /// @dev    Use case: beta testers, comped press stays — reviewers who
    ///         didn't go through the paid-booking flow but whose feedback
    ///         the merchant wants to allow. Indexers tag these reviews
    ///         with `source: "manual"` so consumers can weigh them
    ///         differently. See docs/architecture/06_REPUTATION_DESIGN.md §9.
    function acceptFeedback(uint256 serverAgentId, address clientAddress) external {
        if (clientAddress == address(0)) revert ZeroAddress();

        IIdentityRegistry.Agent memory a = identityRegistry.getAgent(serverAgentId);
        if (a.owner == address(0))   revert AgentNotFound();
        if (a.owner != msg.sender)   revert NotAgentOwner();

        _feedbackAuth[serverAgentId][clientAddress] = true;
        emit FeedbackAuthorized(serverAgentId, clientAddress, false);
    }

    /// @notice Revoke a previously-granted authorization. Owner-only.
    ///         Idempotent — revoking an already-revoked auth is a no-op.
    function revokeFeedback(uint256 serverAgentId, address clientAddress) external {
        IIdentityRegistry.Agent memory a = identityRegistry.getAgent(serverAgentId);
        if (a.owner == address(0))   revert AgentNotFound();
        if (a.owner != msg.sender)   revert NotAgentOwner();

        _feedbackAuth[serverAgentId][clientAddress] = false;
        emit FeedbackRevoked(serverAgentId, clientAddress);
    }

    /// @notice Called by BookingEscrow on settlement. Idempotent.
    /// @dev    Locked to `bookingEscrow` to prevent any other contract or
    ///         EOA from forging an auto-authorization. The escrow contract
    ///         itself enforces that `payer` is the wallet that funded the
    ///         booking.
    function autoAuthorizeFromBooking(uint256 serverAgentId, address payer) external {
        if (msg.sender != bookingEscrow) revert NotBookingEscrow();
        if (payer == address(0))         revert ZeroAddress();

        // Idempotent: do not emit if already authorized to keep event
        // streams clean for indexers. Re-emit only on first transition.
        if (!_feedbackAuth[serverAgentId][payer]) {
            _feedbackAuth[serverAgentId][payer] = true;
            emit FeedbackAuthorized(serverAgentId, payer, true);
        }
    }

    // ─── Views ─────────────────────────────────────────────────────────

    function isAuthorized(uint256 serverAgentId, address clientAddress)
        external
        view
        returns (bool)
    {
        return _feedbackAuth[serverAgentId][clientAddress];
    }
}
