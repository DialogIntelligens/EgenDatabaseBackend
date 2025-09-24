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

// Handle missing DATABASE_URL for local development
if (!process.env.DATABASE_URL) {
  console.log('⚠️  DATABASE_URL not set. Please set your database connection string.');
  console.log('For local development, you can run this after setting up your database.');
  process.exit(0);
}

async function setupConversationProcessing() {
  try {
    console.log('Setting up conversation processing database tables...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', 'create_conversation_processing_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Conversation processing tables created successfully!');
    
    // Verify the tables were created
    const tables = ['conversation_sessions', 'streaming_sessions', 'streaming_events', 'conversation_processing_metrics'];
    
    for (const tableName of tables) {
      const tableCheck = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      console.log(`\n📋 Table: ${tableName}`);
      tableCheck.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
      });
    }
    
    // Check indexes
    const indexCheck = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE tablename IN ('conversation_sessions', 'streaming_sessions', 'streaming_events', 'conversation_processing_metrics')
      ORDER BY tablename, indexname
    `);
    
    console.log('\n🔍 Indexes created:');
    indexCheck.rows.forEach(row => {
      console.log(`  ${row.indexname}`);
    });
    
    console.log('\n🎉 Conversation processing setup complete!');
    console.log('\nNext steps:');
    console.log('1. Register the new routes in your main server file');
    console.log('2. Test the new endpoints');
    console.log('3. Update frontend to use new backend processing');
    console.log('\nNew endpoints available:');
    console.log('- POST /api/process-message - Main conversation processing');
    console.log('- GET /api/stream-events/:sessionId - Get streaming events');
    console.log('- GET /api/conversation-config/:chatbotId - Get configuration');
    console.log('- POST /api/upload-image - Image processing');
    console.log('- GET /api/conversation-health - Health check');
    
  } catch (error) {
    console.error('❌ Error setting up conversation processing:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the setup
setupConversationProcessing();
