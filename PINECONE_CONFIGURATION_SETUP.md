# Pinecone Configuration Setup Guide

## 🎯 **Problem Solved**

The Pinecone 404 errors were caused by the backend not having access to the correct Pinecone indexes and API keys that are currently stored in your integration scripts.

## 🔧 **Solution: Database Migration**

I've created a system to move the Pinecone configuration from integration scripts into the database where the backend can access it.

## 📊 **Database Changes**

### **New Columns Added to `chatbot_settings`:**
- `pinecone_api_key` - The API key from integration scripts
- `knowledgebase_index_endpoint` - Default index (knowledgebaseIndexApiEndpoint)
- `flow2_knowledgebase_index` - Flow2 index (flow2KnowledgebaseIndex)
- `flow3_knowledgebase_index` - Flow3 index (flow3KnowledgebaseIndex)  
- `flow4_knowledgebase_index` - Flow4 index (flow4KnowledgebaseIndex)
- `apiflow_knowledgebase_index` - API flow index (apiFlowKnowledgebaseIndex)

## 🚀 **Setup Steps**

### **1. Add Database Columns**
Run this SQL in pgAdmin:
```sql
-- Add Pinecone configuration columns
ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS pinecone_api_key TEXT,
ADD COLUMN IF NOT EXISTS knowledgebase_index_endpoint TEXT,
ADD COLUMN IF NOT EXISTS flow2_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow3_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow4_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS apiflow_knowledgebase_index TEXT;
```

Or run the migration file: `backend/database/migrations/add_pinecone_indexes_to_chatbot_settings.sql`

### **2. Extract Configuration from Your Integration Script**
```bash
cd backend
npm run extract-pinecone-local
```

This will:
- Read your `It_script_new.js` file
- Extract all Pinecone configuration
- Update the `chatbot_settings` table
- Show you what was extracted and stored

### **3. Verify the Configuration**
After running the script, you should see output like:
```
📋 Found configuration for vinhuset:
  API Key: pcsk_6DGzau_SeHjbfso...
  Default Index: vinhuset-alt
  Flow2 Index: vinhuset-alt
  Flow3 Index: vinhuset-pro
  Flow4 Index: vinhuset-pro
  API Flow Index: vinhuset-alt

✅ Updated chatbot_settings for: vinhuset
   📋 Updated: API key, default index, flow2 index, flow3 index, flow4 index, apiflow index
```

## 📋 **Current Configuration in Your Script**

From your `It_script_new.js`, I can see:
```javascript
pineconeApiKey: "pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf",
knowledgebaseIndexApiEndpoint: "vinhuset-alt",
flow2KnowledgebaseIndex: "vinhuset-alt",
flow3KnowledgebaseIndex: "vinhuset-pro",
flow4KnowledgebaseIndex: "vinhuset-pro",
apiFlowKnowledgebaseIndex: "vinhuset-alt",
```

This will be automatically extracted and stored in the database.

## 🔄 **How Backend Will Use This**

After the setup, the backend will:
1. **Load configuration** from `chatbot_settings` table
2. **Apply correct indexes** for each flow type:
   - Flow2 → `vinhuset-alt`
   - Flow3 → `vinhuset-pro`  
   - Flow4 → `vinhuset-pro`
   - API Flow → `vinhuset-alt`
   - Default → `vinhuset-alt`
3. **Include API key** in all requests
4. **No more 404 errors** from Pinecone!

## 🧪 **Testing After Setup**

1. **Run the database migration**
2. **Run the extraction script**
3. **Test the chatbot** - Should work without Pinecone errors
4. **Check backend logs** for API key application messages

## 📈 **For Multiple Chatbots**

If you have multiple integration scripts:
1. **Update the GitHub script** with your repository details
2. **Run `npm run extract-pinecone-github`** to process all scripts
3. **Or manually run the local script** for each integration file

## ✅ **Expected Results**

After setup, you should see in backend logs:
```
🔧 Configuration loaded with keys: [..., 'pineconeApiKey', 'knowledgebaseIndexApiEndpoint', ...]
Applied Pinecone API key for fordelingsflow: pcsk_6DGzau_SeHjbfso...
Applied Pinecone API key for metadata flow: pcsk_6DGzau_SeHjbfso...
```

And **NO MORE** Pinecone 404 errors! 🎉

## 🚨 **Important Note**

This setup **must be done** for the backend conversation processing to work correctly. Without the proper Pinecone indexes and API keys, the AI flows will fail with 404 errors.

**Ready to run the setup?** The scripts are prepared and waiting! 🚀
