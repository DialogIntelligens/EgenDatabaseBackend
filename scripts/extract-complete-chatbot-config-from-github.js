import pg from 'pg';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

// GitHub configuration for public repository
const GITHUB_REPO = 'DialogIntelligens/scripts';
const GITHUB_BRANCH = 'main';

/**
 * Extract complete chatbot configuration from public GitHub repository
 * This will extract all configuration values needed for the chatbot_settings table
 */

async function extractCompleteChatbotConfigFromGitHub() {
  try {
    console.log('🔍 Extracting complete chatbot configuration from public GitHub repository...');
    console.log(`📂 Repository: https://github.com/${GITHUB_REPO}`);
    
    // Step 1: Get list of all files in the repository
    console.log('📂 Fetching file list from GitHub...');
    const filesResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents?ref=${GITHUB_BRANCH}`
    );

    if (!filesResponse.ok) {
      throw new Error(`GitHub API error: ${filesResponse.status} ${filesResponse.statusText}`);
    }

    const files = await filesResponse.json();
    const jsFiles = files.filter(file => file.name.endsWith('.js') && file.type === 'file');
    
    console.log(`📄 Found ${jsFiles.length} JavaScript files to analyze:`);
    jsFiles.forEach(file => console.log(`  - ${file.name}`));

    // Step 2: Process each integration script
    const extractedConfigs = [];
    
    for (const file of jsFiles) {
      try {
        console.log(`\n🔍 Analyzing file: ${file.name}`);
        
        // Fetch file content directly from download_url
        const fileResponse = await fetch(file.download_url);
        if (!fileResponse.ok) {
          console.warn(`⚠️ Failed to fetch ${file.name}: ${fileResponse.status}`);
          continue;
        }
        
        const content = await fileResponse.text();
        
        // Extract configuration from the file
        const config = extractConfigFromScript(content, file.name);
        if (config) {
          extractedConfigs.push(config);
          console.log(`✅ Extracted config for chatbot: ${config.chatbot_id}`);
        } else {
          console.log(`⚠️ No chatbot config found in ${file.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Successfully extracted ${extractedConfigs.length} configurations`);

    // Step 2.5: Deduplicate by chatbot_id preferring the most complete config
    const byId = new Map();
    function score(cfg) {
      let s = 0;
      const keys = [
        'flow2_key','flow3_key','flow4_key','apiflow_key',
        'metadata_key','metadata2_key',
        'pinecone_api_key','knowledgebase_index_endpoint',
        'flow2_knowledgebase_index','flow3_knowledgebase_index','flow4_knowledgebase_index','apiflow_knowledgebase_index',
        'first_message','image_enabled','camera_button_enabled'
      ];
      for (const k of keys) if (cfg[k] !== undefined) s++;
      return s;
    }
    for (const cfg of extractedConfigs) {
      const existing = byId.get(cfg.chatbot_id);
      if (!existing || score(cfg) > score(existing)) {
        byId.set(cfg.chatbot_id, cfg);
      }
    }
    const uniqueConfigs = Array.from(byId.values());
    console.log(`\n🧹 After deduplication: ${uniqueConfigs.length} unique chatbot IDs`);

    // Step 3: Generate SQL file for complete table refresh
    if (uniqueConfigs.length > 0) {
      await generateSQLFile(uniqueConfigs);
    } else {
      console.log('⚠️ No configurations found to process');
    }

    console.log('\n🎉 Complete chatbot configuration extraction complete!');
    
  } catch (error) {
    console.error('❌ Error extracting chatbot configuration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Extract complete chatbot configuration from a JavaScript integration script
 */
function extractConfigFromScript(content, filename) {
  try {
    const config = {};

    // Helper: strict anchored property matcher
    const prop = (name) => new RegExp(`^\\s*${name}\\s*:\\s*["']([^"']+)["']`, 'm');
    const propBool = (name) => new RegExp(`^\\s*${name}\\s*:\\s*(true|false)\\b`, 'm');
    
    // Extract chatbot ID - this is required
    const chatbotIdMatch = content.match(prop('chatbotID'));
    if (!chatbotIdMatch) {
      return null; // Skip files without chatbot ID
    }
    config.chatbot_id = chatbotIdMatch[1];

    // Validate chatbot_id to avoid garbage matches
    if (!/^[A-Za-z0-9_-]+$/.test(config.chatbot_id)) {
      console.warn(`⚠️ Skipping invalid chatbot_id extracted from ${filename}: ${config.chatbot_id}`);
      return null;
    }

    // Extract flow keys
    const flow2KeyMatch = content.match(prop('flow2Key'));
    if (flow2KeyMatch) {
      config.flow2_key = flow2KeyMatch[1];
    }

    const flow3KeyMatch = content.match(prop('flow3Key'));
    if (flow3KeyMatch) {
      config.flow3_key = flow3KeyMatch[1];
    }

    const flow4KeyMatch = content.match(prop('flow4Key'));
    if (flow4KeyMatch) {
      config.flow4_key = flow4KeyMatch[1];
    }

    const apiFlowKeyMatch = content.match(prop('apiFlowKey'));
    if (apiFlowKeyMatch) {
      config.apiflow_key = apiFlowKeyMatch[1];
    }

    // Extract metadata keys
    const metaDataKeyMatch = content.match(prop('metaDataKey'));
    if (metaDataKeyMatch) {
      config.metadata_key = metaDataKeyMatch[1];
    }

    // Look for metadata2Key (might not exist in all scripts)
    const metaData2KeyMatch = content.match(prop('metaData2Key'));
    if (metaData2KeyMatch) {
      config.metadata2_key = metaData2KeyMatch[1];
    }

    // Extract Pinecone configuration
    const pineconeApiKeyMatch = content.match(prop('pineconeApiKey'));
    if (pineconeApiKeyMatch) {
      config.pinecone_api_key = pineconeApiKeyMatch[1];
    }

    const knowledgebaseMatch = content.match(prop('knowledgebaseIndexApiEndpoint'));
    if (knowledgebaseMatch) {
      config.knowledgebase_index_endpoint = knowledgebaseMatch[1];
    }

    // Extract flow-specific knowledgebase indexes
    const flow2KnowledgebaseMatch = content.match(prop('flow2KnowledgebaseIndex'));
    if (flow2KnowledgebaseMatch) {
      config.flow2_knowledgebase_index = flow2KnowledgebaseMatch[1];
    }

    const flow3KnowledgebaseMatch = content.match(prop('flow3KnowledgebaseIndex'));
    if (flow3KnowledgebaseMatch) {
      config.flow3_knowledgebase_index = flow3KnowledgebaseMatch[1];
    }

    const flow4KnowledgebaseMatch = content.match(prop('flow4KnowledgebaseIndex'));
    if (flow4KnowledgebaseMatch) {
      config.flow4_knowledgebase_index = flow4KnowledgebaseMatch[1];
    }

    const apiFlowKnowledgebaseMatch = content.match(prop('apiFlowKnowledgebaseIndex'));
    if (apiFlowKnowledgebaseMatch) {
      config.apiflow_knowledgebase_index = apiFlowKnowledgebaseMatch[1];
    }

    // Extract first message
    const firstMessageMatch = content.match(prop('firstMessage'));
    if (firstMessageMatch) {
      config.first_message = firstMessageMatch[1];
    }

    // Extract boolean flags (look for true/false values)
    const imageEnabledMatch = content.match(propBool('imageEnabled'));
    if (imageEnabledMatch) {
      config.image_enabled = imageEnabledMatch[1] === 'true';
    }

    const cameraButtonEnabledMatch = content.match(propBool('cameraButtonEnabled'));
    if (cameraButtonEnabledMatch) {
      config.camera_button_enabled = cameraButtonEnabledMatch[1] === 'true';
    }

    // Log what we found
    console.log(`📋 Configuration extracted for ${config.chatbot_id}:`);
    console.log(`  Flow2 Key: ${config.flow2_key || 'Not found'}`);
    console.log(`  Flow3 Key: ${config.flow3_key || 'Not found'}`);
    console.log(`  Flow4 Key: ${config.flow4_key || 'Not found'}`);
    console.log(`  API Flow Key: ${config.apiflow_key || 'Not found'}`);
    console.log(`  Metadata Key: ${config.metadata_key || 'Not found'}`);
    console.log(`  Metadata2 Key: ${config.metadata2_key || 'Not found'}`);
    console.log(`  Pinecone API Key: ${config.pinecone_api_key ? config.pinecone_api_key.substring(0, 20) + '...' : 'Not found'}`);
    console.log(`  Default Index: ${config.knowledgebase_index_endpoint || 'Not found'}`);
    console.log(`  Flow2 Index: ${config.flow2_knowledgebase_index || 'Not found'}`);
    console.log(`  Flow3 Index: ${config.flow3_knowledgebase_index || 'Not found'}`);
    console.log(`  Flow4 Index: ${config.flow4_knowledgebase_index || 'Not found'}`);
    console.log(`  API Flow Index: ${config.apiflow_knowledgebase_index || 'Not found'}`);
    console.log(`  First Message: ${config.first_message ? config.first_message.substring(0, 50) + '...' : 'Not found'}`);
    console.log(`  Image Enabled: ${config.image_enabled !== undefined ? config.image_enabled : 'Not found'}`);
    console.log(`  Camera Button Enabled: ${config.camera_button_enabled !== undefined ? config.camera_button_enabled : 'Not found'}`);

    return config;

  } catch (error) {
    console.error(`Error extracting config from ${filename}:`, error);
    return null;
  }
}

/**
 * Generate SQL file for complete table refresh
 */
async function generateSQLFile(configs) {
  const sqlContent = [];
  
  // Helper to escape SQL string values safely
  const esc = (val) => String(val).replace(/'/g, "''");
  
  // Header comment
  sqlContent.push('-- Complete Chatbot Settings Table Refresh');
  sqlContent.push('-- Generated automatically from GitHub integration scripts');
  sqlContent.push(`-- Generated on: ${new Date().toISOString()}`);
  sqlContent.push(`-- Found ${configs.length} chatbot configurations`);
  sqlContent.push('');
  
  // Step 1: Delete all existing records
  sqlContent.push('-- Step 1: Clear existing chatbot settings');
  sqlContent.push('DELETE FROM chatbot_settings;');
  sqlContent.push('');
  
  // Step 2: Reset the sequence if using auto-increment ID
  sqlContent.push('-- Step 2: Reset the ID sequence');
  sqlContent.push('ALTER SEQUENCE chatbot_settings_id_seq RESTART WITH 1;');
  sqlContent.push('');
  
  // Step 3: Insert all configurations
  sqlContent.push('-- Step 3: Insert all chatbot configurations');
  sqlContent.push('');
  
  configs.forEach((config, index) => {
    sqlContent.push(`-- Configuration ${index + 1}: ${config.chatbot_id}`);
    
    // Build the INSERT statement
    const fields = [];
    const values = [];
    
    // Always include chatbot_id
    fields.push('chatbot_id');
    values.push(`'${esc(config.chatbot_id)}'`);
    
    // Add other fields if they exist
    if (config.flow2_key) {
      fields.push('flow2_key');
      values.push(`'${esc(config.flow2_key)}'`);
    }
    
    if (config.flow3_key) {
      fields.push('flow3_key');
      values.push(`'${esc(config.flow3_key)}'`);
    }
    
    if (config.flow4_key) {
      fields.push('flow4_key');
      values.push(`'${esc(config.flow4_key)}'`);
    }
    
    if (config.apiflow_key) {
      fields.push('apiflow_key');
      values.push(`'${esc(config.apiflow_key)}'`);
    }
    
    if (config.metadata_key) {
      fields.push('metadata_key');
      values.push(`'${esc(config.metadata_key)}'`);
    }
    
    if (config.metadata2_key) {
      fields.push('metadata2_key');
      values.push(`'${esc(config.metadata2_key)}'`);
    }
    
    if (config.pinecone_api_key) {
      fields.push('pinecone_api_key');
      values.push(`'${esc(config.pinecone_api_key)}'`);
    }
    
    if (config.knowledgebase_index_endpoint) {
      fields.push('knowledgebase_index_endpoint');
      values.push(`'${esc(config.knowledgebase_index_endpoint)}'`);
    }
    
    if (config.flow2_knowledgebase_index) {
      fields.push('flow2_knowledgebase_index');
      values.push(`'${esc(config.flow2_knowledgebase_index)}'`);
    }
    
    if (config.flow3_knowledgebase_index) {
      fields.push('flow3_knowledgebase_index');
      values.push(`'${esc(config.flow3_knowledgebase_index)}'`);
    }
    
    if (config.flow4_knowledgebase_index) {
      fields.push('flow4_knowledgebase_index');
      values.push(`'${esc(config.flow4_knowledgebase_index)}'`);
    }
    
    if (config.apiflow_knowledgebase_index) {
      fields.push('apiflow_knowledgebase_index');
      values.push(`'${esc(config.apiflow_knowledgebase_index)}'`);
    }
    
    if (config.first_message) {
      fields.push('first_message');
      values.push(`'${esc(config.first_message)}'`);
    }
    
    if (config.image_enabled !== undefined) {
      fields.push('image_enabled');
      values.push(config.image_enabled ? 'true' : 'false');
    }
    
    if (config.camera_button_enabled !== undefined) {
      fields.push('camera_button_enabled');
      values.push(config.camera_button_enabled ? 'true' : 'false');
    }
    
    // Always add timestamps
    fields.push('created_at', 'updated_at');
    values.push('NOW()', 'NOW()');
    
    // Build the complete INSERT statement
    sqlContent.push(`INSERT INTO chatbot_settings (${fields.join(', ')})`);
    sqlContent.push(`VALUES (${values.join(', ')});`);
    sqlContent.push('');
  });
  
  // Step 4: Verification query
  sqlContent.push('-- Step 4: Verify the inserted data');
  sqlContent.push(`SELECT 
  chatbot_id,
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key,
  pinecone_api_key IS NOT NULL as has_pinecone_key,
  knowledgebase_index_endpoint,
  flow2_knowledgebase_index,
  flow3_knowledgebase_index,
  flow4_knowledgebase_index,
  apiflow_knowledgebase_index,
  first_message IS NOT NULL as has_first_message,
  image_enabled,
  camera_button_enabled,
  created_at,
  updated_at
FROM chatbot_settings 
ORDER BY chatbot_id;`);
  
  // Write to file
  const sqlFilePath = path.join(process.cwd(), 'chatbot_settings_refresh.sql');
  fs.writeFileSync(sqlFilePath, sqlContent.join('\n'));
  
  console.log(`\n📝 SQL file generated: ${sqlFilePath}`);
  console.log('\n📋 Summary of SQL operations:');
  console.log(`  - DELETE all existing records`);
  console.log(`  - RESET ID sequence`);
  console.log(`  - INSERT ${configs.length} new configurations`);
  console.log(`  - VERIFY inserted data`);
  console.log('\n✅ You can now run this SQL file in pgAdmin to refresh the chatbot_settings table');
}

// Run the extraction
extractCompleteChatbotConfigFromGitHub();
