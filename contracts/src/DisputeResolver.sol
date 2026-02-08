// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPrivateEscrow {
    function resolveDispute(bytes32 contractId, bool clientWins) external;
}

/**
 * @title DisputeResolver
 * @notice Neutral arbitrator contract for PrivateEscrow. Only configured arbitrators can resolve disputes.
 *         Owner can add or remove arbitrators.
 */
contract DisputeResolver {
    address public immutable ESCROW;
    address public owner;
    mapping(address => bool) public arbitrators;

    event DisputeResolved(bytes32 indexed contractId, bool clientWins, address resolvedBy);
    event ArbitratorAdded(address indexed arbitrator);
    event ArbitratorRemoved(address indexed arbitrator);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    constructor(address _escrow, address[] memory _arbitrators) {
        require(_escrow != address(0), "Invalid escrow");
        require(_arbitrators.length > 0, "At least one arbitrator");
        ESCROW = _escrow;
        owner = msg.sender;
        for (uint256 i = 0; i < _arbitrators.length; i++) {
            require(_arbitrators[i] != address(0), "Invalid arbitrator");
            arbitrators[_arbitrators[i]] = true;
            emit ArbitratorAdded(_arbitrators[i]);
        }
    }

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() internal view {
        require(msg.sender == owner, "Not owner");
    }

    modifier onlyArbitrator() {
        _onlyArbitrator();
        _;
    }

    function _onlyArbitrator() internal view {
        require(arbitrators[msg.sender], "Not arbitrator");
    }

    /**
     * @notice Transfer ownership to a new address.
     */
    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnerChanged(previousOwner, newOwner);
    }

    /**
     * @notice Add an arbitrator. Only owner.
     */
    function addArbitrator(address a) external onlyOwner {
        require(a != address(0), "Invalid arbitrator");
        require(!arbitrators[a], "Already arbitrator");
        arbitrators[a] = true;
        emit ArbitratorAdded(a);
    }

    /**
     * @notice Remove an arbitrator. Only owner.
     */
    function removeArbitrator(address a) external onlyOwner {
        require(arbitrators[a], "Not arbitrator");
        arbitrators[a] = false;
        emit ArbitratorRemoved(a);
    }

    /**
     * @notice Resolve a disputed escrow: clientWins true = refund client, false = payout to developer.
     *         Only configured arbitrators can call this.
     */
    function resolveDispute(bytes32 contractId, bool clientWins) external onlyArbitrator {
        IPrivateEscrow(ESCROW).resolveDispute(contractId, clientWins);
        emit DisputeResolved(contractId, clientWins, msg.sender);
    }
}
