# Build, Deploy & Use

## 1. Build (compile)

**Install Foundry** (one-time):

```bash
curl -sL https://foundry.paradigm.xyz | bash
# Then start a new terminal or run:
source ~/.bashrc
foundryup
```

**Build the contracts:**

```bash
cd contracts
npm install   # for @fhenixprotocol/cofhe-contracts and OpenZeppelin
export PATH="$HOME/.foundry/bin:$PATH"   # if forge not in PATH
forge build
```

This compiles `PrivateEscrow.sol` and `DisputeResolver.sol`.

If you get “Stack too deep”, the project is already configured with `via_ir = true` and `optimizer = true` in `foundry.toml`; just run `forge build` again.

---

## 2. Deploy

### 2.1 Set up `contracts/.env`

```bash
cd contracts
cp .env.example .env
```

Edit `contracts/.env`: set `RPC_URL` (e.g. `https://api.helium.fhenix.zone`) and `PRIVATE_KEY` (deployer key with testnet FHE for gas). Use a Fhenix RPC, not Arbitrum/Ethereum.

### 2.2 Deploy PrivateEscrow (required)

```bash
cd contracts
./deploy.sh
```

Or manually after `source .env`: `forge create src/PrivateEscrow.sol:PrivateEscrow --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --broadcast`

Copy the **Deployed to: 0x...** address.

### 2.3 Deploy DisputeResolver (optional)

If you want a neutral dispute resolver:

1. In `contracts/.env` set `ESCROW_ADDRESS=0x...` (your PrivateEscrow) and `ARBITRATOR_ADDRESSES=0xaddr1,0xaddr2,...` (comma-separated, no spaces).
2. Run `./deploy-dispute-resolver.sh`.

Or deploy manually (array = comma-separated in brackets):

```bash
source .env
forge create src/DisputeResolver.sol:DisputeResolver \
  --constructor-args "$ESCROW_ADDRESS" "[0xaddr1,0xaddr2]" \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

After deployment, the **owner** (deployer) can add or remove arbitrators via `addArbitrator` / `removeArbitrator`. Copy the **Deployed to: 0x...** address.

3. **Wire DisputeResolver into the escrow (required for arbitrator resolution)**

   The escrow has a one-time `setDefaultJudge(address)` function. After deploying DisputeResolver, call it **once** from any account so that new disputes use the DisputeResolver as judge (arbitrators can then resolve from the app):

   ```bash
   cast send <ESCROW_ADDRESS> "setDefaultJudge(address)" <DISPUTE_RESOLVER_ADDRESS> --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
   ```

   Example (Arbitrum Sepolia, from `contracts/` with `.env` loaded):

   ```bash
   source .env
   cast send 0x1d4310B7132aC1415FE67Fad3E1eB063E70E0fa8 "setDefaultJudge(address)" 0x34b7aE17989Cc7a1BBD6AAfCEA2a32554C30b12D --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
   ```

   **Note:** If your PrivateEscrow was deployed before `setDefaultJudge` existed, redeploy the escrow (step 2.2), then run this step with the new escrow address, and deploy a new DisputeResolver that uses the new escrow.

---

## 3. Use the contract in the app

1. **Point the app at your escrow and resolver**

   ```bash
   cd app
   cp .env.example .env.local
   ```

   Edit `app/.env.local` (or `app/.env`):

   ```env
   NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x...   # PrivateEscrow address from step 2.2
   NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS=0x...  # DisputeResolver address from step 2.3 (optional; enables arbitrator resolve in UI)
   ```

   Set any other variables from `app/.env.example` (e.g. RPC URLs for the chain you deployed to).

2. **Install and run**

   ```bash
   npm install
   npm run dev
   ```

3. **Use the app**

   - Connect your wallet on the same network as the contract (e.g. Fhenix Helium).
   - Create an invite or accept one to create a contract.
   - Set milestones, sign, fund, complete milestones, claim payout or refund. From the contract page you can also raise and resolve disputes (if you are the judge).

---

## 4. Fhenix / cofhe note

`PrivateEscrow` uses `@fhenixprotocol/cofhe-contracts`, which has a **hardcoded `TASK_MANAGER_ADDRESS`** in FHE.sol. Deploy and use the contract on the **same Fhenix network** (e.g. Helium) where that Task Manager is deployed. For other networks, you may need a build of cofhe-contracts that matches that network.
