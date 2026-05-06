// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IIdentityRegistry} from "./IIdentityRegistry.sol";

/// @title  ValidationRegistry — ERC-8004 work-validation requests
/// @notice One agent (the requester) asks another agent (the validator)
///         to attest that some piece of work / claim satisfies a spec.
///         The result is recorded on chain as a hash + boolean verdict.
/// @dev    Spec: docs/architecture/02_ERC8004_CONTRACT_DESIGN.md §4.
///
///         **v1 status**: deployed but unused. Our reference
///         merchant-agent in Phase A.3 doesn't trigger any validation
///         flows. The contract is on chain so future versions
///         ("verified hotel chain", "city tourism board attestation")
///         don't require redeploying the registry trio.
contract ValidationRegistry {
    // ─── Types ─────────────────────────────────────────────────────────

    struct ValidationRequest {
        uint256 requesterAgentId;
        uint256 validatorAgentId;
        bytes32 dataHash;        // hash of the spec / claim being validated
        uint64  requestedAt;
        bytes32 resultHash;      // hash of validator's response (0x0 if pending)
        bool    accepted;        // validator's verdict (only meaningful when resolved)
        uint64  resolvedAt;      // 0 if pending
    }

    // ─── Storage ───────────────────────────────────────────────────────

    IIdentityRegistry public immutable identityRegistry;

    mapping(bytes32 => ValidationRequest) private _requests;

    // ─── Events ────────────────────────────────────────────────────────

    event ValidationRequested(
        bytes32 indexed requestId,
        uint256 indexed requesterAgentId,
        uint256 indexed validatorAgentId,
        bytes32 dataHash
    );

    event ValidationSubmitted(
        bytes32 indexed requestId,
        bytes32 resultHash,
        bool accepted
    );

    // ─── Errors ────────────────────────────────────────────────────────

    error AgentNotFound();
    error NotValidatorOwner();
    error NotRequesterOwner();
    error RequestExists();
    error RequestNotFound();
    error AlreadyResolved();
    error EmptyHash();
    error ZeroAddress();

    // ─── Constructor ───────────────────────────────────────────────────

    constructor(address identityRegistry_) {
        if (identityRegistry_ == address(0)) revert ZeroAddress();
        identityRegistry = IIdentityRegistry(identityRegistry_);
    }

    // ─── Mutating functions ────────────────────────────────────────────

    /// @notice Open a validation request. Caller must own the requester agent.
    /// @dev    `requestId` is derived deterministically from
    ///         (requester, validator, dataHash) so the same triple cannot
    ///         be re-opened while a prior request is in flight. If the
    ///         caller wants to resubmit a different version of the same
    ///         claim, they vary `dataHash`.
    function requestValidation(
        uint256 requesterAgentId,
        uint256 validatorAgentId,
        bytes32 dataHash
    ) external returns (bytes32 requestId) {
        if (dataHash == bytes32(0)) revert EmptyHash();

        IIdentityRegistry.Agent memory r = identityRegistry.getAgent(requesterAgentId);
        if (r.owner == address(0))   revert AgentNotFound();
        if (r.owner != msg.sender)   revert NotRequesterOwner();

        // We don't check that validator exists here — that's a soft
        // contract: if the validator agent is fake/non-existent, no one
        // can `submitValidation` and the request stays pending forever.
        // The requester self-cleans by not writing one in the first place.
        // Doing the check on-chain would just burn gas.

        requestId = keccak256(abi.encodePacked(requesterAgentId, validatorAgentId, dataHash));
        if (_requests[requestId].requestedAt != 0) revert RequestExists();

        _requests[requestId] = ValidationRequest({
            requesterAgentId: requesterAgentId,
            validatorAgentId: validatorAgentId,
            dataHash:         dataHash,
            requestedAt:      uint64(block.timestamp),
            resultHash:       bytes32(0),
            accepted:         false,
            resolvedAt:       0
        });

        emit ValidationRequested(requestId, requesterAgentId, validatorAgentId, dataHash);
    }

    /// @notice Validator submits their verdict. Only the wallet that owns
    ///         the validator agent can call.
    function submitValidation(
        bytes32 requestId,
        bytes32 resultHash,
        bool accepted
    ) external {
        ValidationRequest storage req = _requests[requestId];
        if (req.requestedAt == 0)  revert RequestNotFound();
        if (req.resolvedAt  != 0)  revert AlreadyResolved();

        IIdentityRegistry.Agent memory v = identityRegistry.getAgent(req.validatorAgentId);
        if (v.owner == address(0)) revert AgentNotFound();
        if (v.owner != msg.sender) revert NotValidatorOwner();

        req.resultHash = resultHash;     // 0x0 is a legal "no comment" verdict
        req.accepted   = accepted;
        req.resolvedAt = uint64(block.timestamp);

        emit ValidationSubmitted(requestId, resultHash, accepted);
    }

    // ─── Views ─────────────────────────────────────────────────────────

    function getRequest(bytes32 requestId) external view returns (ValidationRequest memory) {
        return _requests[requestId];
    }

    /// @notice Convenience: deterministic requestId for a given triple.
    function computeRequestId(
        uint256 requesterAgentId,
        uint256 validatorAgentId,
        bytes32 dataHash
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(requesterAgentId, validatorAgentId, dataHash));
    }
}
