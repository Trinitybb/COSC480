const path = require("path");
const { DataTypes, QueryTypes, Sequelize } = require("sequelize");

const dbPath = process.env.DB_FILE || path.join(__dirname, "app.db");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: dbPath,
  logging: false,
});

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    username: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    wallet_address: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    wallet_key_encrypted: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    tableName: "users",
    timestamps: false,
  }
);

const Contribution = sequelize.define(
  "Contribution",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    username: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    wallet_address: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    campaign_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    act_id: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "aerial-rig",
    },
    act_name: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "Aerial Rig",
    },
    note: {
      type: DataTypes.TEXT,
    },
    amount: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    currency: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "CFUSD",
    },
    tx_hash: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    milestone_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reward_tier: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "Friend of the Circus",
    },
    reward_description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "Digital thank-you receipt",
    },
    created_at: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    tableName: "contributions",
    timestamps: false,
  }
);

User.hasMany(Contribution, { foreignKey: "user_id" });
Contribution.belongsTo(User, { foreignKey: "user_id" });

function normalizeRow(row) {
  if (!row || typeof row !== "object") {
    return row;
  }

  return { ...row };
}

function isSelectSql(sql) {
  return /^\s*(select|pragma)\b/i.test(sql);
}

function isInsertSql(sql) {
  return /^\s*insert\b/i.test(sql);
}

async function initDb() {
  await sequelize.authenticate();
  await sequelize.sync();

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
  const [, metadata] = await sequelize.query(sql, {
    replacements: params,
  });

  let lastID = null;
  if (isInsertSql(sql)) {
    const row = await get("SELECT last_insert_rowid() AS id");
    lastID = row ? Number(row.id) : null;
  }

  return {
    changes: typeof metadata?.changes === "number" ? metadata.changes : 0,
    lastID,
  };
}

async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0];
}

async function all(sql, params = []) {
  const rows = await sequelize.query(sql, {
    replacements: params,
    type: isSelectSql(sql) ? QueryTypes.SELECT : QueryTypes.RAW,
  });

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map(normalizeRow);
}

module.exports = {
  all,
  get,
  initDb,
  models: {
    Contribution,
    User,
  },
  run,
  sequelize,
};
