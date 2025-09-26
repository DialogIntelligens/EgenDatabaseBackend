import pg from 'pg';
import fetch from 'node-fetch';

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
 * Extracts all configuration values needed for the chatbot_settings table
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
          console.log(`✅ Extracted config for chatbot: ${config.chatbotId}`);
        } else {
          console.log(`⚠️ No chatbot config found in ${file.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Successfully extracted ${extractedConfigs.length} configurations`);

    // Step 3: Generate SQL statements for manual execution
    if (extractedConfigs.length > 0) {
      generateCompleteSQLStatements(extractedConfigs);
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
    
    // Extract chatbot ID - this is required
    const chatbotIdMatch = content.match(/chatbotID:\s*["']([^"']+)["']/);
    if (!chatbotIdMatch) {
      return null; // Skip files without chatbotID
    }
    config.chatbotId = chatbotIdMatch[1];

    // Extract flow keys
    const flow2KeyMatch = content.match(/flow2Key:\s*["']([^"']+)["']/);
    if (flow2KeyMatch) {
      config.flow2Key = flow2KeyMatch[1];
    }

    const flow3KeyMatch = content.match(/flow3Key:\s*["']([^"']+)["']/);
    if (flow3KeyMatch) {
      config.flow3Key = flow3KeyMatch[1];
    }

    const flow4KeyMatch = content.match(/flow4Key:\s*["']([^"']+)["']/);
    if (flow4KeyMatch) {
      config.flow4Key = flow4KeyMatch[1];
    }

    const apiFlowKeyMatch = content.match(/apiFlowKey:\s*["']([^"']+)["']/);
    if (apiFlowKeyMatch) {
      config.apiFlowKey = apiFlowKeyMatch[1];
    }

    // Extract metadata keys
    const metaDataKeyMatch = content.match(/metaDataKey:\s*["']([^"']+)["']/);
    if (metaDataKeyMatch) {
      config.metadataKey = metaDataKeyMatch[1];
    }

    // Look for metadata2Key if it exists
    const metaData2KeyMatch = content.match(/metaData2Key:\s*["']([^"']+)["']/);
    if (metaData2KeyMatch) {
      config.metadata2Key = metaData2KeyMatch[1];
    }

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
    const flow2IndexMatch = content.match(/flow2KnowledgebaseIndex:\s*["']([^"']+)["']/);
    if (flow2IndexMatch) {
      config.flow2KnowledgebaseIndex = flow2IndexMatch[1];
    }

    const flow3IndexMatch = content.match(/flow3KnowledgebaseIndex:\s*["']([^"']+)["']/);
    if (flow3IndexMatch) {
      config.flow3KnowledgebaseIndex = flow3IndexMatch[1];
    }

    const flow4IndexMatch = content.match(/flow4KnowledgebaseIndex:\s*["']([^"']+)["']/);
    if (flow4IndexMatch) {
      config.flow4KnowledgebaseIndex = flow4IndexMatch[1];
    }

    const apiFlowIndexMatch = content.match(/apiFlowKnowledgebaseIndex:\s*["']([^"']+)["']/);
    if (apiFlowIndexMatch) {
      config.apiFlowKnowledgebaseIndex = apiFlowIndexMatch[1];
    }

    // Extract first message
    const firstMessageMatch = content.match(/firstMessage:\s*["']([^"']+)["']/);
    if (firstMessageMatch) {
      config.firstMessage = firstMessageMatch[1];
    }

    // Extract boolean flags if they exist
    const imageEnabledMatch = content.match(/imageEnabled:\s*(true|false)/);
    if (imageEnabledMatch) {
      config.imageEnabled = imageEnabledMatch[1] === 'true';
    }

    const cameraButtonEnabledMatch = content.match(/cameraButtonEnabled:\s*(true|false)/);
    if (cameraButtonEnabledMatch) {
      config.cameraButtonEnabled = cameraButtonEnabledMatch[1] === 'true';
    }

    // Log what we found
    console.log(`📋 Found configuration for ${config.chatbotId}:`);
    console.log(`  Flow2 Key: ${config.flow2Key || 'Not found'}`);
    console.log(`  Flow3 Key: ${config.flow3Key || 'Not found'}`);
    console.log(`  Flow4 Key: ${config.flow4Key || 'Not found'}`);
    console.log(`  API Flow Key: ${config.apiFlowKey || 'Not found'}`);
    console.log(`  Metadata Key: ${config.metadataKey || 'Not found'}`);
    console.log(`  Metadata2 Key: ${config.metadata2Key || 'Not found'}`);
    console.log(`  API Key: ${config.pineconeApiKey ? config.pineconeApiKey.substring(0, 20) + '...' : 'Not found'}`);
    console.log(`  Default Index: ${config.knowledgebaseIndexEndpoint || 'Not found'}`);
    console.log(`  Flow2 Index: ${config.flow2KnowledgebaseIndex || 'Not found'}`);
    console.log(`  Flow3 Index: ${config.flow3KnowledgebaseIndex || 'Not found'}`);
    console.log(`  Flow4 Index: ${config.flow4KnowledgebaseIndex || 'Not found'}`);
    console.log(`  API Flow Index: ${config.apiFlowKnowledgebaseIndex || 'Not found'}`);
    console.log(`  First Message: ${config.firstMessage ? config.firstMessage.substring(0, 50) + '...' : 'Not found'}`);
    console.log(`  Image Enabled: ${config.imageEnabled !== undefined ? config.imageEnabled : 'Not found'}`);
    console.log(`  Camera Button Enabled: ${config.cameraButtonEnabled !== undefined ? config.cameraButtonEnabled : 'Not found'}`);

    return config;

  } catch (error) {
    console.error(`Error extracting config from ${filename}:`, error);
    return null;
  }
}

/**
 * Generate complete SQL statements for manual execution in pgAdmin
 */
function generateCompleteSQLStatements(configs) {
  console.log('\n📝 Generated SQL statements for pgAdmin:');
  console.log('-- Copy and paste these statements into pgAdmin --');
  console.log('-- This will completely recreate the chatbot_settings table with fresh data --');
  console.log('');
  
  // Step 1: Delete all existing rows to start fresh
  console.log('-- 1. Clear existing data');
  console.log('DELETE FROM chatbot_settings;');
  console.log('');
  
  // Step 2: Insert all configurations
  console.log('-- 2. Insert all chatbot configurations');
  
  configs.forEach((config, index) => {
    console.log(`-- Configuration ${index + 1}: ${config.chatbotId}`);
    
    // Escape single quotes in strings
    const escapeString = (str) => {
      if (!str) return '';
      return str.replace(/'/g, "''");
    };
    
    console.log(`INSERT INTO chatbot_settings (
  chatbot_id,
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key,
  pinecone_api_key,
  knowledgebase_index_endpoint,
  flow2_knowledgebase_index,
  flow3_knowledgebase_index,
  flow4_knowledgebase_index,
  apiflow_knowledgebase_index,
  first_message,
  image_enabled,
  camera_button_enabled,
  created_at,
  updated_at
) VALUES (
  '${escapeString(config.chatbotId)}',
  '${escapeString(config.flow2Key)}',
  '${escapeString(config.flow3Key)}',
  '${escapeString(config.flow4Key)}',
  '${escapeString(config.apiFlowKey)}',
  '${escapeString(config.metadataKey)}',
  '${escapeString(config.metadata2Key)}',
  '${escapeString(config.pineconeApiKey)}',
  '${escapeString(config.knowledgebaseIndexEndpoint)}',
  '${escapeString(config.flow2KnowledgebaseIndex)}',
  '${escapeString(config.flow3KnowledgebaseIndex)}',
  '${escapeString(config.flow4KnowledgebaseIndex)}',
  '${escapeString(config.apiFlowKnowledgebaseIndex)}',
  '${escapeString(config.firstMessage)}',
  ${config.imageEnabled !== undefined ? config.imageEnabled : 'NULL'},
  ${config.cameraButtonEnabled !== undefined ? config.cameraButtonEnabled : 'NULL'},
  NOW(),
  NOW()
);`);
    console.log('');
  });
  
  // Step 3: Add verification query
  console.log('-- 3. Verify the configuration');
  console.log(`SELECT 
  chatbot_id,
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key,
  pinecone_api_key IS NOT NULL as has_api_key,
  knowledgebase_index_endpoint,
  flow2_knowledgebase_index,
  flow3_knowledgebase_index,
  flow4_knowledgebase_index,
  apiflow_knowledgebase_index,
  LENGTH(first_message) as first_message_length,
  image_enabled,
  camera_button_enabled,
  created_at,
  updated_at
FROM chatbot_settings 
ORDER BY chatbot_id;`);
  
  console.log('');
  console.log('-- 4. Summary statistics');
  console.log(`SELECT 
  COUNT(*) as total_chatbots,
  COUNT(pinecone_api_key) as chatbots_with_api_key,
  COUNT(first_message) as chatbots_with_first_message,
  COUNT(CASE WHEN image_enabled = true THEN 1 END) as chatbots_with_image_enabled,
  COUNT(CASE WHEN camera_button_enabled = true THEN 1 END) as chatbots_with_camera_enabled
FROM chatbot_settings;`);
  
  console.log('\n-- End of SQL statements --');
  console.log(`-- Total configurations processed: ${configs.length}`);
}

// Run the extraction
extractCompleteChatbotConfigFromGitHub();
