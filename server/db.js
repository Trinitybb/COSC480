const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const dbPath = process.env.DB_FILE || path.join(__dirname, "app.db");

let db;
let SQL;

function isMutatingSql(sql) {
  return /^\s*(insert|update|delete|create|drop|alter|replace|pragma)\b/i.test(sql);
}

function persistDb() {
  const bytes = db.export();
  fs.writeFileSync(dbPath, Buffer.from(bytes));
}

async function initDb() {
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      wallet_address TEXT NOT NULL UNIQUE,
      wallet_key_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      act_id TEXT NOT NULL DEFAULT 'aerial-rig',
      act_name TEXT NOT NULL DEFAULT 'Aerial Rig',
      note TEXT,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CFUSD',
      tx_hash TEXT NOT NULL UNIQUE,
      milestone_level INTEGER NOT NULL,
      reward_tier TEXT NOT NULL DEFAULT 'Friend of the Circus',
      reward_description TEXT NOT NULL DEFAULT 'Digital thank-you receipt',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await ensureColumn("contributions", "act_id", "TEXT NOT NULL DEFAULT 'aerial-rig'");
  await ensureColumn("contributions", "act_name", "TEXT NOT NULL DEFAULT 'Aerial Rig'");
  await ensureColumn("contributions", "currency", "TEXT NOT NULL DEFAULT 'CFUSD'");
  await ensureColumn("contributions", "reward_tier", "TEXT NOT NULL DEFAULT 'Friend of the Circus'");
  await ensureColumn("contributions", "reward_description", "TEXT NOT NULL DEFAULT 'Digital thank-you receipt'");
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  const exists = columns.some((row) => row.name === column);
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function run(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    while (stmt.step()) {
      // Consume rows if any (mostly for non-SELECT compatibility).
    }
  } finally {
    stmt.free();
  }

  const changes = db.getRowsModified();
  let lastID = null;
  const lastIdResult = db.exec("SELECT last_insert_rowid() AS id");
  if (lastIdResult[0] && lastIdResult[0].values[0]) {
    lastID = Number(lastIdResult[0].values[0][0]);
  }

  if (isMutatingSql(sql)) {
    persistDb();
  }

  return { changes, lastID };
}

async function get(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    if (!stmt.step()) {
      return undefined;
    }

    const row = stmt.getAsObject();
    return row;
  } finally {
    stmt.free();
  }
}

async function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }

    return rows;
  } finally {
    stmt.free();
  }
}

module.exports = {
  all,
  get,
  initDb,
  run,
};
