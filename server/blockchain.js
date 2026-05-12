const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const artifactPath = path.join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "FakeMoney.sol",
  "FakeMoney.json"
);

function getRpcUrl() {
  return process.env.CHAIN_RPC_URL || process.env.API_URL;
}

function getContractAddress() {
  return process.env.CONTRACT_ADDRESS;
}

function getAbi() {
  const raw = fs.readFileSync(artifactPath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed.abi;
}

function getReadContract() {
  const rpcUrl = getRpcUrl();
  const contractAddress = getContractAddress();

  if (!rpcUrl || !contractAddress) {
    throw new Error("Missing CHAIN_RPC_URL/API_URL or CONTRACT_ADDRESS in .env");
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(contractAddress, getAbi(), provider);
}

function getAdminContract() {
  const rpcUrl = getRpcUrl();
  const contractAddress = getContractAddress();
  const adminPrivateKey = process.env.SERVER_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!rpcUrl || !contractAddress || !adminPrivateKey) {
    throw new Error("Missing blockchain admin config in .env");
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(adminPrivateKey)) {
    throw new Error("SERVER_PRIVATE_KEY must be a wallet private key (0x + 64 hex chars), not a contract address");
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(adminPrivateKey, provider);
  return new ethers.Contract(contractAddress, getAbi(), signer);
}

function formatTokenAmount(rawAmount) {
  const decimals = Number(process.env.TOKEN_DECIMALS || 2);
  return ethers.utils.formatUnits(rawAmount, decimals);
}

function parseTokenAmount(amount) {
  const decimals = Number(process.env.TOKEN_DECIMALS || 2);
  return ethers.utils.parseUnits(String(amount), decimals);
}

module.exports = {
  formatTokenAmount,
  getAdminContract,
  getReadContract,
  parseTokenAmount,
};
