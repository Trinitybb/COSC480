# Chain Circus: Web3 Circus Fundraising Campaign

Chain Circus is a themed Web3 fundraising demo where users log in, connect MetaMask, choose a circus production act, and send Sepolia ETH to a campaign treasury wallet. The app records confirmed on-chain payments, displays full transaction hashes, updates campaign progress, and issues digital patron reward levels.

The project also includes `FakeMoney.sol`, a classroom token contract used to demonstrate minting and token balances. The current fundraising payment flow uses native Sepolia ETH through MetaMask.

## Stack

- Solidity + Hardhat + Ethers.js
- Node.js + Express
- SQL.js local database
- JWT auth + bcrypt password hashing
- Vanilla HTML/CSS/JS frontend
- MetaMask browser wallet
- Sepolia Ethereum test network

## Project Structure

- `contracts/FakeMoney.sol`: classroom fake-token contract for CFUSD minting/transfer examples
- `scripts/deploy.js`: deploy script for `FakeMoney`
- `server/index.js`: API, auth, campaign routes, MetaMask ETH transaction verification, static frontend server
- `server/db.js`: local SQL database setup for users and campaign contributions
- `server/auth.js`: JWT middleware and wallet-key encryption helpers
- `server/blockchain.js`: contract and provider helpers
- `server/public/*`: login, MetaMask connection, fundraiser UI, animation, and ledger
- `how to run.txt`: basic setup and run instructions
- `metamask setup and contract flow.txt`: MetaMask/Sepolia explanation for demos

## Environment Variables

Create a `.env` file using `.env.example` as a guide:

```env
API_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
PRIVATE_KEY=0x_your_metamask_test_wallet_private_key

PORT=3000
JWT_SECRET=replace_with_strong_secret
ENC_SECRET=replace_with_strong_encryption_secret

CHAIN_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
CONTRACT_ADDRESS=0x_your_deployed_contract
SERVER_PRIVATE_KEY=0x_contract_owner_private_key
TOKEN_DECIMALS=2
STARTING_BALANCE=1000
CIRCUS_USERNAME=circus
CAMPAIGN_NAME=Spring Big Top Showcase
```

Notes:

- `API_URL` is used by Hardhat when deploying to Sepolia.
- `CHAIN_RPC_URL` is used by the Express backend to read Sepolia state and verify transactions.
- `PRIVATE_KEY` is the MetaMask test wallet used for deployment.
- `SERVER_PRIVATE_KEY` is still used for legacy CFUSD minting/admin routes.
- `.env` must never be pushed to GitHub.

## Install

```bash
npm install
```

## Compile Contract

```bash
npm run compile
```

## Deploy Contract

```bash
npm run deploy
```

Copy the deployed contract address into `.env`:

```env
CONTRACT_ADDRESS=0x_your_deployed_contract
```

## Run App

```bash
npm start
```

Open:

```txt
http://localhost:3000
```

If old demo data causes confusion, stop the server, delete `server/app.db`, and start again.

## Current Fundraising Flow

1. User registers or logs in with username/password.
2. Login data is stored locally in `server/app.db`; passwords are stored as bcrypt hashes.
3. User clicks `Connect MetaMask`.
4. The frontend checks Sepolia and reads the connected wallet address.
5. User chooses a circus act to fund.
6. User enters a Sepolia ETH amount.
7. User submits the contribution.
8. MetaMask opens a confirmation popup.
9. User confirms the native ETH payment.
10. Frontend sends the transaction hash to the backend.
11. Backend verifies the transaction on Sepolia:
   - transaction exists
   - transaction succeeded
   - sender matches the connected MetaMask wallet
   - recipient is the circus treasury wallet
   - ETH amount matches the submitted form amount
12. Backend records the contribution and reward in the campaign ledger.
13. Frontend reloads progress, act funding totals, animation level, and recent contributions.

## Campaign Model

Patrons choose one of four production needs:

- Aerial Rig: certified rigging checks, mats, and trapeze rehearsal time
- Fire Juggling: props, permits, and safety support
- Clown Lab: costumes, prop repair, and comedy rehearsal
- Brass Finale: musicians, arrangements, and finale production

The fundraiser uses Sepolia ETH targets:

- `0.01 ETH`: rehearsal space milestone
- `0.05 ETH`: costumes and rigging milestone
- `0.10 ETH`: performer stipend milestone
- `0.25 ETH`: fully funded milestone

The animated circus stage changes as the treasury reaches each milestone.

## Patron Rewards

Each confirmed contribution receives a digital patron reward:

- `0.01+ ETH`: Spotlight Patron
- `0.05+ ETH`: Big Top Backer
- `0.10+ ETH`: Center Ring Sponsor
- Below `0.01 ETH`: Friend of the Circus

Rewards are stored with the contribution record and displayed in the ledger.

## CFUSD / FakeMoney Contract

`FakeMoney.sol` creates a demo token named `CampusFakeUSD` with symbol `CFUSD`.

It supports:

- `balanceOf(address)`
- `transfer(address,uint256)`
- `mint(address,uint256)`
- `adminTransfer(address,address,uint256)`

This contract remains useful for explaining minting and token balances, but the current fundraiser contribution flow uses native Sepolia ETH instead of CFUSD.

## What Minting Means

Minting means creating new tokens inside a smart contract.

In this project, minting applies to the CFUSD demo token only. It does not create ETH. Sepolia ETH comes from a Sepolia faucet and is used for real test-network gas and fundraiser payments.

## Security Notes

This is a classroom/demo project:

- Do not use wallets with real funds.
- Do not commit `.env`.
- Rotate exposed private keys immediately.
- Production apps should avoid server-held private keys for user funds.
- A production version should rely on user-signed wallet transactions, as the MetaMask ETH path demonstrates.
