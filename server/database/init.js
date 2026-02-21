const { Pool } = require('pg');

// Use DATABASE_URL for PostgreSQL connection
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is not set!');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('neon.tech') ? { rejectUnauthorized: false } :
       (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false)
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// Initialize the database
async function initDatabase() {
  console.log('Connecting to PostgreSQL database...');
  const client = await pool.connect();
  console.log('Connected to PostgreSQL successfully');

  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed Ken user
    await client.query(`
      INSERT INTO users (id, name) VALUES (1, 'ken')
      ON CONFLICT (name) DO NOTHING
    `);

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
        stage TEXT DEFAULT 'New Lead' CHECK(stage IN ('New Lead', 'Contacted', 'Demo Scheduled', 'Demo Completed', 'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost')),
        deal_value NUMERIC(12,2),
        callback_date DATE,
        source TEXT,
        user_id INTEGER REFERENCES users(id) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add user_id column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leads' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE leads ADD COLUMN user_id INTEGER REFERENCES users(id) DEFAULT 1;
        END IF;
      END $$;
    `);

    // Add stage column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leads' AND column_name = 'stage'
        ) THEN
          ALTER TABLE leads ADD COLUMN stage TEXT DEFAULT 'New Lead';
        END IF;
      END $$;
    `);
    await client.query(`UPDATE leads SET stage = 'New Lead' WHERE stage IS NULL`);

    // Add deal_value column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leads' AND column_name = 'deal_value'
        ) THEN
          ALTER TABLE leads ADD COLUMN deal_value NUMERIC(12,2);
        END IF;
      END $$;
    `);

    // Create tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        due_date DATE NOT NULL,
        due_time TIME,
        priority TEXT DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High')),
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
        completed_at TIMESTAMP,
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

    // Create email_templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add email_template_id column to contact_history if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'contact_history' AND column_name = 'email_template_id'
        ) THEN
          ALTER TABLE contact_history ADD COLUMN email_template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Add email_subject column to contact_history if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'contact_history' AND column_name = 'email_subject'
        ) THEN
          ALTER TABLE contact_history ADD COLUMN email_subject TEXT;
        END IF;
      END $$;
    `);

    // Add source column to tasks (for auto-reminder tracking)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tasks' AND column_name = 'source'
        ) THEN
          ALTER TABLE tasks ADD COLUMN source TEXT;
        END IF;
      END $$;
    `);

    // Add cadence_step column to leads (sequence/cadence tracking)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leads' AND column_name = 'cadence_step'
        ) THEN
          ALTER TABLE leads ADD COLUMN cadence_step INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lead_contact_history ON contact_history(lead_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON tasks(lead_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contact_history_contact_date ON contact_history(lead_id, contact_date DESC)`);

    // Seed default email templates (only if table is empty)
    const templateCount = await client.query('SELECT COUNT(*) as count FROM email_templates');
    if (parseInt(templateCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO email_templates (name, subject, body, category, is_default) VALUES
        (
          'Introduction',
          'Elevate Your Dispensary Operations at {{dispensary_name}}',
          'Hi {{contact_name}},

I hope this message finds you well. My name is Ken, and I specialize in helping dispensaries like {{dispensary_name}} streamline their operations with modern point-of-sale solutions.

I noticed you''re currently using {{current_pos_system}}, and I''d love to show you how our platform can help improve efficiency, compliance tracking, and customer experience.

Would you be open to a brief call this week to discuss how we can support {{dispensary_name}}?

Best regards,
Ken',
          'Intro',
          true
        ),
        (
          'Follow-Up',
          'Following Up - POS Solutions for {{dispensary_name}}',
          'Hi {{contact_name}},

I wanted to follow up on my previous message about upgrading the point-of-sale system at {{dispensary_name}}.

I understand you''re busy, but I truly believe we can help improve your day-to-day operations. Many dispensaries that switched from {{current_pos_system}} have seen significant improvements in checkout speed and inventory accuracy.

Do you have 15 minutes this week for a quick chat?

Best regards,
Ken',
          'Follow-Up',
          true
        ),
        (
          'Proposal',
          'POS Proposal for {{dispensary_name}}',
          'Hi {{contact_name}},

Thank you for taking the time to learn about our POS solutions. As discussed, I''ve put together a proposal tailored specifically for {{dispensary_name}}.

Here''s a summary of what we''re proposing:
- Full POS system setup and configuration
- Staff training and onboarding support
- Ongoing technical support and updates
- Compliance and reporting tools

I''d love to walk you through the details. Please let me know a convenient time to connect.

Best regards,
Ken',
          'Proposal',
          true
        ),
        (
          'Demo Confirmation',
          'Demo Confirmed - {{dispensary_name}}',
          'Hi {{contact_name}},

This is a quick confirmation that your demo has been scheduled. I''m looking forward to showing you how our POS platform can benefit {{dispensary_name}}.

During the demo, we''ll cover:
- Live system walkthrough
- Integration with your current workflow
- Compliance and reporting features
- Q&A

If you need to reschedule, just let me know. See you soon!

Best regards,
Ken',
          'Demo',
          true
        )
      `);
      console.log('Seeded 4 default email templates');
    }

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
