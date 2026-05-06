// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title  IdentityRegistry — ERC-8004 Trustless Agent identity
/// @notice Canonical "this address owns this agent" record. The single
///         source of truth for who is registered on TourSkill.
/// @dev    Spec: docs/architecture/02_ERC8004_CONTRACT_DESIGN.md §2.
///
///         Storage discipline: only invariants live on chain. The mutable
///         agent profile lives off-chain in agent-card.json (see
///         docs/architecture/03_AGENT_CARD_SPEC.md), and we commit a
///         SHA-256 hash of that file on chain so consumers can detect
///         tampering.
///
///         No proxy. No admin. If we need to fix a bug, we deploy v2
///         alongside and let clients migrate (Principle 4: clean slate
///         over backward-compat).
contract IdentityRegistry {
    // ─── Types ─────────────────────────────────────────────────────────

    struct Agent {
        address owner;            // wallet that controls this agent
        string  agentCardURI;     // off-chain JSON descriptor (HTTPS or IPFS)
        bytes32 agentCardHash;    // SHA-256 of the JSON the URI resolves to
        uint64  registeredAt;     // block timestamp at registration
        uint64  updatedAt;        // block timestamp at last update
        bool    active;           // soft-delete flag (true = visible)
    }

    // ─── Storage ───────────────────────────────────────────────────────

    /// @dev Agent IDs are 1-indexed; 0 is reserved for "unset / not found"
    ///      so callers can use it as a sentinel value.
    mapping(uint256 => Agent) private _agents;
    mapping(address => uint256[]) private _ownerToAgentIds;

    uint256 private _nextAgentId = 1;

    // ─── Events ────────────────────────────────────────────────────────

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        string agentCardURI,
        bytes32 agentCardHash
    );

    event AgentUpdated(
        uint256 indexed agentId,
        string agentCardURI,
        bytes32 agentCardHash
    );

    event AgentActiveChanged(uint256 indexed agentId, bool active);

    event AgentOwnershipTransferred(
        uint256 indexed agentId,
        address indexed previousOwner,
        address indexed newOwner
    );

    // ─── Errors ────────────────────────────────────────────────────────

    error EmptyURI();
    error EmptyHash();
    error NotOwner();
    error AgentNotFound();
    error ZeroAddress();

    // ─── Mutating functions ────────────────────────────────────────────

    /// @notice Register a new agent. Caller becomes the owner.
    /// @param  agentCardURI  HTTPS or IPFS URI to the agent-card JSON
    /// @param  agentCardHash SHA-256 of the canonical JSON bytes the URI returns
    /// @return agentId       The assigned agent ID (always >= 1)
    function register(
        string calldata agentCardURI,
        bytes32 agentCardHash
    ) external returns (uint256 agentId) {
        if (bytes(agentCardURI).length == 0) revert EmptyURI();
        if (agentCardHash == bytes32(0))     revert EmptyHash();

        agentId = _nextAgentId;
        unchecked { _nextAgentId = agentId + 1; }

        _agents[agentId] = Agent({
            owner:          msg.sender,
            agentCardURI:   agentCardURI,
            agentCardHash:  agentCardHash,
            registeredAt:   uint64(block.timestamp),
            updatedAt:      uint64(block.timestamp),
            active:         true
        });
        _ownerToAgentIds[msg.sender].push(agentId);

        emit AgentRegistered(agentId, msg.sender, agentCardURI, agentCardHash);
    }

    /// @notice Update an existing agent's card URI and hash. Owner-only.
    function update(
        uint256 agentId,
        string calldata newURI,
        bytes32 newHash
    ) external {
        if (bytes(newURI).length == 0) revert EmptyURI();
        if (newHash == bytes32(0))     revert EmptyHash();

        Agent storage agent = _agents[agentId];
        if (agent.owner == address(0))  revert AgentNotFound();
        if (agent.owner != msg.sender)  revert NotOwner();

        agent.agentCardURI  = newURI;
        agent.agentCardHash = newHash;
        agent.updatedAt     = uint64(block.timestamp);

        emit AgentUpdated(agentId, newURI, newHash);
    }

    /// @notice Toggle the agent's active flag. Owner-only.
    /// @dev    Inactive agents stay on-chain (history is immutable) but
    ///         indexers/clients hide them from public discovery.
    function setActive(uint256 agentId, bool active_) external {
        Agent storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound();
        if (agent.owner != msg.sender) revert NotOwner();

        agent.active    = active_;
        agent.updatedAt = uint64(block.timestamp);

        emit AgentActiveChanged(agentId, active_);
    }

    /// @notice Transfer ownership of an agent to a new address. Owner-only.
    /// @dev    The new owner inherits the same agentId, agentCardURI, and
    ///         agentCardHash. The previous owner's lookup array still
    ///         contains the agentId until it's pruned on next read by an
    ///         off-chain indexer. We don't compact the array on-chain
    ///         because the gas cost is unbounded; callers should treat
    ///         `getAgentsByOwner` as a hint and verify ownership via
    ///         `getAgent(agentId).owner`.
    function transferOwnership(uint256 agentId, address newOwner) external {
        if (newOwner == address(0)) revert ZeroAddress();

        Agent storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound();
        if (agent.owner != msg.sender) revert NotOwner();

        address previousOwner = agent.owner;
        agent.owner     = newOwner;
        agent.updatedAt = uint64(block.timestamp);
        _ownerToAgentIds[newOwner].push(agentId);

        emit AgentOwnershipTransferred(agentId, previousOwner, newOwner);
    }

    // ─── Views ─────────────────────────────────────────────────────────

    /// @notice Returns the full Agent struct for `agentId`.
    /// @dev    For non-existent IDs, returns a zero-filled struct
    ///         (owner == address(0)). Callers must check.
    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }

    /// @notice Returns the array of agentIds previously associated with `owner`.
    /// @dev    May contain agentIds whose ownership was later transferred away.
    ///         Always cross-check via `getAgent(id).owner` before trusting.
    function getAgentsByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerToAgentIds[owner];
    }

    /// @notice Total number of agents registered. agentIds run from 1 to this.
    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }
}
