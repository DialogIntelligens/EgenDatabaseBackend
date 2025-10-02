import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=');
            process.env[key] = value;
          }
        }
      });
      console.log('✅ Loaded environment variables from .env file');
    }
  } catch (error) {
    console.log('⚠️ Could not load .env file:', error.message);
  }
}

loadEnvFile();

// GitHub configuration
const GITHUB_REPO = 'DialogIntelligens/scripts';
const GITHUB_BRANCH = 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Get optional filename filter from command line
const TARGET_FILE = process.argv[2]; // e.g., node script.js vinhuset-vinhuset-chatbot.js

/**
 * This script removes hardcoded configuration from integration scripts in GitHub
 * and replaces them with database lookups.
 * 
 * IMPORTANT: This will modify files in your GitHub repository!
 * Make sure you have a backup or are working on a test branch.
 * 
 * Usage:
 *   node cleanup-integration-scripts-github.js                    # Process all files
 *   node cleanup-integration-scripts-github.js vinhuset-vinhuset-chatbot.js  # Process one file
 */

async function cleanupIntegrationScripts() {
  try {
    console.log('🧹 Starting cleanup of integration scripts...');
    console.log(`📂 Repository: https://github.com/${GITHUB_REPO}`);
    
    if (!GITHUB_TOKEN) {
      console.error('❌ ERROR: GITHUB_TOKEN environment variable is not set!');
      console.log('\n📝 To set your GitHub token:');
      console.log('   Windows PowerShell: $env:GITHUB_TOKEN="your_github_token_here"');
      console.log('   Windows CMD: set GITHUB_TOKEN=your_github_token_here');
      console.log('   Linux/Mac: export GITHUB_TOKEN="your_github_token_here"');
      console.log('\n🔑 Get your token from: https://github.com/settings/tokens');
      console.log('   Required permissions: repo (full control of private repositories)');
      process.exit(1);
    }

    // Step 1: Get list of all files in the repository
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
    let jsFiles = files.filter(file => file.name.endsWith('.js') && file.type === 'file');
    
    // Filter to specific file if provided
    if (TARGET_FILE) {
      jsFiles = jsFiles.filter(file => file.name === TARGET_FILE);
      if (jsFiles.length === 0) {
        console.error(`❌ File not found: ${TARGET_FILE}`);
        console.log('\n📝 Available files:');
        files.filter(f => f.name.endsWith('.js')).forEach(f => console.log(`   - ${f.name}`));
        process.exit(1);
      }
      console.log(`🎯 Processing single file: ${TARGET_FILE}\n`);
    } else {
      console.log(`📄 Found ${jsFiles.length} JavaScript files to process\n`);
    }

    // Step 2: Process each file
    const changes = [];
    
    for (const file of jsFiles) {
      try {
        console.log(`🔍 Processing: ${file.name}`);
        
        // Fetch file content
        const fileResponse = await fetch(file.download_url);
        if (!fileResponse.ok) {
          console.warn(`⚠️ Failed to fetch ${file.name}: ${fileResponse.status}`);
          continue;
        }
        
        const originalContent = await fileResponse.text();
        
        // Check if file has configuration to remove
        if (!hasConfigurationToRemove(originalContent)) {
          console.log(`   ⏭️ No configuration found, skipping\n`);
          continue;
        }

        // Clean the content
        const cleanedContent = removeConfiguration(originalContent, file.name);
        
        if (cleanedContent === originalContent) {
          console.log(`   ⏭️ No changes needed\n`);
          continue;
        }

        // Store change for later execution
        changes.push({
          filename: file.name,
          sha: file.sha,
          path: file.path,
          originalContent,
          cleanedContent
        });

        console.log(`   ✅ Prepared cleanup for ${file.name}\n`);
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    // Step 3: Generate a report and update script
    if (changes.length > 0) {
      console.log(`\n📊 Summary: ${changes.length} files need cleanup`);
      
      // Save the changes to a local file for review
      const reportPath = path.join(process.cwd(), 'cleanup-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(changes, null, 2));
      console.log(`\n📝 Changes saved to: ${reportPath}`);
      
      // Generate a script to apply changes
      generateApplyScript(changes);
      
      console.log('\n⚠️ IMPORTANT: Review the changes before applying!');
      console.log('   1. Check cleanup-report.json to see what will be changed');
      console.log('   2. Run: node apply-cleanup-changes.js');
      console.log('   3. Or manually review and commit changes');
      
    } else {
      console.log('\n✅ No files need cleanup!');
    }

    console.log('\n🎉 Cleanup preparation complete!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

/**
 * Check if file has configuration that should be removed
 */
function hasConfigurationToRemove(content) {
  const configPatterns = [
    /flow2Key:/,
    /flow3Key:/,
    /flow4Key:/,
    /apiFlowKey:/,
    /metaDataKey:/,
    /pineconeApiKey:/,
    /knowledgebaseIndexApiEndpoint:/,
    /flow2KnowledgebaseIndex:/,
    /flow3KnowledgebaseIndex:/,
    /flow4KnowledgebaseIndex:/,
    /apiFlowKnowledgebaseIndex:/,
    /firstMessage:/,
    /statestikAPI:/,
    /SOCKET_SERVER_URL:/,
    /apiEndpoint:/,
    /fordelingsflowAPI:/,
    /flow2API:/,
    /flow3API:/,
    /flow4API:/,
    /imageAPI:/,
    /metaDataAPI:/,
    /apiFlowAPI:/,
    /apiVarFlowAPI:/,
    /websiteOverride:/,
    /languageOverride:/,
    /valutaOverride:/,
    /customVar1:/,
    /dillingProductsKatOverride:/,
    /dillingColors:/,
    /orderTrackingEnabled:/,
    /orderTrackingBackendUrl:/
  ];
  
  return configPatterns.some(pattern => pattern.test(content));
}

/**
 * Remove hardcoded configuration from script content
 */
function removeConfiguration(content, filename) {
  // Extract chatbotID if present
  const chatbotIdMatch = content.match(/^\s*chatbotID:\s*["']([^"']+)["']/m);
  if (!chatbotIdMatch) {
    console.log(`   ⚠️ Warning: Could not find chatbotID in ${filename}`);
    return content;
  }
  
  const chatbotId = chatbotIdMatch[1];
  
  // Find the messageData or similar config object
  const configStart = content.indexOf('var messageData = {');
  if (configStart === -1) {
    // Try alternative pattern
    const altStart = content.indexOf('const messageData = {');
    if (altStart === -1) {
      console.log(`   ⚠️ Warning: Could not find messageData object in ${filename}`);
      return content;
    }
  }

  // Remove the configuration lines we want to eliminate
  let cleaned = content;
  
  // Remove flow keys
  cleaned = cleaned.replace(/^\s*flow2Key:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*flow3Key:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*flow4Key:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*apiFlowKey:\s*["'][^"']*["'],?\r?\n/gm, '');
  
  // Remove metadata keys
  cleaned = cleaned.replace(/^\s*metaDataKey:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*metaData2Key:\s*["'][^"']*["'],?\r?\n/gm, '');
  
  // Remove Pinecone configuration
  cleaned = cleaned.replace(/^\s*pineconeApiKey:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*knowledgebaseIndexApiEndpoint:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*flow2KnowledgebaseIndex:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*flow3KnowledgebaseIndex:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*flow4KnowledgebaseIndex:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*apiFlowKnowledgebaseIndex:\s*["'][^"']*["'],?\r?\n/gm, '');
  
  // Remove first message (this should come from database)
  cleaned = cleaned.replace(/^\s*firstMessage:\s*["'][^"']*["'],?\r?\n/gm, '');
  
  // Remove API endpoints (these are now handled by backend routing)
  cleaned = cleaned.replace(/^\s*statestikAPI:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*SOCKET_SERVER_URL:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*apiEndpoint:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*fordelingsflowAPI:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*flow2API:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*flow3API:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*flow4API:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*imageAPI:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*metaDataAPI:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*apiFlowAPI:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*apiVarFlowAPI:\s*["'][^"']*["'],?\r?\n/gm, '');
  
  // Remove override variables and custom configurations
  cleaned = cleaned.replace(/^\s*websiteOverride:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*languageOverride:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*valutaOverride:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*customVar1:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*dillingProductsKatOverride:\s*["'][^"']*["'],?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*dillingColors:\s*["'][^"']*["'],?\r?\n/gm, '');
  
  // Remove order tracking configuration
  cleaned = cleaned.replace(/^\s*orderTrackingEnabled:\s*(true|false),?\r?\n/gm, '');
  cleaned = cleaned.replace(/^\s*orderTrackingBackendUrl:\s*['"][^'"]*['"],?\r?\n/gm, '');

  return cleaned;
}

/**
 * Generate a script that applies all the changes to GitHub
 */
function generateApplyScript(changes) {
  const scriptContent = `import fetch from 'node-fetch';

const GITHUB_REPO = '${GITHUB_REPO}';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const changes = ${JSON.stringify(changes, null, 2)};

async function applyChanges() {
  if (!GITHUB_TOKEN) {
    console.error('❌ ERROR: GITHUB_TOKEN environment variable is not set!');
    process.exit(1);
  }

  console.log('🚀 Applying cleanup changes to GitHub...');
  console.log('⚠️ This will modify ${changes.length} files in your repository!\\n');
  
  // Wait 5 seconds to allow cancellation
  console.log('⏳ Starting in 5 seconds... Press Ctrl+C to cancel');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  let successCount = 0;
  let failCount = 0;

  for (const change of changes) {
    try {
      console.log(\`📝 Updating: \${change.filename}\`);
      
      // Update file via GitHub API
      const response = await fetch(
        \`https://api.github.com/repos/\${GITHUB_REPO}/contents/\${change.path}\`,
        {
          method: 'PUT',
          headers: {
            'Authorization': \`token \${GITHUB_TOKEN}\`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: \`Remove hardcoded configuration from \${change.filename}\`,
            content: Buffer.from(change.cleanedContent).toString('base64'),
            sha: change.sha,
            branch: '${GITHUB_BRANCH}'
          })
        }
      );

      if (response.ok) {
        console.log(\`   ✅ Successfully updated \${change.filename}\\n\`);
        successCount++;
      } else {
        const error = await response.text();
        console.error(\`   ❌ Failed to update \${change.filename}: \${response.status}\`);
        console.error(\`   Error: \${error}\\n\`);
        failCount++;
      }
      
      // Rate limiting: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(\`❌ Error updating \${change.filename}:\`, error.message);
      failCount++;
    }
  }

  console.log(\`\\n📊 Results:\`);
  console.log(\`   ✅ Success: \${successCount}\`);
  console.log(\`   ❌ Failed: \${failCount}\`);
  console.log(\`\\n🎉 Cleanup complete!\`);
}

applyChanges();
`;

  const applyScriptPath = path.join(process.cwd(), 'apply-cleanup-changes.js');
  fs.writeFileSync(applyScriptPath, scriptContent);
  console.log(`📝 Apply script saved to: ${applyScriptPath}`);
}

// Run the cleanup preparation
cleanupIntegrationScripts();

