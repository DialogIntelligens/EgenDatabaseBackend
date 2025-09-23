import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

async function setupFreshdeskQueue() {
  try {
    console.log('Setting up Freshdesk queue database table...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', 'create_freshdesk_queue_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Freshdesk queue table created successfully!');
    
    // Verify the table was created
    const tableCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'freshdesk_ticket_queue'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Table structure:');
    tableCheck.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
    });
    
    // Check indexes
    const indexCheck = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE tablename = 'freshdesk_ticket_queue'
    `);
    
    console.log('\n🔍 Indexes created:');
    indexCheck.rows.forEach(row => {
      console.log(`  ${row.indexname}`);
    });
    
    console.log('\n🎉 Freshdesk queue setup complete!');
    console.log('\nNext steps:');
    console.log('1. Restart your backend server');
    console.log('2. The queue will process tickets automatically every minute');
    console.log('3. Monitor queue status at: GET /api/freshdesk-queue/stats');
    console.log('4. Manual processing: POST /api/freshdesk-queue/process');
    
  } catch (error) {
    console.error('❌ Error setting up Freshdesk queue:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the setup
setupFreshdeskQueue();
