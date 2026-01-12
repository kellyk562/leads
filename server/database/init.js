const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/leads.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let SQL = null;

// Initialize the database
async function initDatabase() {
  if (db) return db;

  SQL = await initSqlJs();

  // Try to load existing database
  try {
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log('Loaded existing database from:', dbPath);
    } else {
      db = new SQL.Database();
      console.log('Created new database');
    }
  } catch (error) {
    console.error('Error loading database, creating new one:', error);
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_date DATE NOT NULL,
      dispensary_name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      dispensary_number TEXT,
      contact_name TEXT,
      contact_position TEXT,
      manager_name TEXT,
      owner_name TEXT,
      contact_number TEXT,
      contact_email TEXT,
      website TEXT,
      license_number TEXT,
      current_pos_system TEXT,
      estimated_revenue TEXT,
      number_of_locations INTEGER DEFAULT 1,
      notes TEXT,
      callback_days TEXT,
      callback_time_slots TEXT,
      callback_time_from TEXT,
      callback_time_to TEXT,
      status TEXT DEFAULT 'Prospects' CHECK(status IN ('Interested', 'Prospects', 'New Customer', 'Closed')),
      priority TEXT DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High', 'Urgent')),
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS contact_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      contact_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      contact_method TEXT CHECK(contact_method IN ('Phone', 'Email', 'In-Person', 'Text', 'Other')),
      contact_person TEXT,
      notes TEXT,
      outcome TEXT,
      next_callback DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_status ON leads(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lead_contact_history ON contact_history(lead_id)`);

  // Migration: Add callback_date column if it doesn't exist
  try {
    db.run(`ALTER TABLE leads ADD COLUMN callback_date DATE`);
    console.log('Added callback_date column');
  } catch (e) {
    // Column already exists, ignore
  }

  // Save the database
  saveDatabase();

  console.log('Database initialized successfully');
  return db;
}

// Save database to file
function saveDatabase() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (error) {
      console.error('Error saving database:', error);
    }
  }
}

// Helper to run queries and return results as objects
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to get single result
function get(sql, params = []) {
  const results = all(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper to run insert/update/delete
function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return {
    lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0,
    changes: db.getRowsModified()
  };
}

// Export database helpers
module.exports = {
  initDatabase,
  getDb: () => db,
  all,
  get,
  run,
  saveDatabase
};
