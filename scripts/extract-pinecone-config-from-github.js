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

// GitHub configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // You'll need to set this
const GITHUB_REPO = 'DialogIntelligens/scripts'; // Your public repository
const GITHUB_BRANCH = 'main';

/**
 * Extract Pinecone configuration from GitHub integration scripts
 * This script fetches all integration scripts and extracts Pinecone index configuration
 */

async function extractPineconeConfigFromGitHub() {
  try {
    console.log('🔍 Extracting Pinecone configuration from GitHub integration scripts...');
    
    if (!GITHUB_TOKEN) {
      console.error('❌ GITHUB_TOKEN environment variable is required');
      console.log('Set it with: export GITHUB_TOKEN="your_github_token"');
      process.exit(1);
    }

    // Step 1: Get list of all files in the integration scripts repository
    console.log('📂 Fetching file list from GitHub...');
    const filesResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents?ref=${GITHUB_BRANCH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!filesResponse.ok) {
      throw new Error(`GitHub API error: ${filesResponse.status} ${filesResponse.statusText}`);
    }

    const files = await filesResponse.json();
    const jsFiles = files.filter(file => file.name.endsWith('.js') && file.type === 'file');
    
    console.log(`📄 Found ${jsFiles.length} JavaScript files to analyze`);

    // Step 2: Process each integration script
    const extractedConfigs = [];
    
    for (const file of jsFiles) {
      try {
        console.log(`🔍 Analyzing file: ${file.name}`);
        
        // Fetch file content
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
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Successfully extracted ${extractedConfigs.length} configurations`);

    // Step 3: Update database with extracted configurations
    if (extractedConfigs.length > 0) {
      await updateDatabaseWithConfigs(extractedConfigs);
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

    // Only return config if we found at least the chatbot ID and some Pinecone info
    if (config.pineconeApiKey || config.knowledgebaseIndexEndpoint) {
      return config;
    }

    console.log(`⚠️ No Pinecone configuration found in ${filename} for chatbot ${config.chatbotId}`);
    return null;

  } catch (error) {
    console.error(`Error extracting config from ${filename}:`, error);
    return null;
  }
}

/**
 * Update database with extracted configurations
 */
async function updateDatabaseWithConfigs(configs) {
  try {
    console.log('\n💾 Updating database with extracted configurations...');
    
    for (const config of configs) {
      try {
        console.log(`📝 Updating chatbot: ${config.chatbotId}`);
        
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
        
      } catch (error) {
        console.error(`❌ Error updating ${config.chatbotId}:`, error.message);
      }
    }
    
    console.log('\n📊 Database update summary:');
    
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
      WHERE pinecone_api_key IS NOT NULL OR knowledgebase_index_endpoint IS NOT NULL
      ORDER BY chatbot_id
    `);
    
    console.log('\nChatbots with Pinecone configuration:');
    finalResult.rows.forEach(row => {
      console.log(`  ${row.chatbot_id}:`);
      console.log(`    API Key: ${row.has_api_key ? 'Yes' : 'No'}`);
      console.log(`    Default Index: ${row.knowledgebase_index_endpoint || 'None'}`);
      console.log(`    Flow2 Index: ${row.flow2_knowledgebase_index || 'None'}`);
      console.log(`    Flow3 Index: ${row.flow3_knowledgebase_index || 'None'}`);
      console.log(`    Flow4 Index: ${row.flow4_knowledgebase_index || 'None'}`);
      console.log(`    API Flow Index: ${row.apiflow_knowledgebase_index || 'None'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error updating database:', error);
    throw error;
  }
}

// Run the extraction
extractPineconeConfigFromGitHub();
