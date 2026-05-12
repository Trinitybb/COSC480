const authCard = document.getElementById("authCard");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authMessage = document.getElementById("authMessage");
const transferMessage = document.getElementById("transferMessage");

const showLoginBtn = document.getElementById("showLogin");
const showRegisterBtn = document.getElementById("showRegister");
const logoutBtn = document.getElementById("logoutBtn");

const meUser = document.getElementById("meUser");
const meWallet = document.getElementById("meWallet");
const meBalance = document.getElementById("meBalance");
const circusUser = document.getElementById("circusUser");
const campaignTitle = document.getElementById("campaignTitle");

const transferForm = document.getElementById("transferForm");
const submitContribution = document.getElementById("submitContribution");
const fundBtn = document.getElementById("fundBtn");
const connectWalletBtn = document.getElementById("connectWalletBtn");
const mintWalletBtn = document.getElementById("mintWalletBtn");
const patronNote = document.getElementById("patronNote");
const amountInput = document.getElementById("amount");
const actCards = document.getElementById("actCards");
const fundingTitle = document.getElementById("fundingTitle");
const selectedActSummary = document.getElementById("selectedActSummary");
const activityList = document.getElementById("activityList");
const circusTotal = document.getElementById("circusTotal");
const goalProgress = document.getElementById("goalProgress");
const goalMarkers = document.getElementById("goalMarkers");
const danceStatus = document.getElementById("danceStatus");
const progressPercent = document.getElementById("progressPercent");
const circusAct = document.getElementById("circusAct");
const txState = document.getElementById("txState");
const receiptFrom = document.getElementById("receiptFrom");
const receiptTo = document.getElementById("receiptTo");
const receiptAct = document.getElementById("receiptAct");
const walletStatus = document.getElementById("walletStatus");
const connectedWallet = document.getElementById("connectedWallet");
const connectedBalance = document.getElementById("connectedBalance");

const TOKEN_KEY = "demo_auth_token";
const GOALS = [100, 250, 500, 1000];
const GOAL_LABELS = [
  "Rehearsal space",
  "Costumes + rigging",
  "Performer stipends",
  "Opening night ready",
];
const STATUS_MESSAGES = [
  "The show is waiting for its first patron.",
  "Milestone 1 reached: rehearsal space can be reserved.",
  "Milestone 2 reached: costumes and rigging checks are funded.",
  "Milestone 3 reached: performer stipends and operations are unlocked.",
  "Fully funded: the big top is ready for opening night.",
];

let selectedActId = "";
let currentActs = [];
let currentUser = null;
let currentTreasury = null;
let connectedWalletAddress = "";
let web3Config = null;

const TOKEN_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

function setAuthMessage(message, isError = true) {
  authMessage.textContent = message;
  authMessage.className = isError ? "message error" : "message success";
}

function setTransferMessage(message, isError = true) {
  transferMessage.textContent = message;
  transferMessage.className = isError ? "message error" : "message success";
}

function setTxState(label, tone = "muted") {
  txState.textContent = label;
  txState.className = `status-pill ${tone}`;
}

function getSubmitLabel() {
  return connectedWalletAddress ? "Send ETH with MetaMask" : "Connect MetaMask to Send ETH";
}

function setBusy(isBusy, label = "Processing...") {
  submitContribution.disabled = isBusy;
  fundBtn.disabled = isBusy;
  connectWalletBtn.disabled = isBusy;
  mintWalletBtn.disabled = isBusy;
  submitContribution.textContent = isBusy ? label : getSubmitLabel();
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getMilestoneLevel(total) {
  return GOALS.filter((goal) => total >= goal).length;
}

function formatMoney(value) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 4,
    maximumFractionDigits: 6,
  });
}

function shortHash(hash) {
  if (!hash) {
    return "-";
  }

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatDate(value) {
  if (!value) {
    return "just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function updateReceipt() {
  const selectedAct = currentActs.find((act) => act.id === selectedActId);
  if (connectedWalletAddress) {
    receiptFrom.textContent = `MetaMask (${connectedWalletAddress})`;
  } else {
    receiptFrom.textContent = currentUser ? `@${currentUser.username} (${currentUser.walletAddress})` : "-";
  }
  receiptTo.textContent = currentTreasury ? `(${currentTreasury.walletAddress})` : "-";
  receiptAct.textContent = selectedAct ? selectedAct.name : "-";
  submitContribution.textContent = getSubmitLabel();
}

function selectAct(actId) {
  selectedActId = actId;
  const selectedAct = currentActs.find((act) => act.id === selectedActId);

  if (!selectedAct) {
    fundingTitle.textContent = "Select an Allocation";
    selectedActSummary.textContent = "Choose an act first, then enter the amount you want to send.";
    receiptAct.textContent = "-";
    return;
  }

  fundingTitle.textContent = `Transfer to ${selectedAct.name}`;
  selectedActSummary.textContent = `${selectedAct.name} needs ${formatMoney(selectedAct.target)} ETH. ${selectedAct.description}`;
  setTxState("Draft", "muted");
  renderActs(currentActs);
  updateReceipt();
}

function renderActs(acts = []) {
  currentActs = acts;
  actCards.innerHTML = "";

  if (!selectedActId && currentActs.length > 0) {
    selectedActId = currentActs[0].id;
  }

  for (const act of currentActs) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = act.id === selectedActId ? "act-card selected" : "act-card";
    card.setAttribute("aria-pressed", String(act.id === selectedActId));
    card.addEventListener("click", () => selectAct(act.id));

    const top = document.createElement("div");
    top.className = "act-card-top";

    const title = document.createElement("strong");
    title.textContent = act.name;

    const tag = document.createElement("span");
    tag.textContent = act.category;

    top.append(title, tag);

    const description = document.createElement("p");
    description.textContent = act.description;

    const progress = document.createElement("div");
    progress.className = "mini-progress-track";
    const fill = document.createElement("span");
    fill.className = "mini-progress-fill";
    fill.style.width = `${act.percentFunded}%`;
    progress.appendChild(fill);

    const footer = document.createElement("small");
    footer.textContent = `${formatMoney(act.raised)} of ${formatMoney(act.target)} ETH funded`;

    card.append(top, description, progress, footer);
    actCards.appendChild(card);
  }

  const selectedAct = currentActs.find((act) => act.id === selectedActId);
  if (selectedAct) {
    fundingTitle.textContent = `Transfer to ${selectedAct.name}`;
    selectedActSummary.textContent = `${selectedAct.name} needs ${formatMoney(selectedAct.target)} ETH. ${selectedAct.description}`;
  }
  updateReceipt();
}

function renderGoals(total = 0) {
  const maxGoal = GOALS[GOALS.length - 1];
  const percent = Math.min((total / maxGoal) * 100, 100);
  const milestoneLevel = getMilestoneLevel(total);

  circusTotal.textContent = formatMoney(total);
  goalProgress.style.width = `${percent}%`;
  progressPercent.textContent = `${Math.round(percent)}%`;
  danceStatus.textContent = STATUS_MESSAGES[milestoneLevel];
  circusAct.className = `circus-act dance-level-${milestoneLevel}`;

  goalMarkers.innerHTML = "";
  GOALS.forEach((goal, index) => {
    const marker = document.createElement("li");
    marker.className = total >= goal ? "goal-marker reached" : "goal-marker";

    const label = document.createElement("span");
    label.textContent = GOAL_LABELS[index];

    const value = document.createElement("strong");
    value.textContent = `${formatMoney(goal)} ETH`;

    marker.append(label, value);
    goalMarkers.appendChild(marker);
  });
}

function renderActivity(items = []) {
  activityList.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No confirmed transfers yet.";
    activityList.appendChild(empty);
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "activity-item";

    const badge = document.createElement("span");
    badge.className = "activity-badge";
    badge.textContent = `M${item.milestoneLevel}`;

    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${item.username} sent ${formatMoney(item.amount)} ${item.currency || "ETH"} to ${item.actName}`;

    const meta = document.createElement("p");
    meta.textContent = `${item.campaignName} - ${formatDate(item.createdAt)}`;

    body.append(title, meta);

    if (item.note) {
      const note = document.createElement("small");
      note.textContent = `Memo: ${item.note}`;
      body.appendChild(note);
    }

    if (item.rewardTier) {
      const reward = document.createElement("small");
      reward.className = "reward-line";
      reward.textContent = `Reward issued: ${item.rewardTier} - ${item.rewardDescription}`;
      body.appendChild(reward);
    }

    const tx = document.createElement("code");
    tx.className = "tx-line";
    tx.textContent = `Transaction: ${item.txHash || "-"}`;
    body.appendChild(tx);

    li.append(badge, body);
    activityList.appendChild(li);
  }
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function loadWeb3Config() {
  if (!web3Config) {
    web3Config = await api("/api/web3-config");
  }

  return web3Config;
}

function requireBrowserWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask is not available in this browser.");
  }

  if (!window.ethers) {
    throw new Error("Ethers.js did not load. Check your internet connection and refresh the page.");
  }
}

async function getMetaMaskProvider() {
  requireBrowserWallet();
  const config = await loadWeb3Config();
  const provider = new window.ethers.providers.Web3Provider(window.ethereum);
  const network = await provider.getNetwork();

  if (network.chainId !== config.chainId) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${config.chainId.toString(16)}` }],
    });
  }

  return new window.ethers.providers.Web3Provider(window.ethereum);
}

async function loadConnectedWalletBalance() {
  if (!connectedWalletAddress) {
    return;
  }

  const config = await loadWeb3Config();
  const provider = await getMetaMaskProvider();
  const rawBalance = await provider.getBalance(connectedWalletAddress);
  const balance = window.ethers.utils.formatEther(rawBalance);
  connectedBalance.textContent = `${formatMoney(balance)} ETH available`;
}

async function connectMetaMask() {
  const provider = await getMetaMaskProvider();
  const accounts = await provider.send("eth_requestAccounts", []);
  connectedWalletAddress = accounts[0];

  walletStatus.textContent = "Connected";
  connectedWallet.textContent = connectedWalletAddress;
  connectWalletBtn.textContent = "MetaMask Connected";
  mintWalletBtn.classList.add("hidden");
  await loadConnectedWalletBalance();
  updateReceipt();
}

async function sendMetaMaskContribution({ amount, note }) {
  const config = await loadWeb3Config();
  const provider = await getMetaMaskProvider();
  const signer = provider.getSigner();
  const signerAddress = await signer.getAddress();

  if (signerAddress.toLowerCase() !== connectedWalletAddress.toLowerCase()) {
    connectedWalletAddress = signerAddress;
    connectedWallet.textContent = connectedWalletAddress;
    updateReceipt();
  }

  const tx = await signer.sendTransaction({
    to: config.circusWalletAddress,
    value: window.ethers.utils.parseEther(String(amount)),
  });

  setTxState("Confirming", "pending");
  setBusy(true, "Waiting for Sepolia...");
  await tx.wait();

  const data = await api("/api/circus/fund/eth", {
    method: "POST",
    body: JSON.stringify({
      amount,
      actId: selectedActId,
      note,
      walletAddress: connectedWalletAddress,
      txHash: tx.hash,
    }),
  });

  await loadConnectedWalletBalance();
  return data;
}

function showAuth() {
  authCard.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function showDashboard() {
  authCard.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

function toggleTab(isLoginTab) {
  loginForm.classList.toggle("hidden", !isLoginTab);
  registerForm.classList.toggle("hidden", isLoginTab);
  showLoginBtn.classList.toggle("active", isLoginTab);
  showRegisterBtn.classList.toggle("active", !isLoginTab);
  setAuthMessage("", true);
}

async function loadMe() {
  const data = await api("/api/me");
  currentUser = data.user;
  meUser.textContent = data.user.username;
  meWallet.textContent = data.user.walletAddress;
  meBalance.textContent = formatMoney(data.balance);
  updateReceipt();
}

async function loadCircus() {
  const data = await api("/api/circus");
  currentTreasury = data.circus;
  campaignTitle.textContent = data.campaign.name;
  circusUser.textContent = data.circus.username;
  renderGoals(Number(data.balance));
  renderActs(data.campaign.acts || []);
  renderActivity(data.contributions || []);
}

showLoginBtn.addEventListener("click", () => toggleTab(true));
showRegisterBtn.addEventListener("click", () => toggleTab(false));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthMessage("", true);

  try {
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;

    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    setToken(data.token);
    await Promise.all([loadMe(), loadCircus()]);
    showDashboard();
  } catch (error) {
    setAuthMessage(error.message, true);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthMessage("", true);

  try {
    const username = document.getElementById("registerUsername").value.trim();
    const password = document.getElementById("registerPassword").value;

    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    setToken(data.token);
    await Promise.all([loadMe(), loadCircus()]);
    showDashboard();

    if (!data.minted) {
      setTransferMessage(`Account created, but auto-funding failed: ${data.mintError || "Check blockchain env settings."}`, true);
    } else {
      setTransferMessage("Wallet created and test funds minted. You can submit a transfer now.", false);
    }
  } catch (error) {
    setAuthMessage(error.message, true);
  }
});

transferForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setTransferMessage("", true);

  const amount = amountInput.value;
  const note = patronNote.value.trim();
  const selectedAct = currentActs.find((act) => act.id === selectedActId);

  if (!selectedAct) {
    setTransferMessage("Choose an allocation target before submitting.", true);
    return;
  }

  if (!connectedWalletAddress) {
    setTransferMessage("Connect MetaMask first. ETH payments must be confirmed from your wallet.", true);
    return;
  }

  try {
    setTxState("Submitting", "pending");
    setBusy(true, "Open MetaMask...");

    const data = await sendMetaMaskContribution({ amount, note });

    if (data.newBalance) {
      meBalance.textContent = formatMoney(data.newBalance);
    }
    renderGoals(Number(data.circusBalance));
    await loadCircus();
    setTxState("Confirmed", "success");
    setTransferMessage(
      `Confirmed ${formatMoney(amount)} ETH to ${data.contribution.actName}. Reward issued: ${data.contribution.rewardTier}. Transaction: ${data.txHash}`,
      false
    );
    transferForm.reset();
  } catch (error) {
    setTxState("Failed", "error");
    setTransferMessage(error.message, true);
  } finally {
    setBusy(false);
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  currentUser = null;
  currentTreasury = null;
  connectedWalletAddress = "";
  web3Config = null;
  selectedActId = "";
  walletStatus.textContent = "Not connected";
  connectedWallet.textContent = "-";
  connectedBalance.textContent = "Connect MetaMask to pay with Sepolia ETH.";
  connectWalletBtn.textContent = "Connect MetaMask";
  connectWalletBtn.disabled = false;
  mintWalletBtn.classList.add("hidden");
  setTransferMessage("", true);
  showAuth();
});

connectWalletBtn.addEventListener("click", async () => {
  setTransferMessage("", true);
  try {
    connectWalletBtn.disabled = true;
    connectWalletBtn.textContent = "Connecting...";
    await connectMetaMask();
    setTransferMessage("MetaMask connected. Contributions will now send Sepolia ETH with a wallet confirmation popup.", false);
  } catch (error) {
    connectWalletBtn.disabled = false;
    connectWalletBtn.textContent = "Connect MetaMask";
    setTransferMessage(error.message, true);
  }
});

mintWalletBtn.addEventListener("click", async () => {
  setTransferMessage("", true);
  try {
    if (!connectedWalletAddress) {
      throw new Error("Connect MetaMask before minting to it.");
    }

    mintWalletBtn.disabled = true;
    mintWalletBtn.textContent = "Minting...";
    const data = await api("/api/metamask/mint", {
      method: "POST",
      body: JSON.stringify({ walletAddress: connectedWalletAddress }),
    });
    await loadConnectedWalletBalance();
    setTransferMessage(`Minted to MetaMask wallet. New MetaMask balance: ${formatMoney(data.balance)} CFUSD. Transaction: ${data.txHash}`, false);
  } catch (error) {
    setTransferMessage(error.message, true);
  } finally {
    mintWalletBtn.disabled = false;
    mintWalletBtn.textContent = "Mint +1000 to MetaMask";
  }
});

fundBtn.addEventListener("click", async () => {
  setTransferMessage("", true);
  try {
    fundBtn.disabled = true;
    fundBtn.textContent = "Minting...";
    const data = await api("/api/fund-me", { method: "POST" });
    await Promise.all([loadMe(), loadCircus()]);
    setTransferMessage(`Mint confirmed. New balance: ${formatMoney(data.balance)} CFUSD. Transaction: ${data.txHash}`, false);
  } catch (error) {
    setTransferMessage(error.message, true);
  } finally {
    fundBtn.disabled = false;
    fundBtn.textContent = "Mint +1000 Test CFUSD";
  }
});

if (window.ethereum) {
  window.ethereum.on("accountsChanged", async (accounts) => {
    if (!accounts.length) {
      connectedWalletAddress = "";
      walletStatus.textContent = "Not connected";
      connectedWallet.textContent = "-";
      connectedBalance.textContent = "Connect MetaMask to pay with Sepolia ETH.";
      connectWalletBtn.textContent = "Connect MetaMask";
      connectWalletBtn.disabled = false;
      mintWalletBtn.classList.add("hidden");
      updateReceipt();
      return;
    }

    connectedWalletAddress = accounts[0];
    walletStatus.textContent = "Connected";
    connectedWallet.textContent = connectedWalletAddress;
    mintWalletBtn.classList.add("hidden");
    try {
      await loadConnectedWalletBalance();
    } catch (_err) {
      connectedBalance.textContent = "Reconnect MetaMask to refresh balance.";
    }
    updateReceipt();
  });
}

(async function init() {
  const token = getToken();
  if (!token) {
    showAuth();
    return;
  }

  try {
    await Promise.all([loadMe(), loadCircus()]);
    showDashboard();
  } catch (_err) {
    clearToken();
    showAuth();
  }
})();
