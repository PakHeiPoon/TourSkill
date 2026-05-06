// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    IdentityRegistry   internal identity;
    ReputationRegistry internal reputation;

    // mock booking escrow — we use a plain address since the actual
    // BookingEscrow.sol comes in Phase B. ReputationRegistry only checks
    // msg.sender against this address; it doesn't call back into it.
    address internal escrow = makeAddr("BOOKING_ESCROW_PHASE_B");

    address internal alice  = makeAddr("alice");   // merchant owner
    address internal bob    = makeAddr("bob");     // attacker / non-owner
    address internal carol  = makeAddr("carol");   // booking payer / reviewer

    uint256 internal aliceAgentId;

    string  internal constant URI_A  = "https://wumingchu.example.com/.well-known/agent-card.json";
    bytes32 internal constant HASH_A = bytes32(uint256(0xAAAA));

    function setUp() public {
        identity   = new IdentityRegistry();
        reputation = new ReputationRegistry(address(identity), escrow);

        vm.prank(alice);
        aliceAgentId = identity.register(URI_A, HASH_A);
    }

    // ─── Constructor ───────────────────────────────────────────────────

    function test_Constructor_RejectsZeroIdentity() public {
        vm.expectRevert(ReputationRegistry.ZeroAddress.selector);
        new ReputationRegistry(address(0), escrow);
    }

    function test_Constructor_RejectsZeroEscrow() public {
        vm.expectRevert(ReputationRegistry.ZeroAddress.selector);
        new ReputationRegistry(address(identity), address(0));
    }

    function test_Constructor_PinsImmutables() public view {
        assertEq(address(reputation.identityRegistry()), address(identity));
        assertEq(reputation.bookingEscrow(), escrow);
    }

    // ─── acceptFeedback() ──────────────────────────────────────────────

    function test_AcceptFeedback_OwnerCanAuthorize() public {
        vm.prank(alice);
        reputation.acceptFeedback(aliceAgentId, carol);

        assertTrue(reputation.isAuthorized(aliceAgentId, carol));
    }

    function test_AcceptFeedback_EmitsManualFlag() public {
        vm.expectEmit(true, true, false, true);
        emit ReputationRegistry.FeedbackAuthorized(aliceAgentId, carol, false);

        vm.prank(alice);
        reputation.acceptFeedback(aliceAgentId, carol);
    }

    function test_AcceptFeedback_NonOwnerReverts() public {
        vm.prank(bob);
        vm.expectRevert(ReputationRegistry.NotAgentOwner.selector);
        reputation.acceptFeedback(aliceAgentId, carol);
    }

    function test_AcceptFeedback_NonExistentAgentReverts() public {
        vm.prank(alice);
        vm.expectRevert(ReputationRegistry.AgentNotFound.selector);
        reputation.acceptFeedback(9999, carol);
    }

    function test_AcceptFeedback_ZeroAddressReverts() public {
        vm.prank(alice);
        vm.expectRevert(ReputationRegistry.ZeroAddress.selector);
        reputation.acceptFeedback(aliceAgentId, address(0));
    }

    // ─── revokeFeedback() ──────────────────────────────────────────────

    function test_RevokeFeedback_OwnerCanRevoke() public {
        vm.prank(alice);
        reputation.acceptFeedback(aliceAgentId, carol);
        assertTrue(reputation.isAuthorized(aliceAgentId, carol));

        vm.prank(alice);
        reputation.revokeFeedback(aliceAgentId, carol);
        assertFalse(reputation.isAuthorized(aliceAgentId, carol));
    }

    function test_RevokeFeedback_EmitsEvent() public {
        vm.prank(alice);
        reputation.acceptFeedback(aliceAgentId, carol);

        vm.expectEmit(true, true, false, false);
        emit ReputationRegistry.FeedbackRevoked(aliceAgentId, carol);

        vm.prank(alice);
        reputation.revokeFeedback(aliceAgentId, carol);
    }

    function test_RevokeFeedback_IdempotentNoAuthBefore() public {
        // Revoking an already-unauthorized client should not revert and
        // should still emit (the spec doesn't require dedup on revoke).
        vm.prank(alice);
        reputation.revokeFeedback(aliceAgentId, carol);
        assertFalse(reputation.isAuthorized(aliceAgentId, carol));
    }

    function test_RevokeFeedback_NonOwnerReverts() public {
        vm.prank(alice);
        reputation.acceptFeedback(aliceAgentId, carol);

        vm.prank(bob);
        vm.expectRevert(ReputationRegistry.NotAgentOwner.selector);
        reputation.revokeFeedback(aliceAgentId, carol);
    }

    function test_RevokeFeedback_NonExistentAgentReverts() public {
        vm.prank(alice);
        vm.expectRevert(ReputationRegistry.AgentNotFound.selector);
        reputation.revokeFeedback(7777, carol);
    }

    // ─── autoAuthorizeFromBooking() ────────────────────────────────────

    function test_AutoAuthorize_OnlyEscrowCanCall() public {
        vm.prank(escrow);
        reputation.autoAuthorizeFromBooking(aliceAgentId, carol);
        assertTrue(reputation.isAuthorized(aliceAgentId, carol));
    }

    function test_AutoAuthorize_NonEscrowReverts() public {
        vm.prank(alice);
        vm.expectRevert(ReputationRegistry.NotBookingEscrow.selector);
        reputation.autoAuthorizeFromBooking(aliceAgentId, carol);
    }

    function test_AutoAuthorize_RejectsZeroPayer() public {
        vm.prank(escrow);
        vm.expectRevert(ReputationRegistry.ZeroAddress.selector);
        reputation.autoAuthorizeFromBooking(aliceAgentId, address(0));
    }

    function test_AutoAuthorize_EmitsAutoFlag() public {
        vm.expectEmit(true, true, false, true);
        emit ReputationRegistry.FeedbackAuthorized(aliceAgentId, carol, true);

        vm.prank(escrow);
        reputation.autoAuthorizeFromBooking(aliceAgentId, carol);
    }

    function test_AutoAuthorize_IdempotentNoSecondEmit() public {
        // First call emits.
        vm.prank(escrow);
        reputation.autoAuthorizeFromBooking(aliceAgentId, carol);

        // Second call must NOT emit (per contract: re-authorization is a no-op).
        vm.recordLogs();
        vm.prank(escrow);
        reputation.autoAuthorizeFromBooking(aliceAgentId, carol);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0, "re-auth must not emit");

        // Still authorized.
        assertTrue(reputation.isAuthorized(aliceAgentId, carol));
    }

    /// @dev Critical: a non-existent agent ID would still let the escrow
    ///      auto-authorize. This is by design — the escrow contract
    ///      enforces that the agentId in metadata is a real one before
    ///      calling. Putting that check here too would double-charge gas
    ///      for every settlement. Test confirms current behavior.
    function test_AutoAuthorize_DoesNotValidateAgentExists() public {
        vm.prank(escrow);
        reputation.autoAuthorizeFromBooking(99999, carol);
        assertTrue(reputation.isAuthorized(99999, carol));
    }

    // ─── Cross-agent isolation ─────────────────────────────────────────

    function test_AuthIsPerAgentId() public {
        // Alice owns agent 1. Bob registers agent 2.
        vm.prank(bob);
        uint256 bobAgentId = identity.register("https://bob.example/card.json", bytes32(uint256(0xBBBB)));

        // Alice authorizes carol on her agent.
        vm.prank(alice);
        reputation.acceptFeedback(aliceAgentId, carol);

        // carol is authorized on alice's agent but NOT on bob's.
        assertTrue (reputation.isAuthorized(aliceAgentId, carol));
        assertFalse(reputation.isAuthorized(bobAgentId,   carol));

        // bob can't revoke carol on alice's agent.
        vm.prank(bob);
        vm.expectRevert(ReputationRegistry.NotAgentOwner.selector);
        reputation.revokeFeedback(aliceAgentId, carol);
    }

    // ─── Fuzz: only escrow can auto-authorize ──────────────────────────

    function testFuzz_AutoAuthorize_RejectsAnyNonEscrow(address caller) public {
        vm.assume(caller != escrow && caller != address(0));

        vm.prank(caller);
        vm.expectRevert(ReputationRegistry.NotBookingEscrow.selector);
        reputation.autoAuthorizeFromBooking(aliceAgentId, carol);
    }

    function testFuzz_OnlyOwnerCanManualAuth(address attacker) public {
        vm.assume(attacker != alice && attacker != address(0));

        vm.prank(attacker);
        vm.expectRevert(ReputationRegistry.NotAgentOwner.selector);
        reputation.acceptFeedback(aliceAgentId, carol);

        vm.prank(attacker);
        vm.expectRevert(ReputationRegistry.NotAgentOwner.selector);
        reputation.revokeFeedback(aliceAgentId, carol);

        // Auth state untouched
        assertFalse(reputation.isAuthorized(aliceAgentId, carol));
    }

    // ─── Property: ownership transfer carries authorization power ───

    function test_AuthorityFollowsOwnership() public {
        // Alice authorizes carol.
        vm.prank(alice);
        reputation.acceptFeedback(aliceAgentId, carol);

        // Alice transfers agent to bob.
        vm.prank(alice);
        identity.transferOwnership(aliceAgentId, bob);

        // Now alice can't revoke; bob can.
        vm.prank(alice);
        vm.expectRevert(ReputationRegistry.NotAgentOwner.selector);
        reputation.revokeFeedback(aliceAgentId, carol);

        vm.prank(bob);
        reputation.revokeFeedback(aliceAgentId, carol);
        assertFalse(reputation.isAuthorized(aliceAgentId, carol));
    }
}

