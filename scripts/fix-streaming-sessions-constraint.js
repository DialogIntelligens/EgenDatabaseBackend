import pg from 'pg';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

async function fixStreamingSessionsConstraint() {
  try {
    console.log('Fixing streaming_sessions foreign key constraint...');
    
    // Drop the foreign key constraint if it exists
    await pool.query(`
      ALTER TABLE streaming_sessions 
      DROP CONSTRAINT IF EXISTS streaming_sessions_conversation_session_id_fkey
    `);
    
    console.log('✅ Foreign key constraint removed from streaming_sessions table');
    
    // Clean up any orphaned streaming sessions
    await pool.query(`
      DELETE FROM streaming_sessions 
      WHERE created_at < NOW() - INTERVAL '1 day'
    `);
    
    console.log('✅ Cleaned up old streaming sessions');
    
    // Clean up any orphaned streaming events
    await pool.query(`
      DELETE FROM streaming_events 
      WHERE created_at < NOW() - INTERVAL '1 hour'
    `);
    
    console.log('✅ Cleaned up old streaming events');
    
    console.log('🎉 Database fix complete!');
    console.log('\nThe streaming_sessions table now works without foreign key constraints.');
    console.log('This allows for more flexible session management.');
    
  } catch (error) {
    console.error('❌ Error fixing streaming sessions constraint:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixStreamingSessionsConstraint();
