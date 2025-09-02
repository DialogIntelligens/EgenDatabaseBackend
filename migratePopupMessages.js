/**
 * Migration Script: Move Popup Messages from GitHub Scripts to Database
 * 
 * This script helps migrate existing popup messages from GitHub script files
 * to the new database-driven system while maintaining backwards compatibility.
 */

import pg from 'pg';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

// GitHub configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'DialogIntelligens';
const REPO = 'scripts';

// Helper function to decode base64
function base64ToUtf8(str) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

// Helper function to parse popup text from script
function parseVariableDeclaration(scriptString, variableName) {
  const pattern = new RegExp(`const\\s+${variableName}\\s*=\\s*"([^"]*)"`, 'gs');
  const match = pattern.exec(scriptString);
  if (match && match[1]) {
    return match[1]
      .replace(/\\"/g, '"')     // Unescape quotes
      .replace(/\\n/g, '\n')    // Convert \n to actual newlines
      .replace(/\\r/g, '\r')    // Convert \r to actual carriage returns
      .replace(/\\t/g, '\t')    // Convert \t to actual tabs
      .replace(/\\\\/g, '\\');  // Unescape backslashes (do this last)
  }
  return '';
}

// Helper function to parse chatbot ID from script
function parseField(scriptString, fieldName) {
  const pattern = new RegExp(`\\b${fieldName}\\s*:\\s*"([^"]*)"`, 'gs');
  const match = pattern.exec(scriptString);
  if (match && match[1]) {
    return match[1]
      .replace(/\\"/g, '"')     // Unescape quotes
      .replace(/\\n/g, '\n')    // Convert \n to actual newlines
      .replace(/\\r/g, '\r')    // Convert \r to actual carriage returns
      .replace(/\\t/g, '\t')    // Convert \t to actual tabs
      .replace(/\\\\/g, '\\');  // Unescape backslashes (do this last)
  }
  return '';
}

// Fetch script content from GitHub
async function fetchScriptContent(filePath) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${response.status} - ${response.statusText}`);
  }
  
  return response.json();
}

// Main migration function
async function migratePopupMessages() {
  console.log('Starting popup message migration...');
  
  try {
    // Get all users with chatbot filepaths
    const usersResult = await pool.query(`
      SELECT id, username, chatbot_ids, chatbot_filepath 
      FROM users 
      WHERE chatbot_filepath IS NOT NULL AND array_length(chatbot_filepath, 1) > 0
    `);
    
    console.log(`Found ${usersResult.rows.length} users with chatbot filepaths`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const user of usersResult.rows) {
      console.log(`\nProcessing user: ${user.username} (ID: ${user.id})`);
      
      const chatbotIds = Array.isArray(user.chatbot_ids) ? user.chatbot_ids : JSON.parse(user.chatbot_ids || '[]');
      const filepaths = Array.isArray(user.chatbot_filepath) ? user.chatbot_filepath : user.chatbot_filepath;
      
      // Process each chatbot for this user
      for (let i = 0; i < filepaths.length; i++) {
        const filepath = filepaths[i];
        const chatbotId = chatbotIds[i] || `chatbot_${i}`;
        
        try {
          console.log(`  Processing chatbot: ${chatbotId} (${filepath})`);
          
          // Check if popup message already exists in database
          const existingResult = await pool.query(
            'SELECT id FROM popup_messages WHERE user_id = $1 AND chatbot_id = $2',
            [user.id, chatbotId]
          );
          
          if (existingResult.rows.length > 0) {
            console.log(`    Skipping - popup message already exists in database`);
            skippedCount++;
            continue;
          }
          
          // Fetch script from GitHub
          const fileData = await fetchScriptContent(filepath);
          const scriptContent = base64ToUtf8(fileData.content);
          
          // Parse popup message from script
          const popupText = parseVariableDeclaration(scriptContent, 'popupText');
          
          if (popupText && popupText.trim() !== '') {
            // Save to database
            await pool.query(`
              INSERT INTO popup_messages (user_id, chatbot_id, popup_message, is_active)
              VALUES ($1, $2, $3, true)
              ON CONFLICT (user_id, chatbot_id) DO NOTHING
            `, [user.id, chatbotId, popupText]);
            
            console.log(`    ✅ Migrated popup message: "${popupText}"`);
            migratedCount++;
          } else {
            console.log(`    ⏭️  No popup message found in script`);
            skippedCount++;
          }
          
        } catch (error) {
          console.error(`    ❌ Error processing ${chatbotId}:`, error.message);
          errorCount++;
        }
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`Migrated: ${migratedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total processed: ${migratedCount + skippedCount + errorCount}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migratePopupMessages();
}

export { migratePopupMessages };
