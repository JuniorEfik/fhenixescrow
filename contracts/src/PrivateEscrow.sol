// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint32, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint32, InEuint128} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PrivateEscrow
 * @notice Escrow with FHE-encrypted terms (amount, milestones). Uses cofhe-contracts only.
 */
contract PrivateEscrow is ReentrancyGuard {
    enum State {
        DRAFT,
        SIGNED,
        FUNDED,
        IN_PROGRESS,
        COMPLETED,
        DISPUTED,
        CANCELLED,
        PAID_OUT
    }

    struct EscrowContract {
        address client;
        address developer;
        State state;
        uint256 deadline;           // plaintext for block.timestamp comparison
        uint256 balance;            // wei held
        uint256 createdAt;
        bool clientSigned;
        bool developerSigned;
        uint256 milestoneCount;
        uint256 approvedCount;
        address judge;              // dispute resolver
        bool disputeResolved;
        bool clientWinsDispute;
    }

    struct Milestone {
        bool submitted;
        bool approved;
        uint256 submittedAt;
    }

    uint256 private _createNonce;
    mapping(bytes32 => EscrowContract) public contracts;
    mapping(bytes32 => mapping(uint256 => Milestone)) public milestones;
    // Encrypted terms: contractId => encrypted total payment (euint128)
    mapping(bytes32 => euint128) private _encryptedTotal;
    // Encrypted milestone amounts (portion of payment) per contract, index
    mapping(bytes32 => mapping(uint256 => euint32)) private _encryptedMilestoneAmounts;
    // Milestone description (plaintext; encrypted storage can be added per Fhenix integration doc)
    mapping(bytes32 => mapping(uint256 => string)) public milestoneDescriptions;
    // Optional comment when the non-creator marks a milestone as completed
    mapping(bytes32 => mapping(uint256 => string)) public milestoneCompletionComments;
    // Propose/discuss: messages only in DRAFT; both parties can post
    mapping(bytes32 => uint256) public discussionMessageCount;
    mapping(bytes32 => mapping(uint256 => address)) public discussionSenders;
    mapping(bytes32 => mapping(uint256 => string)) public discussionMessages;
    // Usernames: optional display name per address (anyone can set their own)
    mapping(address => string) public usernames;
    // Resolve username to address (keccak256(username) => address; set when user sets username)
    mapping(bytes32 => address) public addressByUsernameHash;
    // Invites: claimable link until someone accepts; accepter can bail before both sign
    uint256 private _inviteNonce;
    mapping(bytes32 => address) public inviteCreator;
    mapping(bytes32 => bool) public inviteIsClientSide;
    mapping(bytes32 => address) public inviteAcceptedBy;
    mapping(bytes32 => bytes32) public inviteContractId;
    mapping(bytes32 => bytes32) public contractToInvite;
    mapping(bytes32 => euint128) private _inviteEncryptedTotal;
    // Cancel requests (before cancelContract)
    mapping(bytes32 => bool) private _clientCancelRequested;
    mapping(bytes32 => bool) private _developerCancelRequested;
    // Index: list of contract ids per user (client or developer)
    mapping(address => uint256) public userContractCount;
    mapping(address => mapping(uint256 => bytes32)) public userContractIds;
    // Who created the contract (only they can set deadline)
    mapping(bytes32 => address) public contractCreator;
    // Optional default judge (e.g. DisputeResolver contract); set once via setDefaultJudge. Used when raising a dispute if c.judge is 0.
    address public defaultJudge;
    // Required funding amount (wei) per contract; must be sent exactly in fundEscrow.
    mapping(bytes32 => uint256) public requiredFundAmount;
    // Required amount for invites; copied to requiredFundAmount when invite is accepted.
    mapping(bytes32 => uint256) private _inviteRequiredAmount;

    event ContractCreated(bytes32 indexed contractId, address client, address developer);
    event TermsSet(bytes32 indexed contractId);
    event ContractSigned(bytes32 indexed contractId, address signer);
    event EscrowFunded(bytes32 indexed contractId, uint256 amount);
    event MilestoneSubmitted(bytes32 indexed contractId, uint256 milestoneIndex);
    event MilestoneApproved(bytes32 indexed contractId, uint256 milestoneIndex);
    event MilestoneRejected(bytes32 indexed contractId, uint256 milestoneIndex);
    event PayoutClaimed(bytes32 indexed contractId, address developer, uint256 amount);
    event DisputeRaised(bytes32 indexed contractId, address raisedBy);
    event DisputeResolved(bytes32 indexed contractId, bool clientWins);
    event ContractCancelled(bytes32 indexed contractId);
    event RefundClaimed(bytes32 indexed contractId, address client, uint256 amount);
    event DiscussionMessage(bytes32 indexed contractId, uint256 indexed index, address indexed sender);
    event UsernameSet(address indexed user, string username);
    event InviteCreated(bytes32 indexed inviteId, address creator, bool isClientSide);
    event InviteAccepted(bytes32 indexed inviteId, address accepter, bytes32 contractId);
    event InviteBailed(bytes32 indexed inviteId, address who);

    modifier onlyParty(bytes32 contractId) {
        _onlyParty(contractId);
        _;
    }

    function _onlyParty(bytes32 contractId) internal view {
        EscrowContract storage c = contracts[contractId];
        require(
            msg.sender == c.client || msg.sender == c.developer,
            "Not a party"
        );
    }

    modifier onlyClient(bytes32 contractId) {
        _onlyClient(contractId);
        _;
    }

    function _onlyClient(bytes32 contractId) internal view {
        require(contracts[contractId].client == msg.sender, "Not client");
    }

    modifier onlyDeveloper(bytes32 contractId) {
        _onlyDeveloper(contractId);
        _;
    }

    function _onlyDeveloper(bytes32 contractId) internal view {
        require(contracts[contractId].developer == msg.sender, "Not developer");
    }

    modifier onlyCreator(bytes32 contractId) {
        _onlyCreator(contractId);
        _;
    }

    function _onlyCreator(bytes32 contractId) internal view {
        require(contractCreator[contractId] == msg.sender, "Not creator");
    }

    modifier onlyNonCreator(bytes32 contractId) {
        _onlyNonCreator(contractId);
        _;
    }

    function _onlyNonCreator(bytes32 contractId) internal view {
        EscrowContract storage c = contracts[contractId];
        require(msg.sender == c.client || msg.sender == c.developer, "Not a party");
        require(msg.sender != contractCreator[contractId], "Only the other party");
    }

    modifier atState(bytes32 contractId, State s) {
        _atState(contractId, s);
        _;
    }

    function _atState(bytes32 contractId, State s) internal view {
        require(contracts[contractId].state == s, "Wrong state");
    }

    /**
     * @notice Create a new escrow (client- or developer-initiated). Contract id is a hash (unpredictable).
     * @param requiredAmountWei Exact amount (wei) the client must send in fundEscrow; must match the encrypted total.
     */
    function createContract(
        address client,
        address developer,
        InEuint128 calldata encryptedTotal,
        uint256 requiredAmountWei
    ) external returns (bytes32 contractId) {
        require(requiredAmountWei > 0, "Zero required amount");
        euint128 encTotal = FHE.asEuint128(encryptedTotal);
        contractId = _createContract(client, developer, encTotal, requiredAmountWei);
        contractCreator[contractId] = msg.sender;
        return contractId;
    }

    function _createContract(
        address client,
        address developer,
        euint128 encTotal,
        uint256 requiredAmountWei
    ) internal returns (bytes32 contractId) {
        require(client != address(0) && developer != address(0) && client != developer, "Invalid parties");
        contractId = keccak256(abi.encodePacked(client, developer, _createNonce++));
        EscrowContract storage c = contracts[contractId];
        c.client = client;
        c.developer = developer;
        c.state = State.DRAFT;
        c.createdAt = block.timestamp;
        c.judge = address(0);

        _encryptedTotal[contractId] = encTotal;
        requiredFundAmount[contractId] = requiredAmountWei;
        FHE.allowThis(encTotal);
        FHE.allow(encTotal, client);
        FHE.allow(encTotal, developer);

        userContractIds[client][userContractCount[client]] = contractId;
        userContractCount[client]++;
        userContractIds[developer][userContractCount[developer]] = contractId;
        userContractCount[developer]++;

        emit ContractCreated(contractId, client, developer);
        return contractId;
    }

    /**
     * @notice Create a claimable invite link. Creator sets terms (encrypted total and required amount). When someone accepts, they become the other party.
     * @param isClientSide true = creator is client (looking for developer); false = creator is developer (looking for client).
     * @param requiredAmountWei Exact amount (wei) the client must send in fundEscrow when the contract is created from this invite.
     */
    function createInvite(
        bool isClientSide,
        InEuint128 calldata encryptedTotal,
        uint256 requiredAmountWei
    ) external returns (bytes32 inviteId) {
        require(requiredAmountWei > 0, "Zero required amount");
        inviteId = keccak256(abi.encodePacked(msg.sender, isClientSide, _inviteNonce++));
        require(inviteCreator[inviteId] == address(0), "Invite exists");
        inviteCreator[inviteId] = msg.sender;
        inviteIsClientSide[inviteId] = isClientSide;
        euint128 encTotal = FHE.asEuint128(encryptedTotal);
        _inviteEncryptedTotal[inviteId] = encTotal;
        _inviteRequiredAmount[inviteId] = requiredAmountWei;
        FHE.allowThis(encTotal);
        emit InviteCreated(inviteId, msg.sender, isClientSide);
        return inviteId;
    }

    /**
     * @notice Accept an invite; you become the other party and a contract is created. Only one accepter per invite until they bail.
     */
    function acceptInvite(bytes32 inviteId) external returns (bytes32 contractId) {
        require(inviteCreator[inviteId] != address(0), "Invite does not exist");
        require(inviteAcceptedBy[inviteId] == address(0), "Already accepted");
        address creator = inviteCreator[inviteId];
        bool isClientSide = inviteIsClientSide[inviteId];
        address client = isClientSide ? creator : msg.sender;
        address developer = isClientSide ? msg.sender : creator;
        euint128 encTotal = _inviteEncryptedTotal[inviteId];
        uint256 requiredWei = _inviteRequiredAmount[inviteId];
        contractId = _createContract(client, developer, encTotal, requiredWei);
        contractCreator[contractId] = creator;
        inviteAcceptedBy[inviteId] = msg.sender;
        inviteContractId[inviteId] = contractId;
        contractToInvite[contractId] = inviteId;
        emit InviteAccepted(inviteId, msg.sender, contractId);
        return contractId;
    }

    /**
     * @notice Bail out of an invite before both parties sign. Frees the invite so someone else can accept. Contract is set to CANCELLED.
     */
    function bailOutInvite(bytes32 inviteId) external {
        require(inviteAcceptedBy[inviteId] == msg.sender, "Not the accepter");
        bytes32 cid = inviteContractId[inviteId];
        require(cid != bytes32(0), "No contract");
        EscrowContract storage c = contracts[cid];
        require(c.state == State.DRAFT, "Not draft");
        require(!(c.clientSigned && c.developerSigned), "Already both signed");
        c.state = State.CANCELLED;
        inviteAcceptedBy[inviteId] = address(0);
        inviteContractId[inviteId] = bytes32(0);
        contractToInvite[cid] = bytes32(0);
        emit InviteBailed(inviteId, msg.sender);
    }

    /**
     * @notice Set deadline. Only the address that created the contract can set it.
     */
    function setTerms(
        bytes32 contractId,
        uint256 deadline
    ) external atState(contractId, State.DRAFT) {
        require(msg.sender == contractCreator[contractId], "Only creator can set deadline");
        require(deadline > block.timestamp, "Deadline must be in future");
        contracts[contractId].deadline = deadline;
        emit TermsSet(contractId);
    }

    /**
     * @notice Add an encrypted milestone (encrypted amount = portion of payment) with description. Creator only.
     */
    function addMilestone(
        bytes32 contractId,
        InEuint32 calldata encryptedAmount,
        string calldata description
    ) external onlyCreator(contractId) atState(contractId, State.DRAFT) {
        EscrowContract storage c = contracts[contractId];
        uint256 idx = c.milestoneCount;
        euint32 encAmt = FHE.asEuint32(encryptedAmount);
        _encryptedMilestoneAmounts[contractId][idx] = encAmt;
        FHE.allowThis(encAmt);
        FHE.allow(encAmt, c.client);
        FHE.allow(encAmt, c.developer);
        milestoneDescriptions[contractId][idx] = description;
        c.milestoneCount++;
    }

    /**
     * @notice Update a milestone (amount and/or description) before contract is signed. Creator only.
     */
    function updateMilestone(
        bytes32 contractId,
        uint256 milestoneIndex,
        InEuint32 calldata encryptedAmount,
        string calldata description
    ) external onlyCreator(contractId) atState(contractId, State.DRAFT) {
        EscrowContract storage c = contracts[contractId];
        require(milestoneIndex < c.milestoneCount, "Invalid milestone");
        euint32 encAmt = FHE.asEuint32(encryptedAmount);
        _encryptedMilestoneAmounts[contractId][milestoneIndex] = encAmt;
        FHE.allowThis(encAmt);
        FHE.allow(encAmt, c.client);
        FHE.allow(encAmt, c.developer);
        milestoneDescriptions[contractId][milestoneIndex] = description;
    }

    /**
     * @notice Remove the last milestone (before contract is signed). Creator only.
     */
    function removeLastMilestone(bytes32 contractId) external onlyCreator(contractId) atState(contractId, State.DRAFT) {
        EscrowContract storage c = contracts[contractId];
        require(c.milestoneCount > 0, "No milestones");
        uint256 idx = c.milestoneCount - 1;
        delete milestoneDescriptions[contractId][idx];
        c.milestoneCount--;
        // Encrypted amount slot remains but is out of count
    }

    /**
     * @notice Add a discussion message (propose/discuss milestones before signing). Both parties, DRAFT only.
     */
    function addDiscussionMessage(bytes32 contractId, string calldata message) external onlyParty(contractId) atState(contractId, State.DRAFT) {
        require(bytes(message).length > 0 && bytes(message).length <= 500, "Invalid message length");
        uint256 idx = discussionMessageCount[contractId]++;
        discussionSenders[contractId][idx] = msg.sender;
        discussionMessages[contractId][idx] = message;
        emit DiscussionMessage(contractId, idx, msg.sender);
    }

    /// @dev Normalize to lowercase for case-insensitive uniqueness (0x41-0x5A -> 0x61-0x7A).
    function _toLower(bytes memory b) internal pure returns (bytes memory) {
        bytes memory out = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            out[i] = (c >= 0x41 && c <= 0x5A) ? bytes1(c + 32) : bytes1(c);
        }
        return out;
    }

    /**
     * @notice Set or update your display username (max 32 chars, letters and numbers only). Leading @ is stripped.
     *         Usernames are unique across all users (case-insensitive); reverts with "Username already taken" if taken.
     */
    function setUsername(string calldata username) external {
        bytes calldata b = bytes(username);
        require(b.length > 0 && b.length <= 33, "Length 1-32");
        uint256 start = 0;
        if (b[0] == 0x40) start = 1; // strip leading @
        require(b.length > start, "Empty after @");
        uint256 len = b.length - start;
        require(len <= 32, "Max 32 characters");
        bytes memory toStore = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            uint8 c = uint8(b[start + i]);
            require((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A), "Only letters and numbers");
            toStore[i] = b[start + i];
        }
        bytes memory keyLower = _toLower(toStore);
        bytes32 keyHash = keccak256(keyLower);
        address currentOwner = addressByUsernameHash[keyHash];
        require(currentOwner == address(0) || currentOwner == msg.sender, "Username already taken");
        string memory oldName = usernames[msg.sender];
        if (bytes(oldName).length > 0) {
            addressByUsernameHash[keccak256(_toLower(bytes(oldName)))] = address(0);
        }
        string memory s = string(toStore);
        usernames[msg.sender] = s;
        addressByUsernameHash[keyHash] = msg.sender;
        emit UsernameSet(msg.sender, s);
    }

    /**
     * @notice Resolve a username to an address (if set on-chain). Case-insensitive. Leading @ in input is ignored.
     */
    function getAddressByUsername(string calldata username) external view returns (address) {
        bytes calldata b = bytes(username);
        if (b.length == 0) return address(0);
        uint256 start = b[0] == 0x40 ? 1 : 0;
        if (b.length <= start) return address(0);
        bytes memory key = new bytes(b.length - start);
        for (uint256 i = 0; i < key.length; i++) key[i] = b[start + i];
        return addressByUsernameHash[keccak256(_toLower(key))];
    }

    /**
     * @notice Client or developer signs the contract. If creator never set a deadline, it defaults to 3 days from when the second party signs.
     */
    function signContract(bytes32 contractId) external onlyParty(contractId) atState(contractId, State.DRAFT) {
        EscrowContract storage c = contracts[contractId];
        require(c.milestoneCount > 0, "Add at least one milestone before signing");
        if (msg.sender == c.client) {
            require(!c.clientSigned, "Already signed");
            c.clientSigned = true;
        } else {
            require(!c.developerSigned, "Already signed");
            c.developerSigned = true;
        }
        if (c.clientSigned && c.developerSigned) {
            if (c.deadline == 0) {
                c.deadline = block.timestamp + 3 days;
            }
            c.state = State.SIGNED;
        }
        emit ContractSigned(contractId, msg.sender);
    }

    /**
     * @notice Client funds the escrow. Amount must equal the agreed total (requiredFundAmount).
     */
    function fundEscrow(bytes32 contractId) external payable onlyClient(contractId) atState(contractId, State.SIGNED) nonReentrant {
        require(requiredFundAmount[contractId] > 0, "No required amount set");
        require(msg.value == requiredFundAmount[contractId], "Amount must match agreed total");
        EscrowContract storage c = contracts[contractId];
        c.balance += msg.value;
        c.state = State.FUNDED;
        emit EscrowFunded(contractId, msg.value);
    }

    /**
     * @notice Developer marks a milestone as completed. Optional comment (max 500 chars).
     */
    function submitMilestone(bytes32 contractId, uint256 milestoneIndex, string calldata comment) external onlyDeveloper(contractId) {
        EscrowContract storage c = contracts[contractId];
        require(c.state == State.FUNDED || c.state == State.IN_PROGRESS, "Wrong state");
        if (c.state == State.FUNDED) c.state = State.IN_PROGRESS;
        require(milestoneIndex < c.milestoneCount, "Invalid milestone");
        Milestone storage m = milestones[contractId][milestoneIndex];
        require(!m.submitted, "Already submitted");
        m.submitted = true;
        m.submittedAt = block.timestamp;
        if (bytes(comment).length > 0) {
            require(bytes(comment).length <= 500, "Comment max 500 chars");
            milestoneCompletionComments[contractId][milestoneIndex] = comment;
        }
        emit MilestoneSubmitted(contractId, milestoneIndex);
    }

    /**
     * @notice Client approves a submitted milestone.
     */
    function approveMilestone(bytes32 contractId, uint256 milestoneIndex) external onlyClient(contractId) {
        EscrowContract storage c = contracts[contractId];
        require(c.state == State.IN_PROGRESS || c.state == State.COMPLETED, "Wrong state");
        require(milestoneIndex < c.milestoneCount, "Invalid milestone");
        Milestone storage m = milestones[contractId][milestoneIndex];
        require(m.submitted && !m.approved, "Not submitted or already approved");
        m.approved = true;
        c.approvedCount++;
        if (c.approvedCount == c.milestoneCount) {
            c.state = State.COMPLETED;
        }
        emit MilestoneApproved(contractId, milestoneIndex);
    }

    /**
     * @notice Client rejects a submitted milestone (not up to satisfaction). The developer can resubmit.
     */
    function rejectMilestone(bytes32 contractId, uint256 milestoneIndex) external onlyClient(contractId) {
        EscrowContract storage c = contracts[contractId];
        require(c.state == State.IN_PROGRESS || c.state == State.COMPLETED, "Wrong state");
        require(milestoneIndex < c.milestoneCount, "Invalid milestone");
        Milestone storage m = milestones[contractId][milestoneIndex];
        require(m.submitted && !m.approved, "Not submitted or already approved");
        m.submitted = false;
        m.submittedAt = 0;
        delete milestoneCompletionComments[contractId][milestoneIndex];
        emit MilestoneRejected(contractId, milestoneIndex);
    }

    /**
     * @notice Developer claims full payout when all milestones are approved.
     */
    function claimPayout(bytes32 contractId) external onlyDeveloper(contractId) atState(contractId, State.COMPLETED) nonReentrant {
        EscrowContract storage c = contracts[contractId];
        require(c.approvedCount == c.milestoneCount && c.milestoneCount > 0, "Not all approved");
        uint256 amount = c.balance;
        c.balance = 0;
        c.state = State.PAID_OUT;
        (bool ok,) = c.developer.call{value: amount}("");
        require(ok, "Transfer failed");
        emit PayoutClaimed(contractId, c.developer, amount);
    }

    /**
     * @notice Set the default judge (e.g. DisputeResolver contract address). Call once after deploying DisputeResolver.
     *         When a dispute is raised, if judge is not yet set, it becomes defaultJudge if set, else the raiser.
     */
    function setDefaultJudge(address judge) external {
        require(defaultJudge == address(0), "Already set");
        require(judge != address(0), "Invalid judge");
        defaultJudge = judge;
    }

    /**
     * @notice Either party can raise a dispute. Judge is defaultJudge if set, otherwise the raiser.
     */
    function raiseDispute(bytes32 contractId) external onlyParty(contractId) {
        EscrowContract storage c = contracts[contractId];
        require(c.state != State.CANCELLED && c.state != State.PAID_OUT && c.state != State.DISPUTED, "Cannot dispute");
        c.state = State.DISPUTED;
        if (c.judge == address(0)) {
            c.judge = defaultJudge != address(0) ? defaultJudge : msg.sender;
        }
        emit DisputeRaised(contractId, msg.sender);
    }

    /**
     * @notice Judge resolves dispute: clientWins true = refund client, false = payout to developer.
     */
    function resolveDispute(bytes32 contractId, bool clientWins) external nonReentrant {
        EscrowContract storage c = contracts[contractId];
        require(c.state == State.DISPUTED, "Not in dispute");
        require(msg.sender == c.judge || c.judge == address(0), "Not judge");
        c.disputeResolved = true;
        c.clientWinsDispute = clientWins;
        uint256 amount = c.balance;
        c.balance = 0;
        if (clientWins) {
            (bool ok,) = c.client.call{value: amount}("");
            require(ok, "Refund failed");
        } else {
            (bool ok,) = c.developer.call{value: amount}("");
            require(ok, "Payout failed");
        }
        c.state = State.CANCELLED;
        emit DisputeResolved(contractId, clientWins);
    }

    function requestCancel(bytes32 contractId) external onlyParty(contractId) {
        EscrowContract storage c = contracts[contractId];
        require(c.state == State.DRAFT || c.state == State.SIGNED || c.state == State.FUNDED || c.state == State.IN_PROGRESS, "Cannot cancel");
        if (msg.sender == c.client) _clientCancelRequested[contractId] = true;
        else _developerCancelRequested[contractId] = true;
    }

    function clientCancelRequested(bytes32 contractId) external view returns (bool) {
        return _clientCancelRequested[contractId];
    }

    function developerCancelRequested(bytes32 contractId) external view returns (bool) {
        return _developerCancelRequested[contractId];
    }

    function cancelContract(bytes32 contractId) external onlyParty(contractId) nonReentrant {
        EscrowContract storage c = contracts[contractId];
        require(_clientCancelRequested[contractId] && _developerCancelRequested[contractId], "Both must request cancel");
        require(c.state != State.CANCELLED && c.state != State.PAID_OUT, "Wrong state");
        uint256 amount = c.balance;
        c.balance = 0;
        c.state = State.CANCELLED;
        _clientCancelRequested[contractId] = false;
        _developerCancelRequested[contractId] = false;
        if (amount > 0) {
            (bool ok,) = c.client.call{value: amount}("");
            require(ok, "Refund failed");
            emit RefundClaimed(contractId, c.client, amount);
        }
        emit ContractCancelled(contractId);
    }

    /**
     * @notice Client claims refund after deadline has passed and not all milestones completed.
     */
    function claimRefund(bytes32 contractId) external onlyClient(contractId) nonReentrant {
        EscrowContract storage c = contracts[contractId];
        require(block.timestamp >= c.deadline, "Deadline not passed");
        require(c.state == State.FUNDED || c.state == State.IN_PROGRESS, "Wrong state");
        require(c.approvedCount < c.milestoneCount, "All milestones done");
        uint256 amount = c.balance;
        c.balance = 0;
        c.state = State.CANCELLED;
        (bool ok,) = c.client.call{value: amount}("");
        require(ok, "Refund failed");
        emit RefundClaimed(contractId, c.client, amount);
    }

    /**
     * @notice Get encrypted total payment for a contract (for client/developer to decrypt off-chain).
     */
    function getEncryptedTotal(bytes32 contractId) external view onlyParty(contractId) returns (euint128) {
        return _encryptedTotal[contractId];
    }

    /**
     * @notice Get encrypted milestone amount at index.
     */
    function getEncryptedMilestoneAmount(bytes32 contractId, uint256 index) external view onlyParty(contractId) returns (euint32) {
        return _encryptedMilestoneAmounts[contractId][index];
    }

    function getContract(bytes32 contractId) external view returns (
        address client,
        address developer,
        State state,
        uint256 deadline,
        uint256 balance,
        uint256 createdAt,
        bool clientSigned,
        bool developerSigned,
        uint256 milestoneCount,
        uint256 approvedCount
    ) {
        EscrowContract storage c = contracts[contractId];
        require(c.client != address(0), "Contract does not exist");
        return (
            c.client,
            c.developer,
            c.state,
            c.deadline,
            c.balance,
            c.createdAt,
            c.clientSigned,
            c.developerSigned,
            c.milestoneCount,
            c.approvedCount
        );
    }
}
