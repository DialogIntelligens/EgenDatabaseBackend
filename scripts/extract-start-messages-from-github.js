import fetch from 'node-fetch';

// GitHub configuration for public repository
const GITHUB_REPO = 'DialogIntelligens/scripts';
const GITHUB_BRANCH = 'main';

/**
 * Extract start messages (firstMessage) from GitHub integration scripts
 * This script generates SQL statements for pgAdmin to store start messages in chatbot_settings
 */

async function extractStartMessagesFromGitHub() {
  try {
    console.log('🔍 Extracting start messages from GitHub integration scripts...');
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
    const extractedStartMessages = [];
    
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
        
        // Extract start message from the file
        const startMessage = extractStartMessageFromScript(content, file.name);
        if (startMessage) {
          extractedStartMessages.push(startMessage);
          console.log(`✅ Extracted start message for chatbot: ${startMessage.chatbotId}`);
        } else {
          console.log(`⚠️ No start message found in ${file.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Successfully extracted ${extractedStartMessages.length} start messages`);

    // Step 3: Generate SQL statements for pgAdmin
    if (extractedStartMessages.length > 0) {
      generateStartMessageSQL(extractedStartMessages);
    } else {
      console.log('⚠️ No start messages found to process');
    }

    console.log('\n🎉 Start message extraction complete!');
    
  } catch (error) {
    console.error('❌ Error extracting start messages:', error);
    process.exit(1);
  }
}

/**
 * Extract start message from a JavaScript integration script
 */
function extractStartMessageFromScript(content, filename) {
  try {
    const startMessage = {};
    
    // Extract chatbot ID - be more specific to avoid capturing variables
    const chatbotIdMatch = content.match(/chatbotID:\s*["']([^"']+)["'],?\s*$/m);
    if (!chatbotIdMatch) {
      // Try alternative pattern
      const altChatbotIdMatch = content.match(/chatbotID:\s*["']([^"']+)["']/);
      if (!altChatbotIdMatch) {
        return null;
      }
      startMessage.chatbotId = altChatbotIdMatch[1];
    } else {
      startMessage.chatbotId = chatbotIdMatch[1];
    }

    // Extract first message - be very specific to avoid capturing JavaScript code
    const firstMessageMatch = content.match(/firstMessage:\s*["']([^"']*(?:[^"'\\]|\\.)*)["'],?\s*$/m);
    if (firstMessageMatch) {
      let message = firstMessageMatch[1];
      
      // Skip if it contains JavaScript keywords or patterns
      if (message.includes('var ') || message.includes('function') || 
          message.includes('localStorage') || message.includes('console.') ||
          message.includes('document.') || message.includes('window.') ||
          message.includes('if (') || message.includes('for (') ||
          message.includes('{') || message.includes('}') ||
          message.includes('return ') || message.includes('await ')) {
        console.log(`⚠️ Skipping ${filename} - firstMessage contains JavaScript code`);
        return null;
      }
      
      // Handle escaped quotes and clean up
      message = message.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '\n').trim();
      
      // Skip very short or empty messages
      if (message.length < 5) {
        console.log(`⚠️ Skipping ${filename} - firstMessage too short: "${message}"`);
        return null;
      }
      
      startMessage.firstMessage = message;
    }

    // Extract title if available - be specific
    const titleMatch = content.match(/titleG:\s*["']([^"']+)["'],?\s*$/m);
    if (titleMatch) {
      startMessage.title = titleMatch[1];
    }

    // Extract header title if available - be specific
    const headerTitleMatch = content.match(/headerTitleG:\s*["']([^"']*(?:[^"'\\]|\\.)*)["'],?\s*$/m);
    if (headerTitleMatch) {
      let headerTitle = headerTitleMatch[1];
      headerTitle = headerTitle.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '\n').trim();
      startMessage.headerTitle = headerTitle;
    }

    // Only return if we found at least chatbot ID and first message
    if (startMessage.firstMessage && startMessage.firstMessage.length > 5) {
      console.log(`📋 Found start message for ${startMessage.chatbotId}:`);
      console.log(`  First Message: ${startMessage.firstMessage.substring(0, 100)}${startMessage.firstMessage.length > 100 ? '...' : ''}`);
      console.log(`  Title: ${startMessage.title || 'Not found'}`);
      console.log(`  Header Title: ${startMessage.headerTitle || 'Not found'}`);
      return startMessage;
    }

    return null;

  } catch (error) {
    console.error(`Error extracting start message from ${filename}:`, error);
    return null;
  }
}

/**
 * Generate SQL statements for pgAdmin to add start message columns and data
 */
function generateStartMessageSQL(startMessages) {
  console.log('\n📝 Generated SQL statements for pgAdmin:');
  console.log('-- Copy and paste these statements into pgAdmin --');
  console.log('');
  
  // First, add columns if they don't exist
  console.log('-- 1. Add start message columns to chatbot_settings table');
  console.log(`ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS first_message TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS header_title TEXT;`);
  console.log('');
  
  // Add comments for documentation
  console.log('-- 2. Add comments for documentation');
  console.log(`COMMENT ON COLUMN chatbot_settings.first_message IS 'Start message for chatbot (firstMessage from integration script)';
COMMENT ON COLUMN chatbot_settings.title IS 'Chatbot title (titleG from integration script)';
COMMENT ON COLUMN chatbot_settings.header_title IS 'Header title (headerTitleG from integration script)';`);
  console.log('');
  
  // Then, insert/update each start message
  startMessages.forEach(startMessage => {
    // Properly escape strings for SQL using dollar quoting to handle special characters
    const chatbotId = startMessage.chatbotId;
    const firstMessage = startMessage.firstMessage || '';
    const title = startMessage.title || '';
    const headerTitle = startMessage.headerTitle || '';
    
    console.log(`-- 3. Start message for chatbot: ${chatbotId}`);
    console.log(`INSERT INTO chatbot_settings (
  chatbot_id,
  first_message,
  title,
  header_title,
  updated_at
) VALUES (
  '${chatbotId}',
  $tag$${firstMessage}$tag$,
  $tag$${title}$tag$,
  $tag$${headerTitle}$tag$,
  NOW()
) 
ON CONFLICT (chatbot_id) 
DO UPDATE SET
  first_message = EXCLUDED.first_message,
  title = EXCLUDED.title,
  header_title = EXCLUDED.header_title,
  updated_at = NOW();`);
    console.log('');
  });
  
  // Add verification query
  console.log('-- 4. Verify the start messages were stored correctly');
  console.log(`SELECT 
  chatbot_id,
  first_message IS NOT NULL as has_first_message,
  title,
  header_title,
  LENGTH(first_message) as message_length
FROM chatbot_settings 
WHERE first_message IS NOT NULL
ORDER BY chatbot_id;`);
  
  console.log('\n-- 5. Show complete table structure');
  console.log(`SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'chatbot_settings'
ORDER BY ordinal_position;`);
  
  console.log('\n-- End of SQL statements --');
  console.log(`\n📊 Summary: Generated SQL for ${startMessages.length} chatbots with start messages`);
}

// Run the extraction
extractStartMessagesFromGitHub();
