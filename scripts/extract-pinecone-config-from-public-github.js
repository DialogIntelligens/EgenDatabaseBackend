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
 * Extract Pinecone configuration from public GitHub repository
 * No authentication required since the repository is public
 */

async function extractPineconeConfigFromPublicGitHub() {
  try {
    console.log('🔍 Extracting Pinecone configuration from public GitHub repository...');
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
          console.log(`⚠️ No Pinecone config found in ${file.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Successfully extracted ${extractedConfigs.length} configurations`);

    // Step 3: Generate SQL statements for manual execution
    if (extractedConfigs.length > 0) {
      generateSQLStatements(extractedConfigs);
    } else {
      console.log('⚠️ No configurations found to process');
    }

    console.log('\n🎉 Pinecone configuration extraction complete!');
    
  } catch (error) {
    console.error('❌ Error extracting Pinecone configuration:', error);
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

    // Only return config if we found at least the chatbot ID and some Pinecone info
    if (config.pineconeApiKey || config.knowledgebaseIndexEndpoint) {
      console.log(`📋 Found configuration for ${config.chatbotId}:`);
      console.log(`  API Key: ${config.pineconeApiKey ? config.pineconeApiKey.substring(0, 20) + '...' : 'Not found'}`);
      console.log(`  Default Index: ${config.knowledgebaseIndexEndpoint || 'Not found'}`);
      console.log(`  Flow2 Index: ${config.flow2KnowledgebaseIndex || 'Not found'}`);
      console.log(`  Flow3 Index: ${config.flow3KnowledgebaseIndex || 'Not found'}`);
      console.log(`  Flow4 Index: ${config.flow4KnowledgebaseIndex || 'Not found'}`);
      console.log(`  API Flow Index: ${config.apiFlowKnowledgebaseIndex || 'Not found'}`);
      return config;
    }

    return null;

  } catch (error) {
    console.error(`Error extracting config from ${filename}:`, error);
    return null;
  }
}

/**
 * Generate SQL statements for manual execution in pgAdmin
 */
function generateSQLStatements(configs) {
  console.log('\n📝 Generated SQL statements for pgAdmin:');
  console.log('-- Copy and paste these statements into pgAdmin --');
  console.log('');
  
  // First, add columns if they don't exist
  console.log('-- 1. Add columns to chatbot_settings table');
  console.log(`ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS pinecone_api_key TEXT,
ADD COLUMN IF NOT EXISTS knowledgebase_index_endpoint TEXT,
ADD COLUMN IF NOT EXISTS flow2_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow3_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow4_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS apiflow_knowledgebase_index TEXT;`);
  console.log('');
  
  // Then, insert/update each configuration
  configs.forEach(config => {
    console.log(`-- 2. Configuration for chatbot: ${config.chatbotId}`);
    console.log(`INSERT INTO chatbot_settings (
  chatbot_id,
  pinecone_api_key,
  knowledgebase_index_endpoint,
  flow2_knowledgebase_index,
  flow3_knowledgebase_index,
  flow4_knowledgebase_index,
  apiflow_knowledgebase_index,
  updated_at
) VALUES (
  '${config.chatbotId}',
  '${config.pineconeApiKey || ''}',
  '${config.knowledgebaseIndexEndpoint || ''}',
  '${config.flow2KnowledgebaseIndex || ''}',
  '${config.flow3KnowledgebaseIndex || ''}',
  '${config.flow4KnowledgebaseIndex || ''}',
  '${config.apiFlowKnowledgebaseIndex || ''}',
  NOW()
) 
ON CONFLICT (chatbot_id) 
DO UPDATE SET
  pinecone_api_key = EXCLUDED.pinecone_api_key,
  knowledgebase_index_endpoint = EXCLUDED.knowledgebase_index_endpoint,
  flow2_knowledgebase_index = EXCLUDED.flow2_knowledgebase_index,
  flow3_knowledgebase_index = EXCLUDED.flow3_knowledgebase_index,
  flow4_knowledgebase_index = EXCLUDED.flow4_knowledgebase_index,
  apiflow_knowledgebase_index = EXCLUDED.apiflow_knowledgebase_index,
  updated_at = NOW();`);
    console.log('');
  });
  
  // Add verification query
  console.log('-- 3. Verify the configuration');
  console.log(`SELECT 
  chatbot_id,
  pinecone_api_key IS NOT NULL as has_api_key,
  knowledgebase_index_endpoint,
  flow2_knowledgebase_index,
  flow3_knowledgebase_index,
  flow4_knowledgebase_index,
  apiflow_knowledgebase_index
FROM chatbot_settings 
WHERE pinecone_api_key IS NOT NULL
ORDER BY chatbot_id;`);
  
  console.log('\n-- End of SQL statements --');
}

// Run the extraction
extractPineconeConfigFromPublicGitHub();
