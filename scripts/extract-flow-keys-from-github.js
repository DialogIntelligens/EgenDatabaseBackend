import fetch from 'node-fetch';

// GitHub configuration for public repository
const GITHUB_REPO = 'DialogIntelligens/scripts';
const GITHUB_BRANCH = 'main';

/**
 * Extract flow keys from GitHub integration scripts
 * This script generates SQL statements for pgAdmin to store flow keys in chatbot_settings
 */

async function extractFlowKeysFromGitHub() {
  try {
    console.log('🔍 Extracting flow keys from GitHub integration scripts...');
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
    const extractedFlowKeys = [];
    
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
        
        // Extract flow keys from the file
        const flowKeys = extractFlowKeysFromScript(content, file.name);
        if (flowKeys) {
          extractedFlowKeys.push(flowKeys);
          console.log(`✅ Extracted flow keys for chatbot: ${flowKeys.chatbotId}`);
        } else {
          console.log(`⚠️ No flow keys found in ${file.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Successfully extracted flow keys for ${extractedFlowKeys.length} chatbots`);

    // Step 3: Generate SQL statements for pgAdmin
    if (extractedFlowKeys.length > 0) {
      generateFlowKeysSQL(extractedFlowKeys);
    } else {
      console.log('⚠️ No flow keys found to process');
    }

    console.log('\n🎉 Flow keys extraction complete!');
    
  } catch (error) {
    console.error('❌ Error extracting flow keys:', error);
    process.exit(1);
  }
}

/**
 * Extract flow keys from a JavaScript integration script
 */
function extractFlowKeysFromScript(content, filename) {
  try {
    const flowKeys = {};
    
    // Extract chatbot ID
    const chatbotIdMatch = content.match(/chatbotID:\s*["']([^"']+)["'],?\s*$/m);
    if (!chatbotIdMatch) {
      // Try alternative pattern
      const altChatbotIdMatch = content.match(/chatbotID:\s*["']([^"']+)["']/);
      if (!altChatbotIdMatch) {
        return null;
      }
      flowKeys.chatbotId = altChatbotIdMatch[1];
    } else {
      flowKeys.chatbotId = chatbotIdMatch[1];
    }

    // Extract flow2Key
    const flow2KeyMatch = content.match(/flow2Key:\s*["']([^"']+)["'],?\s*$/m);
    if (flow2KeyMatch) {
      flowKeys.flow2Key = flow2KeyMatch[1];
    }

    // Extract flow3Key
    const flow3KeyMatch = content.match(/flow3Key:\s*["']([^"']+)["'],?\s*$/m);
    if (flow3KeyMatch) {
      flowKeys.flow3Key = flow3KeyMatch[1];
    }

    // Extract flow4Key
    const flow4KeyMatch = content.match(/flow4Key:\s*["']([^"']+)["'],?\s*$/m);
    if (flow4KeyMatch) {
      flowKeys.flow4Key = flow4KeyMatch[1];
    }

    // Extract apiFlowKey
    const apiFlowKeyMatch = content.match(/apiFlowKey:\s*["']([^"']+)["'],?\s*$/m);
    if (apiFlowKeyMatch) {
      flowKeys.apiFlowKey = apiFlowKeyMatch[1];
    }

    // Extract metaDataKey
    const metaDataKeyMatch = content.match(/metaDataKey:\s*["']([^"']+)["'],?\s*$/m);
    if (metaDataKeyMatch) {
      flowKeys.metaDataKey = metaDataKeyMatch[1];
    }

    // Extract metaData2Key (if exists)
    const metaData2KeyMatch = content.match(/metaData2Key:\s*["']([^"']+)["'],?\s*$/m);
    if (metaData2KeyMatch) {
      flowKeys.metaData2Key = metaData2KeyMatch[1];
    }

    // Only return if we found at least chatbot ID and some flow keys
    const hasFlowKeys = flowKeys.flow2Key || flowKeys.flow3Key || flowKeys.flow4Key || 
                       flowKeys.apiFlowKey || flowKeys.metaDataKey || flowKeys.metaData2Key;
    
    if (hasFlowKeys) {
      console.log(`📋 Found flow keys for ${flowKeys.chatbotId}:`);
      console.log(`  Flow2Key: ${flowKeys.flow2Key || 'Not found'}`);
      console.log(`  Flow3Key: ${flowKeys.flow3Key || 'Not found'}`);
      console.log(`  Flow4Key: ${flowKeys.flow4Key || 'Not found'}`);
      console.log(`  ApiFlowKey: ${flowKeys.apiFlowKey || 'Not found'}`);
      console.log(`  MetaDataKey: ${flowKeys.metaDataKey || 'Not found'}`);
      console.log(`  MetaData2Key: ${flowKeys.metaData2Key || 'Not found'}`);
      return flowKeys;
    }

    return null;

  } catch (error) {
    console.error(`Error extracting flow keys from ${filename}:`, error);
    return null;
  }
}

/**
 * Generate SQL statements for pgAdmin to add flow key columns and data
 */
function generateFlowKeysSQL(flowKeysArray) {
  console.log('\n📝 Generated SQL statements for pgAdmin:');
  console.log('-- Copy and paste these statements into pgAdmin --');
  console.log('');
  
  // First, add columns if they don't exist
  console.log('-- 1. Add flow key columns to chatbot_settings table');
  console.log(`ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS flow2_key TEXT,
ADD COLUMN IF NOT EXISTS flow3_key TEXT,
ADD COLUMN IF NOT EXISTS flow4_key TEXT,
ADD COLUMN IF NOT EXISTS apiflow_key TEXT,
ADD COLUMN IF NOT EXISTS metadata_key TEXT,
ADD COLUMN IF NOT EXISTS metadata2_key TEXT;`);
  console.log('');
  
  // Add comments for documentation
  console.log('-- 2. Add comments for documentation');
  console.log(`COMMENT ON COLUMN chatbot_settings.flow2_key IS 'Flow2 key from integration script';
COMMENT ON COLUMN chatbot_settings.flow3_key IS 'Flow3 key from integration script';
COMMENT ON COLUMN chatbot_settings.flow4_key IS 'Flow4 key from integration script';
COMMENT ON COLUMN chatbot_settings.apiflow_key IS 'API flow key from integration script';
COMMENT ON COLUMN chatbot_settings.metadata_key IS 'Metadata key from integration script';
COMMENT ON COLUMN chatbot_settings.metadata2_key IS 'Metadata2 key from integration script';`);
  console.log('');
  
  // Then, insert/update each flow key configuration
  flowKeysArray.forEach(flowKeys => {
    console.log(`-- 3. Flow keys for chatbot: ${flowKeys.chatbotId}`);
    console.log(`INSERT INTO chatbot_settings (
  chatbot_id,
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key,
  updated_at
) VALUES (
  '${flowKeys.chatbotId}',
  ${flowKeys.flow2Key ? `'${flowKeys.flow2Key}'` : 'NULL'},
  ${flowKeys.flow3Key ? `'${flowKeys.flow3Key}'` : 'NULL'},
  ${flowKeys.flow4Key ? `'${flowKeys.flow4Key}'` : 'NULL'},
  ${flowKeys.apiFlowKey ? `'${flowKeys.apiFlowKey}'` : 'NULL'},
  ${flowKeys.metaDataKey ? `'${flowKeys.metaDataKey}'` : 'NULL'},
  ${flowKeys.metaData2Key ? `'${flowKeys.metaData2Key}'` : 'NULL'},
  NOW()
) 
ON CONFLICT (chatbot_id) 
DO UPDATE SET
  flow2_key = EXCLUDED.flow2_key,
  flow3_key = EXCLUDED.flow3_key,
  flow4_key = EXCLUDED.flow4_key,
  apiflow_key = EXCLUDED.apiflow_key,
  metadata_key = EXCLUDED.metadata_key,
  metadata2_key = EXCLUDED.metadata2_key,
  updated_at = NOW();`);
    console.log('');
  });
  
  // Add verification query
  console.log('-- 4. Verify the flow keys were stored correctly');
  console.log(`SELECT 
  chatbot_id,
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key
FROM chatbot_settings 
WHERE flow2_key IS NOT NULL OR flow3_key IS NOT NULL OR flow4_key IS NOT NULL 
   OR apiflow_key IS NOT NULL OR metadata_key IS NOT NULL OR metadata2_key IS NOT NULL
ORDER BY chatbot_id;`);
  
  console.log('\n-- 5. Show complete table structure');
  console.log(`SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'chatbot_settings'
ORDER BY ordinal_position;`);
  
  console.log('\n-- End of SQL statements --');
  console.log(`\n📊 Summary: Generated SQL for ${flowKeysArray.length} chatbots with flow keys`);
  
  // Show summary of what was found
  console.log('\n📋 Flow Keys Summary:');
  flowKeysArray.forEach(flowKeys => {
    const keys = [];
    if (flowKeys.flow2Key) keys.push(`flow2: ${flowKeys.flow2Key}`);
    if (flowKeys.flow3Key) keys.push(`flow3: ${flowKeys.flow3Key}`);
    if (flowKeys.flow4Key) keys.push(`flow4: ${flowKeys.flow4Key}`);
    if (flowKeys.apiFlowKey) keys.push(`apiflow: ${flowKeys.apiFlowKey}`);
    if (flowKeys.metaDataKey) keys.push(`metadata: ${flowKeys.metaDataKey}`);
    if (flowKeys.metaData2Key) keys.push(`metadata2: ${flowKeys.metaData2Key}`);
    
    console.log(`  ${flowKeys.chatbotId}: ${keys.join(', ')}`);
  });
}

// Run the extraction
extractFlowKeysFromGitHub();
