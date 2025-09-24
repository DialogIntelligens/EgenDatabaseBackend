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

/**
 * Extract Pinecone configuration from local integration script
 * This analyzes your It_script_new.js file to extract the configuration
 */

async function extractPineconeConfigLocal() {
  try {
    console.log('🔍 Extracting Pinecone configuration from local integration script...');
    
    // Read the It_script_new.js file
    const scriptPath = path.join(__dirname, '..', '..', 'It_script_new.js');
    
    if (!fs.existsSync(scriptPath)) {
      console.error('❌ It_script_new.js file not found at:', scriptPath);
      process.exit(1);
    }
    
    const content = fs.readFileSync(scriptPath, 'utf8');
    console.log('📄 Read integration script file');
    
    // Extract configuration
    const config = extractConfigFromScript(content, 'It_script_new.js');
    
    if (!config) {
      console.error('❌ No configuration found in the integration script');
      process.exit(1);
    }
    
    console.log('✅ Extracted configuration:', config);
    
    // Update database
    await updateDatabaseWithConfig(config);
    
    console.log('\n🎉 Local Pinecone configuration extraction complete!');
    
  } catch (error) {
    console.error('❌ Error extracting local Pinecone configuration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Extract Pinecone configuration from a JavaScript integration script
 */
function extractConfigFromScript(content, filename) {
  try {
    const config = {};
    
    // Extract chatbot ID
    const chatbotIdMatch = content.match(/chatbotID:\s*["']([^"']+)["']/);
    if (!chatbotIdMatch) {
      console.log(`⚠️ No chatbotID found in ${filename}`);
      return null;
    }
    config.chatbotId = chatbotIdMatch[1];

    // Extract Pinecone API key
    const apiKeyMatch = content.match(/pineconeApiKey:\s*["']([^"']+)["']/);
    if (apiKeyMatch) {
      config.pineconeApiKey = apiKeyMatch[1];
    }

    // Extract knowledgebase index endpoint
    const knowledgebaseMatch = content.match(/knowledgebaseIndexApiEndpoint:\s*["']([^"']+)["']/);
    if (knowledgebaseMatch) {
      config.knowledgebaseIndexEndpoint = knowledgebaseMatch[1];
    }

    // Extract flow-specific indexes
    const flow2Match = content.match(/flow2KnowledgebaseIndex:\s*["']([^"']+)["']/);
    if (flow2Match) {
      config.flow2KnowledgebaseIndex = flow2Match[1];
    }

    const flow3Match = content.match(/flow3KnowledgebaseIndex:\s*["']([^"']+)["']/);
    if (flow3Match) {
      config.flow3KnowledgebaseIndex = flow3Match[1];
    }

    const flow4Match = content.match(/flow4KnowledgebaseIndex:\s*["']([^"']+)["']/);
    if (flow4Match) {
      config.flow4KnowledgebaseIndex = flow4Match[1];
    }

    const apiFlowMatch = content.match(/apiFlowKnowledgebaseIndex:\s*["']([^"']+)["']/);
    if (apiFlowMatch) {
      config.apiFlowKnowledgebaseIndex = apiFlowMatch[1];
    }

    // Log what we found
    console.log(`📋 Found configuration for ${config.chatbotId}:`);
    console.log(`  API Key: ${config.pineconeApiKey ? config.pineconeApiKey.substring(0, 20) + '...' : 'Not found'}`);
    console.log(`  Default Index: ${config.knowledgebaseIndexEndpoint || 'Not found'}`);
    console.log(`  Flow2 Index: ${config.flow2KnowledgebaseIndex || 'Not found'}`);
    console.log(`  Flow3 Index: ${config.flow3KnowledgebaseIndex || 'Not found'}`);
    console.log(`  Flow4 Index: ${config.flow4KnowledgebaseIndex || 'Not found'}`);
    console.log(`  API Flow Index: ${config.apiFlowKnowledgebaseIndex || 'Not found'}`);

    return config;

  } catch (error) {
    console.error(`Error extracting config from ${filename}:`, error);
    return null;
  }
}

/**
 * Update database with extracted configuration
 */
async function updateDatabaseWithConfig(config) {
  try {
    console.log('\n💾 Updating database with extracted configuration...');
    
    // Upsert into chatbot_settings table
    const result = await pool.query(`
      INSERT INTO chatbot_settings (
        chatbot_id,
        pinecone_api_key,
        knowledgebase_index_endpoint,
        flow2_knowledgebase_index,
        flow3_knowledgebase_index,
        flow4_knowledgebase_index,
        apiflow_knowledgebase_index,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (chatbot_id) 
      DO UPDATE SET
        pinecone_api_key = COALESCE($2, chatbot_settings.pinecone_api_key),
        knowledgebase_index_endpoint = COALESCE($3, chatbot_settings.knowledgebase_index_endpoint),
        flow2_knowledgebase_index = COALESCE($4, chatbot_settings.flow2_knowledgebase_index),
        flow3_knowledgebase_index = COALESCE($5, chatbot_settings.flow3_knowledgebase_index),
        flow4_knowledgebase_index = COALESCE($6, chatbot_settings.flow4_knowledgebase_index),
        apiflow_knowledgebase_index = COALESCE($7, chatbot_settings.apiflow_knowledgebase_index),
        updated_at = NOW()
      RETURNING chatbot_id
    `, [
      config.chatbotId,
      config.pineconeApiKey || null,
      config.knowledgebaseIndexEndpoint || null,
      config.flow2KnowledgebaseIndex || null,
      config.flow3KnowledgebaseIndex || null,
      config.flow4KnowledgebaseIndex || null,
      config.apiFlowKnowledgebaseIndex || null
    ]);

    if (result.rows.length > 0) {
      console.log(`✅ Updated chatbot_settings for: ${config.chatbotId}`);
      
      // Log what was updated
      const updates = [];
      if (config.pineconeApiKey) updates.push('API key');
      if (config.knowledgebaseIndexEndpoint) updates.push('default index');
      if (config.flow2KnowledgebaseIndex) updates.push('flow2 index');
      if (config.flow3KnowledgebaseIndex) updates.push('flow3 index');
      if (config.flow4KnowledgebaseIndex) updates.push('flow4 index');
      if (config.apiFlowKnowledgebaseIndex) updates.push('apiflow index');
      
      console.log(`   📋 Updated: ${updates.join(', ')}`);
    }
    
    // Show final state
    const finalResult = await pool.query(`
      SELECT 
        chatbot_id,
        pinecone_api_key IS NOT NULL as has_api_key,
        knowledgebase_index_endpoint,
        flow2_knowledgebase_index,
        flow3_knowledgebase_index,
        flow4_knowledgebase_index,
        apiflow_knowledgebase_index
      FROM chatbot_settings 
      WHERE chatbot_id = $1
    `, [config.chatbotId]);
    
    if (finalResult.rows.length > 0) {
      const row = finalResult.rows[0];
      console.log(`\n📊 Final configuration for ${row.chatbot_id}:`);
      console.log(`  API Key: ${row.has_api_key ? 'Stored' : 'Missing'}`);
      console.log(`  Default Index: ${row.knowledgebase_index_endpoint || 'None'}`);
      console.log(`  Flow2 Index: ${row.flow2_knowledgebase_index || 'None'}`);
      console.log(`  Flow3 Index: ${row.flow3_knowledgebase_index || 'None'}`);
      console.log(`  Flow4 Index: ${row.flow4_knowledgebase_index || 'None'}`);
      console.log(`  API Flow Index: ${row.apiflow_knowledgebase_index || 'None'}`);
    }
    
  } catch (error) {
    console.error('Error updating database:', error);
    throw error;
  }
}

// Run the extraction
extractPineconeConfigLocal();
