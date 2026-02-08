# Private Escrow Platform (Fhenix)

Private escrow for Web3 deals with **encrypted terms**, milestone-based payments, and on-chain dispute resolution. Built per [build.md](build.md) using [fhenix.md](fhenix.md) FHE reference.

## Stack (per build.md – no simulation)

- **Frontend**: Next.js, TypeScript, Tailwind CSS, Framer Motion, Three.js
- **Web3**: ethers.js (wallet + contract calls)
- **FHE / Encryption**: fhenixjs (FhenixClient for encrypting inputs)
- **Contracts**: Solidity with **@fhenixprotocol/cofhe-contracts** (FHE) and OpenZeppelin

## Repo layout

- **`app/`** – Next.js app (landing, dashboard, create contract, contract detail)
- **`contracts/`** – Foundry project; Solidity escrow using Fhenix FHE (cofhe-contracts)
- **`build.md`** – Product/feature spec
- **`fhenix.md`** – FHE library reference for AI/developers

## Quick start

### 1. Contracts

See **[contracts/DEPLOY.md](contracts/DEPLOY.md)** for full steps. Summary:

```bash
cd contracts
npm install
# Install Foundry: https://getfoundry.sh then run `foundryup`
export PATH="$HOME/.foundry/bin:$PATH"   # or ensure forge is on PATH
forge build
# Deploy (use your Fhenix RPC and deployer key):
export PRIVATE_KEY=0x...
forge create src/PrivateEscrow.sol:PrivateEscrow --rpc-url https://api.helium.fhenix.zone --private-key "$PRIVATE_KEY"
```

Copy the **deployed address** from the output and set it in the app (see below).

### 2. App

```bash
cd app
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

#### Environment variables

Set these in `app/.env.local` (see `app/.env.example` for a template):

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` | Yes | Deployed PrivateEscrow contract address (after running contracts deploy). |
| `NEXT_PUBLIC_CHAIN_ID` | No | Chain ID. App uses **Arbitrum Sepolia (421614)** only. Default: 421614. |
| `NEXT_PUBLIC_RPC_URL` | No | Single RPC URL for the app chain. |
| `NEXT_PUBLIC_RPC_URLS` | No | Comma-separated RPC URLs for read-only fallback (e.g. to avoid rate limits). |
| `NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS` | No | Deployed DisputeResolver address (optional; for arbitrator resolution). |
| `NEXT_PUBLIC_FHENIX_ENV` | No | CoFHE environment: `LOCAL` \| `TESTNET` \| `MAINNET`. Default: `TESTNET`. |

Without `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS`, the app will show a friendly error when creating or opening contracts.

### 3. Network

The app uses **Arbitrum Sepolia (arb-sepolia)** only. Connect your wallet and switch to Arbitrum Sepolia when prompted. RPC and chain config are in `app/src/lib/constants.ts`.

### Deploy to Netlify

The app is configured for Netlify with the site name **fhenixescrow**. Config is loaded via a serverless function (`/api/config`) so **env vars are never exposed in the client bundle**.

1. **Link the site** (from repo root or `app/`):
   ```bash
   cd app
   npx netlify link --name fhenixescrow
   ```
2. **Push environment variables** from your local `app/.env` (no manual Dashboard needed):
   ```bash
   node scripts/generate-netlify-env.js    # from repo root: reads app/.env → app/.env.netlify
   cd app && netlify env:import .env.netlify
   ```
   Or set them manually in Netlify Dashboard (Site configuration → Environment variables) with **server-only** names: `ESCROW_CONTRACT_ADDRESS`, `DISPUTE_RESOLVER_ADDRESS`, `CHAIN_ID`, `RPC_URL`, `RPC_URLS`, `FHENIX_ENV`.
3. **Build and deploy** from the `app` directory (Netlify will use `netlify.toml` and `@netlify/plugin-nextjs`):
   ```bash
   cd app
   netlify deploy --prod
   ```
   Or connect the repo in Netlify and set the base directory to `app` so deploys run from there.

See `app/.env.example` for the full list and notes on local vs Netlify env names.

## Features (from build.md)

- **Contract creation**: Client- or developer-initiated; unique contract IDs; invitation via address
- **Milestones**: Add/edit milestones; stored **encrypted** (FHE); both parties can propose
- **Terms**: Encrypted total payment (euint128); deadline (plaintext for timeout); negotiation flow
- **Signing**: Dual signature (client + developer); terms committed encrypted
- **Escrow funding**: Client deposits to escrow; balance visible to both
- **Milestone workflow**: Developer submits; client approves; progress indicator
- **Payout**: Single transfer when all milestones approved; developer claims
- **Dispute**: Either party can raise; on-chain resolution (judge)
- **Protection**: Timeout/refund (client claims after deadline if incomplete); mutual cancellation (both request cancel)

## Smart contract (PrivateEscrow.sol)

- **States**: DRAFT → SIGNED → FUNDED → IN_PROGRESS → COMPLETED → PAID_OUT; DISPUTED / CANCELLED
- **FHE**: Encrypted total payment and per-milestone amounts via `@fhenixprotocol/cofhe-contracts` (FHE.allowThis, allowSender, allow; InEuint128, InEuint32)
- **No simulation**: All logic and FHE operations run on-chain (Fhenix).

## SDKs only (per build.md)

- **ethers.js** – Provider, signer, contract calls
- **fhenixjs** – FhenixClient, encrypt inputs (e.g. uint32, uint128) for contract calls
- **@fhenixprotocol/cofhe-contracts** – FHE types and ops in Solidity

Nothing is simulated; backend behavior is real contract + real Fhenix RPC.
