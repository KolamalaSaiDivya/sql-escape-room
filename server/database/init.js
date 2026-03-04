const Database = require("better-sqlite3");
const xlsx = require("xlsx");
const path = require("path");
require("dotenv").config();

const dbPath = process.env.DB_PATH;
const db = new Database(dbPath);

// ================= CORE TABLES =================

function createCoreTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  team_name TEXT,
  email TEXT,
  member1 TEXT,
  member2 TEXT,
  start_time INTEGER,
  finish_time INTEGER,
  total_time_taken INTEGER,
  current_level INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active'
);

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT,
      level INTEGER,
      answer TEXT,
      is_correct INTEGER,
      attempt_number INTEGER,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS level_attempts (
      team_id TEXT,
      level INTEGER,
      wrong_attempts INTEGER DEFAULT 0,
      PRIMARY KEY (team_id, level)
    );
  `);
}

// ================= SAFE EXCEL LOADER =================

function loadExcel(filePath, tableName) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

  if (!rawData.length) return;

  const columns = Object.keys(rawData[0]);

  // Drop table
  db.exec(`DROP TABLE IF EXISTS ${tableName}`);

  // Detect column types
  const columnDefs = columns.map(col => {
    const sampleValue = rawData.find(row => row[col] !== null)?.[col];

    if (typeof sampleValue === "number") {
      return `"${col}" REAL`;
    } else {
      return `"${col}" TEXT`;
    }
  }).join(",");

  db.exec(`CREATE TABLE ${tableName} (${columnDefs})`);

  const placeholders = columns.map(() => "?").join(",");
  const insertStmt = db.prepare(
    `INSERT INTO ${tableName} (${columns.map(c => `"${c}"`).join(",")})
     VALUES (${placeholders})`
  );

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      const values = columns.map(col => row[col] ?? null);
      insertStmt.run(values);
    }
  });

  insertMany(rawData);
}
// ================= INITIALIZE =================

function initializeDatabase() {
  createCoreTables();

  const basePath = path.join(__dirname, "../../data");

  loadExcel(path.join(basePath, "level1_users_data.xlsx"), "users");
  loadExcel(path.join(basePath, "level2_orders_data.xlsx"), "orders");
  loadExcel(path.join(basePath, "level3_payments_data.xlsx"), "payments");
  loadExcel(path.join(basePath, "level4_activity_logs.xlsx"), "activity_logs");

  console.log("Database initialized successfully with stable dynamic schema.");
}

module.exports = { db, initializeDatabase };