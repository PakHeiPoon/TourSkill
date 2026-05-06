// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IdentityRegistry}   from "../src/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";

/// @title  Deploy — one-shot deployment script for all three ERC-8004 registries
/// @notice Run on Base Sepolia first; promote to mainnet only after Phase B
///         (BookingEscrow) is independently audited.
///
/// Usage:
///   export DEPLOYER_PRIVATE_KEY=0x...                # use a hardware wallet for mainnet
///   export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
///   export BASESCAN_API_KEY=...
///
///   # Phase A.2: BookingEscrow doesn't exist yet, so we pass a placeholder
///   # address. Once Phase B deploys BookingEscrow, we redeploy
///   # ReputationRegistry pointing at the real escrow (Principle 4: clean
///   # slate over backward-compat).
///   export BOOKING_ESCROW_PLACEHOLDER=0x000000000000000000000000000000000000dEaD
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url base_sepolia \
///     --broadcast \
///     --verify \
///     -vvv
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Placeholder for Phase A.2 — real BookingEscrow address replaces
        // this when Phase B ships. The placeholder MUST be non-zero
        // (ReputationRegistry rejects zero-address for safety) but it's
        // unreachable so no one can call autoAuthorizeFromBooking until
        // we redeploy. 0x...dEaD is the convention.
        address escrowPlaceholder = vm.envOr(
            "BOOKING_ESCROW_PLACEHOLDER",
            address(0x000000000000000000000000000000000000dEaD)
        );

        vm.startBroadcast(pk);

        IdentityRegistry identity = new IdentityRegistry();
        console2.log("IdentityRegistry  deployed at:", address(identity));

        ReputationRegistry reputation = new ReputationRegistry(
            address(identity),
            escrowPlaceholder
        );
        console2.log("ReputationRegistry deployed at:", address(reputation));

        ValidationRegistry validation = new ValidationRegistry(address(identity));
        console2.log("ValidationRegistry deployed at:", address(validation));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment summary ===");
        console2.log("Network    :", block.chainid);
        console2.log("Identity   :", address(identity));
        console2.log("Reputation :", address(reputation));
        console2.log("Validation :", address(validation));
        console2.log("Escrow plc :", escrowPlaceholder);
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Verify contracts on Basescan (--verify flag should have done this).");
        console2.log("  2. Record addresses in docs/architecture/DEPLOY_ADDRESSES.md");
        console2.log("  3. Update merchant-agent template + frontend with these addresses.");
    }
}
