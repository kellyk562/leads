const { Pool } = require('pg');

// Use DATABASE_URL for PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize the database
async function initDatabase() {
  const client = await pool.connect();

  try {
    // Create leads table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
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
        priority TEXT DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High')),
        callback_date DATE,
        source TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create contact_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_history (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        contact_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        contact_method TEXT CHECK(contact_method IN ('Phone', 'Email', 'In-Person', 'Text', 'Other')),
        contact_person TEXT,
        notes TEXT,
        outcome TEXT,
        next_callback TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lead_contact_history ON contact_history(lead_id)`);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

// Helper to run queries and return results as objects
async function all(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// Helper to get single result
async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

// Helper to run insert/update/delete
async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return {
    lastInsertRowid: result.rows[0]?.id || 0,
    changes: result.rowCount
  };
}

// Export database helpers
module.exports = {
  initDatabase,
  all,
  get,
  run,
  pool
};
