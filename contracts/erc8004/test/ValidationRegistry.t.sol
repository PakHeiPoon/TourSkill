// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";

contract ValidationRegistryTest is Test {
    IdentityRegistry   internal identity;
    ValidationRegistry internal validation;

    address internal requesterOwner  = makeAddr("requester");
    address internal validatorOwner  = makeAddr("validator");
    address internal stranger        = makeAddr("stranger");

    uint256 internal requesterAgent;
    uint256 internal validatorAgent;

    bytes32 internal constant DATA_HASH = bytes32(uint256(0xCAFE));

    function setUp() public {
        identity   = new IdentityRegistry();
        validation = new ValidationRegistry(address(identity));

        vm.prank(requesterOwner);
        requesterAgent = identity.register("https://requester.example/c.json", bytes32(uint256(1)));
        vm.prank(validatorOwner);
        validatorAgent = identity.register("https://validator.example/c.json", bytes32(uint256(2)));
    }

    // ─── Constructor ───────────────────────────────────────────────────

    function test_Constructor_RejectsZeroIdentity() public {
        vm.expectRevert(ValidationRegistry.ZeroAddress.selector);
        new ValidationRegistry(address(0));
    }

    function test_Constructor_PinsIdentity() public view {
        assertEq(address(validation.identityRegistry()), address(identity));
    }

    // ─── requestValidation() ───────────────────────────────────────────

    function test_RequestValidation_Works() public {
        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        ValidationRegistry.ValidationRequest memory r = validation.getRequest(id);
        assertEq(r.requesterAgentId, requesterAgent);
        assertEq(r.validatorAgentId, validatorAgent);
        assertEq(r.dataHash, DATA_HASH);
        assertEq(r.requestedAt, block.timestamp);
        assertEq(r.resolvedAt, 0);
        assertEq(r.resultHash, bytes32(0));
        assertFalse(r.accepted);
    }

    function test_RequestValidation_DeterministicId() public {
        bytes32 expected = validation.computeRequestId(requesterAgent, validatorAgent, DATA_HASH);

        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        assertEq(id, expected);
    }

    function test_RequestValidation_EmitsEvent() public {
        bytes32 expected = validation.computeRequestId(requesterAgent, validatorAgent, DATA_HASH);

        vm.expectEmit(true, true, true, true);
        emit ValidationRegistry.ValidationRequested(expected, requesterAgent, validatorAgent, DATA_HASH);

        vm.prank(requesterOwner);
        validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);
    }

    function test_RequestValidation_RejectsEmptyHash() public {
        vm.prank(requesterOwner);
        vm.expectRevert(ValidationRegistry.EmptyHash.selector);
        validation.requestValidation(requesterAgent, validatorAgent, bytes32(0));
    }

    function test_RequestValidation_NonRequesterOwnerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(ValidationRegistry.NotRequesterOwner.selector);
        validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);
    }

    function test_RequestValidation_NonExistentRequesterAgentReverts() public {
        vm.prank(requesterOwner);
        vm.expectRevert(ValidationRegistry.AgentNotFound.selector);
        validation.requestValidation(99999, validatorAgent, DATA_HASH);
    }

    function test_RequestValidation_DuplicateReverts() public {
        vm.prank(requesterOwner);
        validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        vm.prank(requesterOwner);
        vm.expectRevert(ValidationRegistry.RequestExists.selector);
        validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);
    }

    function test_RequestValidation_DifferentDataHashOk() public {
        vm.prank(requesterOwner);
        validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        vm.prank(requesterOwner);
        validation.requestValidation(requesterAgent, validatorAgent, bytes32(uint256(0xBEEF)));

        // Two distinct requests, both stored.
        bytes32 id1 = validation.computeRequestId(requesterAgent, validatorAgent, DATA_HASH);
        bytes32 id2 = validation.computeRequestId(requesterAgent, validatorAgent, bytes32(uint256(0xBEEF)));
        assertGt(validation.getRequest(id1).requestedAt, 0);
        assertGt(validation.getRequest(id2).requestedAt, 0);
    }

    // ─── submitValidation() ────────────────────────────────────────────

    function test_SubmitValidation_Works() public {
        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        bytes32 result = bytes32(uint256(0xBEEF));
        vm.prank(validatorOwner);
        validation.submitValidation(id, result, true);

        ValidationRegistry.ValidationRequest memory r = validation.getRequest(id);
        assertEq(r.resultHash, result);
        assertTrue(r.accepted);
        assertEq(r.resolvedAt, block.timestamp);
    }

    function test_SubmitValidation_AcceptsZeroHashAsNoComment() public {
        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        // resultHash = 0x0 is a valid "no specific evidence" verdict
        vm.prank(validatorOwner);
        validation.submitValidation(id, bytes32(0), false);

        ValidationRegistry.ValidationRequest memory r = validation.getRequest(id);
        assertEq(r.resultHash, bytes32(0));
        assertFalse(r.accepted);
        assertGt(r.resolvedAt, 0, "resolvedAt must mark this resolved even with zero hash");
    }

    function test_SubmitValidation_EmitsEvent() public {
        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        vm.expectEmit(true, false, false, true);
        emit ValidationRegistry.ValidationSubmitted(id, bytes32(uint256(0xDEAD)), true);

        vm.prank(validatorOwner);
        validation.submitValidation(id, bytes32(uint256(0xDEAD)), true);
    }

    function test_SubmitValidation_NonValidatorOwnerReverts() public {
        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        vm.prank(stranger);
        vm.expectRevert(ValidationRegistry.NotValidatorOwner.selector);
        validation.submitValidation(id, bytes32(uint256(1)), true);
    }

    function test_SubmitValidation_RequesterCantSubmit() public {
        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        // Even the requester can't submit — only validator owner can
        vm.prank(requesterOwner);
        vm.expectRevert(ValidationRegistry.NotValidatorOwner.selector);
        validation.submitValidation(id, bytes32(uint256(1)), true);
    }

    function test_SubmitValidation_NonExistentRequestReverts() public {
        vm.prank(validatorOwner);
        vm.expectRevert(ValidationRegistry.RequestNotFound.selector);
        validation.submitValidation(bytes32(uint256(0xDEADBEEF)), bytes32(uint256(1)), true);
    }

    function test_SubmitValidation_AlreadyResolvedReverts() public {
        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        vm.prank(validatorOwner);
        validation.submitValidation(id, bytes32(uint256(1)), true);

        // Second submission must revert
        vm.prank(validatorOwner);
        vm.expectRevert(ValidationRegistry.AlreadyResolved.selector);
        validation.submitValidation(id, bytes32(uint256(2)), false);
    }

    function test_SubmitValidation_NonExistentValidatorAgentReverts() public {
        // requestValidation intentionally does NOT verify the validator
        // exists — gas optimization. So a requester can ask for validation
        // from a fake agent ID. submitValidation then catches it at submit
        // time (covers the AgentNotFound branch in submitValidation).

        uint256 fakeValidatorId = 99999;

        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(
            requesterAgent,
            fakeValidatorId,
            DATA_HASH
        );

        // No matter who calls submit, AgentNotFound fires before owner check
        vm.prank(validatorOwner);
        vm.expectRevert(ValidationRegistry.AgentNotFound.selector);
        validation.submitValidation(id, bytes32(uint256(1)), true);
    }

    // ─── computeRequestId() ────────────────────────────────────────────

    function test_ComputeRequestId_PureAndDeterministic() public view {
        bytes32 a = validation.computeRequestId(1, 2, DATA_HASH);
        bytes32 b = validation.computeRequestId(1, 2, DATA_HASH);
        bytes32 c = validation.computeRequestId(2, 1, DATA_HASH);
        assertEq(a, b, "same inputs == same id");
        assertTrue(a != c, "swapped requester/validator => different id");
    }

    // ─── Fuzz ──────────────────────────────────────────────────────────

    function testFuzz_Submit_OnlyValidatorOwner(address attacker) public {
        vm.assume(attacker != validatorOwner && attacker != address(0));

        vm.prank(requesterOwner);
        bytes32 id = validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);

        vm.prank(attacker);
        vm.expectRevert(ValidationRegistry.NotValidatorOwner.selector);
        validation.submitValidation(id, bytes32(uint256(1)), true);
    }

    function testFuzz_Request_OnlyRequesterOwner(address attacker) public {
        vm.assume(attacker != requesterOwner && attacker != address(0));

        vm.prank(attacker);
        vm.expectRevert(ValidationRegistry.NotRequesterOwner.selector);
        validation.requestValidation(requesterAgent, validatorAgent, DATA_HASH);
    }
}
