// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title  IIdentityRegistry — minimal external view used by sibling registries
/// @notice ReputationRegistry and ValidationRegistry need to look up an
///         agent's owner without depending on the full IdentityRegistry
///         contract code. We expose just `getAgent` here so siblings can
///         compile against this interface.
interface IIdentityRegistry {
    struct Agent {
        address owner;
        string  agentCardURI;
        bytes32 agentCardHash;
        uint64  registeredAt;
        uint64  updatedAt;
        bool    active;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory);
}
