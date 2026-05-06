// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry internal reg;

    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");
    address internal carol = makeAddr("carol");

    string  internal constant URI_A   = "https://wumingchu.example.com/.well-known/agent-card.json";
    string  internal constant URI_B   = "ipfs://QmExample";
    bytes32 internal constant HASH_A  = bytes32(uint256(0xAAAA));
    bytes32 internal constant HASH_B  = bytes32(uint256(0xBBBB));

    // Topic-0 hashes for explicit `expectEmit` checks; matches the events
    // declared in IdentityRegistry. Computed inline so a future event
    // signature change loudly breaks these tests.
    function setUp() public {
        reg = new IdentityRegistry();
    }

    // ─── register() ────────────────────────────────────────────────────

    function test_Register_AssignsIncrementingIds() public {
        vm.prank(alice);
        uint256 id1 = reg.register(URI_A, HASH_A);
        assertEq(id1, 1, "first agentId must be 1");

        vm.prank(alice);
        uint256 id2 = reg.register(URI_B, HASH_B);
        assertEq(id2, 2, "second agentId must be 2");

        assertEq(reg.totalAgents(), 2);
    }

    function test_Register_StoresStructFields() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        IdentityRegistry.Agent memory a = reg.getAgent(id);
        assertEq(a.owner, alice);
        assertEq(a.agentCardURI, URI_A);
        assertEq(a.agentCardHash, HASH_A);
        assertEq(a.registeredAt, block.timestamp);
        assertEq(a.updatedAt, block.timestamp);
        assertTrue(a.active);
    }

    function test_Register_UpdatesOwnerIndex() public {
        vm.prank(alice);
        reg.register(URI_A, HASH_A);
        vm.prank(alice);
        reg.register(URI_B, HASH_B);

        uint256[] memory ids = reg.getAgentsByOwner(alice);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
    }

    function test_Register_EmitsAgentRegistered() public {
        vm.expectEmit(true, true, false, true);
        emit IdentityRegistry.AgentRegistered(1, alice, URI_A, HASH_A);

        vm.prank(alice);
        reg.register(URI_A, HASH_A);
    }

    function test_Register_RevertsOnEmptyURI() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.EmptyURI.selector);
        reg.register("", HASH_A);
    }

    function test_Register_RevertsOnZeroHash() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.EmptyHash.selector);
        reg.register(URI_A, bytes32(0));
    }

    // ─── update() ──────────────────────────────────────────────────────

    function test_Update_OwnerCanUpdate() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        skip(1 hours);

        vm.prank(alice);
        reg.update(id, URI_B, HASH_B);

        IdentityRegistry.Agent memory a = reg.getAgent(id);
        assertEq(a.agentCardURI, URI_B);
        assertEq(a.agentCardHash, HASH_B);
        assertEq(a.updatedAt, block.timestamp, "updatedAt must advance");
        assertGt(a.updatedAt, a.registeredAt, "updatedAt > registeredAt after skip");
    }

    function test_Update_NonOwnerReverts() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        vm.prank(bob);
        vm.expectRevert(IdentityRegistry.NotOwner.selector);
        reg.update(id, URI_B, HASH_B);
    }

    function test_Update_NonExistentReverts() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.AgentNotFound.selector);
        reg.update(999, URI_B, HASH_B);
    }

    function test_Update_RevertsOnEmptyURI() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.EmptyURI.selector);
        reg.update(id, "", HASH_B);
    }

    function test_Update_RevertsOnZeroHash() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.EmptyHash.selector);
        reg.update(id, URI_B, bytes32(0));
    }

    function test_Update_EmitsAgentUpdated() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        vm.expectEmit(true, false, false, true);
        emit IdentityRegistry.AgentUpdated(id, URI_B, HASH_B);

        vm.prank(alice);
        reg.update(id, URI_B, HASH_B);
    }

    // ─── setActive() ───────────────────────────────────────────────────

    function test_SetActive_OwnerCanToggle() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        vm.prank(alice);
        reg.setActive(id, false);
        assertFalse(reg.getAgent(id).active);

        vm.prank(alice);
        reg.setActive(id, true);
        assertTrue(reg.getAgent(id).active);
    }

    function test_SetActive_NonOwnerReverts() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);
        vm.prank(bob);
        vm.expectRevert(IdentityRegistry.NotOwner.selector);
        reg.setActive(id, false);
    }

    function test_SetActive_NonExistentReverts() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.AgentNotFound.selector);
        reg.setActive(42, false);
    }

    function test_SetActive_EmitsEvent() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        vm.expectEmit(true, false, false, true);
        emit IdentityRegistry.AgentActiveChanged(id, false);

        vm.prank(alice);
        reg.setActive(id, false);
    }

    // ─── transferOwnership() ───────────────────────────────────────────

    function test_TransferOwnership_Works() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        vm.prank(alice);
        reg.transferOwnership(id, bob);

        assertEq(reg.getAgent(id).owner, bob);

        // bob's index now contains id; alice's still does too (we don't
        // compact on-chain — see contract dev note)
        uint256[] memory bobIds   = reg.getAgentsByOwner(bob);
        uint256[] memory aliceIds = reg.getAgentsByOwner(alice);
        assertEq(bobIds.length,   1);
        assertEq(bobIds[0],       id);
        assertEq(aliceIds.length, 1, "alice's index intentionally not compacted");
    }

    function test_TransferOwnership_NewOwnerCanThenUpdate() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);
        vm.prank(alice);
        reg.transferOwnership(id, bob);

        // alice can no longer update
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.NotOwner.selector);
        reg.update(id, URI_B, HASH_B);

        // bob can
        vm.prank(bob);
        reg.update(id, URI_B, HASH_B);
        assertEq(reg.getAgent(id).agentCardURI, URI_B);
    }

    function test_TransferOwnership_NonOwnerReverts() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);
        vm.prank(bob);
        vm.expectRevert(IdentityRegistry.NotOwner.selector);
        reg.transferOwnership(id, carol);
    }

    function test_TransferOwnership_NonExistentReverts() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.AgentNotFound.selector);
        reg.transferOwnership(123, bob);
    }

    function test_TransferOwnership_ZeroAddressReverts() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.ZeroAddress.selector);
        reg.transferOwnership(id, address(0));
    }

    function test_TransferOwnership_EmitsEvent() public {
        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        vm.expectEmit(true, true, true, false);
        emit IdentityRegistry.AgentOwnershipTransferred(id, alice, bob);

        vm.prank(alice);
        reg.transferOwnership(id, bob);
    }

    // ─── views ─────────────────────────────────────────────────────────

    function test_GetAgent_NonExistentReturnsZero() public view {
        IdentityRegistry.Agent memory a = reg.getAgent(99999);
        assertEq(a.owner, address(0));
        assertEq(a.registeredAt, 0);
        assertFalse(a.active);
    }

    function test_GetAgentsByOwner_EmptyReturnsEmpty() public view {
        assertEq(reg.getAgentsByOwner(carol).length, 0);
    }

    function test_TotalAgents_StartsAtZero() public view {
        assertEq(reg.totalAgents(), 0);
    }

    // ─── Fuzz: malicious / boundary inputs ─────────────────────────────

    /// @dev Any non-empty URI + non-zero hash should register cleanly.
    function testFuzz_Register_AcceptsArbitraryNonEmpty(string calldata uri, bytes32 h) public {
        vm.assume(bytes(uri).length > 0 && bytes(uri).length < 4096);
        vm.assume(h != bytes32(0));

        vm.prank(alice);
        uint256 id = reg.register(uri, h);

        IdentityRegistry.Agent memory a = reg.getAgent(id);
        assertEq(a.owner, alice);
        assertEq(a.agentCardHash, h);
        assertEq(keccak256(bytes(a.agentCardURI)), keccak256(bytes(uri)));
    }

    /// @dev Update must always reject zero hash regardless of who calls.
    function testFuzz_Update_RejectsZeroHash(address caller) public {
        vm.assume(caller != address(0));

        vm.prank(caller);
        uint256 id = reg.register(URI_A, HASH_A);

        vm.prank(caller);
        vm.expectRevert(IdentityRegistry.EmptyHash.selector);
        reg.update(id, URI_B, bytes32(0));
    }

    /// @dev No matter how many times we register, the next ID is always
    ///      `prev + 1`. Confirms `_nextAgentId` is monotonic and overflow-
    ///      safe within practical bounds (we won't see 2^256 agents).
    function testFuzz_Register_IdMonotonic(uint8 count) public {
        vm.assume(count > 0);
        for (uint256 i = 0; i < count; i++) {
            vm.prank(alice);
            uint256 id = reg.register(URI_A, HASH_A);
            assertEq(id, i + 1);
        }
        assertEq(reg.totalAgents(), count);
    }

    // ─── Invariant: only owner can mutate ──────────────────────────────

    /// @dev Property test: starting from a registered agent, no caller
    ///      *other than* the owner can change anything observable.
    function testFuzz_OnlyOwnerCanMutate(address attacker) public {
        vm.assume(attacker != address(0) && attacker != alice);

        vm.prank(alice);
        uint256 id = reg.register(URI_A, HASH_A);

        // Snapshot state
        IdentityRegistry.Agent memory before = reg.getAgent(id);

        // Attempt every mutation as attacker — all must revert
        vm.prank(attacker);
        vm.expectRevert(IdentityRegistry.NotOwner.selector);
        reg.update(id, URI_B, HASH_B);

        vm.prank(attacker);
        vm.expectRevert(IdentityRegistry.NotOwner.selector);
        reg.setActive(id, false);

        vm.prank(attacker);
        vm.expectRevert(IdentityRegistry.NotOwner.selector);
        reg.transferOwnership(id, attacker);

        // State unchanged
        IdentityRegistry.Agent memory afterAttack = reg.getAgent(id);
        assertEq(afterAttack.owner,         before.owner);
        assertEq(afterAttack.agentCardHash, before.agentCardHash);
        assertEq(afterAttack.updatedAt,     before.updatedAt);
        assertTrue(afterAttack.active);
    }
}
