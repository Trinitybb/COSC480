require("dotenv").config();
const path = require("path");

const bcrypt = require("bcryptjs");
const express = require("express");
const { ethers } = require("ethers");

const { authRequired, createToken, encryptSecret } = require("./auth");
const { formatTokenAmount, getAdminContract, getReadContract, parseTokenAmount } = require("./blockchain");
const { all, get, initDb, run } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const STARTING_BALANCE = process.env.STARTING_BALANCE || "1000";
const CIRCUS_USERNAME = String(process.env.CIRCUS_USERNAME || "circus").trim().toLowerCase();
const CAMPAIGN_NAME = process.env.CAMPAIGN_NAME || "Spring Big Top Showcase";
const MILESTONES = [0.01, 0.05, 0.1, 0.25];
const ACTS = [
  {
    id: "aerial-rig",
    name: "Aerial Rig",
    category: "Safety + staging",
    target: 0.08,
    description: "Funds certified rigging checks, mats, and rehearsal time for the trapeze crew.",
  },
  {
    id: "fire-juggling",
    name: "Fire Juggling",
    category: "Permits + equipment",
    target: 0.06,
    description: "Covers fire-safe props, permit prep, and a trained safety spotter for the act.",
  },
  {
    id: "clown-lab",
    name: "Clown Lab",
    category: "Costume + writing",
    target: 0.04,
    description: "Backs new costume pieces, prop repair, and rehearsal space for the comedy set.",
  },
  {
    id: "brass-finale",
    name: "Brass Finale",
    category: "Music + closing act",
    target: 0.1,
    description: "Funds musicians, sheet arrangements, and the closing-night parade sequence.",
  },
];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/web3-config", authRequired, async (_req, res) => {
  try {
    const contract = getReadContract();
    const circus = await getCircusUser();

    return res.json({
      chainId: 11155111,
      contractAddress: contract.address,
      tokenDecimals: Number(process.env.TOKEN_DECIMALS || 2),
      tokenSymbol: "CFUSD",
      circusWalletAddress: circus.wallet_address,
      nativeSymbol: "Sepolia ETH",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

async function createUser(username, password) {
  const wallet = ethers.Wallet.createRandom();
  const passwordHash = await bcrypt.hash(String(password), 10);
  const encryptedPrivateKey = encryptSecret(wallet.privateKey);

  const result = await run(
    "INSERT INTO users (username, password_hash, wallet_address, wallet_key_encrypted) VALUES (?, ?, ?, ?)",
    [username, passwordHash, wallet.address, encryptedPrivateKey]
  );

  return {
    id: result.lastID,
    username,
    wallet_address: wallet.address,
  };
}

async function getCircusUser() {
  let circus = await get("SELECT id, username, wallet_address FROM users WHERE username = ?", [CIRCUS_USERNAME]);

  if (!circus) {
    circus = await createUser(CIRCUS_USERNAME, ethers.Wallet.createRandom().privateKey);
  }

  return circus;
}

async function getUserBalance(walletAddress) {
  const contract = getReadContract();
  const rawBalance = await contract.balanceOf(walletAddress);
  return formatTokenAmount(rawBalance);
}

async function getEthBalance(walletAddress) {
  const contract = getReadContract();
  const rawBalance = await contract.provider.getBalance(walletAddress);
  return ethers.utils.formatEther(rawBalance);
}

function getMilestoneLevel(balance) {
  const numericBalance = Number(balance);
  return MILESTONES.filter((goal) => numericBalance >= goal).length;
}

function getAct(actId) {
  return ACTS.find((act) => act.id === actId);
}

function getRewardForAmount(amount) {
  const numericAmount = Number(amount);

  if (numericAmount >= 0.1) {
    return {
      tier: "Center Ring Sponsor",
      description: "Opening-night digital pass plus sponsor credit in the campaign ledger",
    };
  }

  if (numericAmount >= 0.05) {
    return {
      tier: "Big Top Backer",
      description: "Digital ticket receipt plus highlighted patron credit",
    };
  }

  if (numericAmount >= 0.01) {
    return {
      tier: "Spotlight Patron",
      description: "Collectible digital thank-you badge",
    };
  }

  return {
    tier: "Friend of the Circus",
    description: "Digital thank-you receipt",
  };
}

function buildActs(contributions) {
  return ACTS.map((act) => {
    const raised = contributions
      .filter((item) => item.act_id === act.id)
      .reduce((total, item) => total + Number(item.amount || 0), 0);

    return {
      ...act,
      raised: raised.toFixed(2).replace(/\.00$/, ""),
      percentFunded: Math.min(Math.round((raised / act.target) * 100), 100),
    };
  });
}

async function transferBetweenUsers(sender, recipient, amount) {
  const contract = getAdminContract();
  const tokenAmount = parseTokenAmount(amount);
  const senderRawBalance = await contract.balanceOf(sender.wallet_address);

  if (senderRawBalance.lt(tokenAmount)) {
    throw new Error(`Insufficient token balance. Available: ${formatTokenAmount(senderRawBalance)}, requested: ${amount}`);
  }

  const tx = await contract.adminTransfer(sender.wallet_address, recipient.wallet_address, tokenAmount);
  await tx.wait();

  return tx;
}

async function verifyMetaMaskTransfer({ txHash, walletAddress, circusWalletAddress, amount }) {
  if (!ethers.utils.isAddress(walletAddress)) {
    throw new Error("connected wallet address is invalid");
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(String(txHash || ""))) {
    throw new Error("transaction hash is invalid");
  }

  const contract = getReadContract();
  const tokenAmount = parseTokenAmount(amount);
  const provider = contract.provider;
  const receipt = await provider.waitForTransaction(txHash, 1, 120000);

  if (!receipt || receipt.status !== 1) {
    throw new Error("transaction was not confirmed successfully");
  }

  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    throw new Error("transaction details were not found");
  }

  if (String(tx.from).toLowerCase() !== String(walletAddress).toLowerCase()) {
    throw new Error("transaction sender does not match connected wallet");
  }

  if (String(tx.to).toLowerCase() !== String(contract.address).toLowerCase()) {
    throw new Error("transaction was not sent to the CFUSD contract");
  }

  const parsed = contract.interface.parseTransaction({
    data: tx.data,
    value: tx.value,
  });

  if (parsed.name !== "transfer") {
    throw new Error("transaction was not a CFUSD transfer");
  }

  const [recipient, sentAmount] = parsed.args;
  if (String(recipient).toLowerCase() !== String(circusWalletAddress).toLowerCase()) {
    throw new Error("transaction recipient is not the circus treasury");
  }

  if (!sentAmount.eq(tokenAmount)) {
    throw new Error("transaction amount does not match submitted amount");
  }
}

async function verifyMetaMaskEthTransfer({ txHash, walletAddress, circusWalletAddress, amount }) {
  if (!ethers.utils.isAddress(walletAddress)) {
    throw new Error("connected wallet address is invalid");
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(String(txHash || ""))) {
    throw new Error("transaction hash is invalid");
  }

  const contract = getReadContract();
  const provider = contract.provider;
  const receipt = await provider.waitForTransaction(txHash, 1, 120000);

  if (!receipt || receipt.status !== 1) {
    throw new Error("transaction was not confirmed successfully");
  }

  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    throw new Error("transaction details were not found");
  }

  if (String(tx.from).toLowerCase() !== String(walletAddress).toLowerCase()) {
    throw new Error("transaction sender does not match connected wallet");
  }

  if (String(tx.to).toLowerCase() !== String(circusWalletAddress).toLowerCase()) {
    throw new Error("transaction recipient is not the circus treasury");
  }

  if (!tx.value.eq(ethers.utils.parseEther(String(amount)))) {
    throw new Error("transaction ETH value does not match submitted amount");
  }
}

app.get("/api/circus", authRequired, async (_req, res) => {
  try {
    const circus = await getCircusUser();
    const balance = await getEthBalance(circus.wallet_address);
    const contributions = await all(
      `SELECT id, username, wallet_address, campaign_name, act_id, act_name, note, amount, currency, tx_hash,
              milestone_level, reward_tier, reward_description, created_at
       FROM contributions
       ORDER BY id DESC
       LIMIT 12`
    );
    const allContributions = await all("SELECT act_id, amount FROM contributions WHERE currency = 'ETH'");

    return res.json({
      campaign: {
        name: CAMPAIGN_NAME,
        milestones: MILESTONES,
        acts: buildActs(allContributions),
      },
      circus: {
        username: circus.username,
        walletAddress: circus.wallet_address,
      },
      balance,
      contributions: contributions.map((row) => ({
        id: row.id,
        username: row.username,
        walletAddress: row.wallet_address,
        campaignName: row.campaign_name,
        actId: row.act_id,
        actName: row.act_name,
        note: row.note || "",
        amount: row.amount,
        currency: row.currency || "CFUSD",
        txHash: row.tx_hash,
        milestoneLevel: row.milestone_level,
        rewardTier: row.reward_tier,
        rewardDescription: row.reward_description,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/metamask/mint", authRequired, async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!ethers.utils.isAddress(String(walletAddress || ""))) {
      return res.status(400).json({ error: "valid walletAddress is required" });
    }

    const contract = getAdminContract();
    const tx = await contract.mint(walletAddress, parseTokenAmount(STARTING_BALANCE));
    await tx.wait();

    return res.json({
      txHash: tx.hash,
      walletAddress,
      balance: await getUserBalance(walletAddress),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/circus/fund", authRequired, async (req, res) => {
  try {
    const { amount, actId, note } = req.body;

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const selectedAct = getAct(String(actId || ""));
    if (!selectedAct) {
      return res.status(400).json({ error: "choose a valid circus act to fund" });
    }

    const sender = await get("SELECT * FROM users WHERE id = ?", [req.user.userId]);
    const circus = await getCircusUser();

    if (!sender) {
      return res.status(404).json({ error: "sender not found" });
    }

    if (sender.id === circus.id) {
      return res.status(400).json({ error: "the circus wallet cannot fund itself" });
    }

    const tx = await transferBetweenUsers(sender, circus, amount);
    const [senderBalance, circusBalance] = await Promise.all([
      getUserBalance(sender.wallet_address),
      getUserBalance(circus.wallet_address),
    ]);
    const milestoneLevel = getMilestoneLevel(circusBalance);
    const cleanNote = String(note || "").trim().slice(0, 180);
    const reward = getRewardForAmount(amount);

    await run(
      `INSERT INTO contributions
        (user_id, username, wallet_address, campaign_name, act_id, act_name, note, amount, tx_hash,
         currency, milestone_level, reward_tier, reward_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sender.id,
        sender.username,
        sender.wallet_address,
        CAMPAIGN_NAME,
        selectedAct.id,
        selectedAct.name,
        cleanNote,
        String(amount),
        tx.hash,
        "CFUSD",
        milestoneLevel,
        reward.tier,
        reward.description,
      ]
    );

    return res.json({
      txHash: tx.hash,
      newBalance: senderBalance,
      circusBalance,
      circusUsername: circus.username,
      contribution: {
        username: sender.username,
        amount: String(amount),
        actId: selectedAct.id,
        actName: selectedAct.name,
        note: cleanNote,
        txHash: tx.hash,
        milestoneLevel,
        rewardTier: reward.tier,
        rewardDescription: reward.description,
        campaignName: CAMPAIGN_NAME,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (err.message && err.message.startsWith("Insufficient token balance")) {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/circus/fund/metamask", authRequired, async (req, res) => {
  try {
    const { amount, actId, note, walletAddress, txHash } = req.body;

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const selectedAct = getAct(String(actId || ""));
    if (!selectedAct) {
      return res.status(400).json({ error: "choose a valid circus act to fund" });
    }

    const existingTx = await get("SELECT id FROM contributions WHERE tx_hash = ?", [txHash]);
    if (existingTx) {
      return res.status(409).json({ error: "this transaction has already been recorded" });
    }

    const sender = await get("SELECT id, username FROM users WHERE id = ?", [req.user.userId]);
    const circus = await getCircusUser();

    if (!sender) {
      return res.status(404).json({ error: "sender not found" });
    }

    await verifyMetaMaskTransfer({
      txHash,
      walletAddress,
      circusWalletAddress: circus.wallet_address,
      amount,
    });

    const [walletBalance, circusBalance] = await Promise.all([
      getUserBalance(walletAddress),
      getUserBalance(circus.wallet_address),
    ]);
    const milestoneLevel = getMilestoneLevel(circusBalance);
    const cleanNote = String(note || "").trim().slice(0, 180);
    const reward = getRewardForAmount(amount);

    await run(
      `INSERT INTO contributions
        (user_id, username, wallet_address, campaign_name, act_id, act_name, note, amount, tx_hash,
         currency, milestone_level, reward_tier, reward_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sender.id,
        sender.username,
        walletAddress,
        CAMPAIGN_NAME,
        selectedAct.id,
        selectedAct.name,
        cleanNote,
        String(amount),
        txHash,
        "CFUSD",
        milestoneLevel,
        reward.tier,
        reward.description,
      ]
    );

    return res.json({
      txHash,
      walletBalance,
      circusBalance,
      contribution: {
        username: sender.username,
        amount: String(amount),
        currency: "CFUSD",
        actId: selectedAct.id,
        actName: selectedAct.name,
        note: cleanNote,
        txHash,
        milestoneLevel,
        rewardTier: reward.tier,
        rewardDescription: reward.description,
        campaignName: CAMPAIGN_NAME,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/circus/fund/eth", authRequired, async (req, res) => {
  try {
    const { amount, actId, note, walletAddress, txHash } = req.body;

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive ETH number" });
    }

    const selectedAct = getAct(String(actId || ""));
    if (!selectedAct) {
      return res.status(400).json({ error: "choose a valid circus act to fund" });
    }

    const existingTx = await get("SELECT id FROM contributions WHERE tx_hash = ?", [txHash]);
    if (existingTx) {
      return res.status(409).json({ error: "this transaction has already been recorded" });
    }

    const sender = await get("SELECT id, username FROM users WHERE id = ?", [req.user.userId]);
    const circus = await getCircusUser();

    if (!sender) {
      return res.status(404).json({ error: "sender not found" });
    }

    await verifyMetaMaskEthTransfer({
      txHash,
      walletAddress,
      circusWalletAddress: circus.wallet_address,
      amount,
    });

    const [walletBalance, circusBalance] = await Promise.all([
      getEthBalance(walletAddress),
      getEthBalance(circus.wallet_address),
    ]);
    const milestoneLevel = getMilestoneLevel(circusBalance);
    const cleanNote = String(note || "").trim().slice(0, 180);
    const reward = getRewardForAmount(amount);

    await run(
      `INSERT INTO contributions
        (user_id, username, wallet_address, campaign_name, act_id, act_name, note, amount, tx_hash,
         currency, milestone_level, reward_tier, reward_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sender.id,
        sender.username,
        walletAddress,
        CAMPAIGN_NAME,
        selectedAct.id,
        selectedAct.name,
        cleanNote,
        String(amount),
        txHash,
        "ETH",
        milestoneLevel,
        reward.tier,
        reward.description,
      ]
    );

    return res.json({
      txHash,
      walletBalance,
      circusBalance,
      currency: "ETH",
      contribution: {
        username: sender.username,
        amount: String(amount),
        currency: "ETH",
        actId: selectedAct.id,
        actName: selectedAct.name,
        note: cleanNote,
        txHash,
        milestoneLevel,
        rewardTier: reward.tier,
        rewardDescription: reward.description,
        campaignName: CAMPAIGN_NAME,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    if (normalizedUsername.length < 3) {
      return res.status(400).json({ error: "username must be at least 3 characters" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }

    const existing = await get("SELECT id FROM users WHERE username = ?", [normalizedUsername]);
    if (existing) {
      return res.status(409).json({ error: "username already exists" });
    }

    if (normalizedUsername === CIRCUS_USERNAME) {
      return res.status(409).json({ error: `${CIRCUS_USERNAME} is reserved for the official circus fund` });
    }

    const user = await createUser(normalizedUsername, password);

    let minted = false;
    let mintError = null;

    try {
      const contract = getAdminContract();
      const tx = await contract.mint(user.wallet_address, parseTokenAmount(STARTING_BALANCE));
      await tx.wait();
      minted = true;
    } catch (err) {
      mintError = err.message;
    }

    const token = createToken(user);

    return res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        walletAddress: user.wallet_address,
      },
      token,
      minted,
      mintError,
    });
  } catch (err) {
    if (err.message && err.message.startsWith("Insufficient token balance")) {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const row = await get("SELECT * FROM users WHERE username = ?", [normalizedUsername]);
    if (!row) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = createToken(row);

    return res.json({
      token,
      user: {
        id: row.id,
        username: row.username,
        walletAddress: row.wallet_address,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/me", authRequired, async (req, res) => {
  try {
    const row = await get("SELECT id, username, wallet_address FROM users WHERE id = ?", [req.user.userId]);
    if (!row) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json({
      user: {
        id: row.id,
        username: row.username,
        walletAddress: row.wallet_address,
      },
      balance: await getUserBalance(row.wallet_address),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/fund-me", authRequired, async (req, res) => {
  try {
    const row = await get("SELECT id, username, wallet_address FROM users WHERE id = ?", [req.user.userId]);
    if (!row) {
      return res.status(404).json({ error: "user not found" });
    }

    const contract = getAdminContract();
    const tx = await contract.mint(row.wallet_address, parseTokenAmount(STARTING_BALANCE));
    await tx.wait();

    const readContract = getReadContract();
    const rawBalance = await readContract.balanceOf(row.wallet_address);

    return res.json({
      txHash: tx.hash,
      balance: formatTokenAmount(rawBalance),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/transfer", authRequired, async (req, res) => {
  try {
    const { toUsername, amount } = req.body;

    if (!toUsername || !amount) {
      return res.status(400).json({ error: "toUsername and amount are required" });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const sender = await get("SELECT * FROM users WHERE id = ?", [req.user.userId]);
    const recipient = await get("SELECT * FROM users WHERE username = ?", [String(toUsername).trim().toLowerCase()]);

    if (!sender) {
      return res.status(404).json({ error: "sender not found" });
    }

    if (!recipient) {
      return res.status(404).json({ error: "recipient not found" });
    }

    if (sender.id === recipient.id) {
      return res.status(400).json({ error: "cannot transfer to yourself" });
    }

    const tx = await transferBetweenUsers(sender, recipient, amount);

    return res.json({
      txHash: tx.hash,
      newBalance: await getUserBalance(sender.wallet_address),
    });
  } catch (err) {
    if (err.message && err.message.startsWith("Insufficient token balance")) {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({ error: err.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize DB", err);
    process.exit(1);
  });
