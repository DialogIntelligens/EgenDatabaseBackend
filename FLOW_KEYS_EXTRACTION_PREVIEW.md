# Flow Keys Extraction Preview

## 🎯 **What the Script Will Do**

The `extract-flow-keys-from-github.js` script will:

1. **Fetch all integration scripts** from `https://github.com/DialogIntelligens/scripts`
2. **Extract flow keys** from each script (`flow2Key`, `flow3Key`, `flow4Key`, `apiFlowKey`, `metaDataKey`, `metaData2Key`)
3. **Generate SQL statements** for pgAdmin to store them in `chatbot_settings` table

## 📋 **Example: From Your It_script_new.js**

Based on your current integration script, it will extract:

```javascript
// From It_script_new.js:
flow2Key: "",
flow3Key: "product", 
flow4Key: "productfilter",
apiFlowKey: "order",
metaDataKey: "productfilter",
// metaData2Key not present (will be NULL)
```

## 🔧 **Generated SQL Preview**

The script will generate SQL like this:

```sql
-- 1. Add flow key columns to chatbot_settings table
ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS flow2_key TEXT,
ADD COLUMN IF NOT EXISTS flow3_key TEXT,
ADD COLUMN IF NOT EXISTS flow4_key TEXT,
ADD COLUMN IF NOT EXISTS apiflow_key TEXT,
ADD COLUMN IF NOT EXISTS metadata_key TEXT,
ADD COLUMN IF NOT EXISTS metadata2_key TEXT;

-- 2. Add documentation comments
COMMENT ON COLUMN chatbot_settings.flow2_key IS 'Flow2 key from integration script';
COMMENT ON COLUMN chatbot_settings.flow3_key IS 'Flow3 key from integration script';
COMMENT ON COLUMN chatbot_settings.flow4_key IS 'Flow4 key from integration script';
COMMENT ON COLUMN chatbot_settings.apiflow_key IS 'API flow key from integration script';
COMMENT ON COLUMN chatbot_settings.metadata_key IS 'Metadata key from integration script';
COMMENT ON COLUMN chatbot_settings.metadata2_key IS 'Metadata2 key from integration script';

-- 3. Flow keys for chatbot: vinhuset
INSERT INTO chatbot_settings (
  chatbot_id,
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key,
  updated_at
) VALUES (
  'vinhuset',
  NULL,
  'product',
  'productfilter',
  'order',
  'productfilter',
  NULL,
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
  updated_at = NOW();

-- 4. Verification query
SELECT 
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
ORDER BY chatbot_id;
```

## 🚀 **How to Use:**

### **1. Run the Script:**
```bash
cd backend
npm run extract-flow-keys
```

### **2. Copy the Generated SQL:**
The script will output complete SQL statements in the terminal

### **3. Paste into pgAdmin:**
Copy all the generated SQL and run it in pgAdmin

### **4. Verify Results:**
The verification query will show all chatbots with their flow keys

## 📊 **Expected Results**

After running the script, you should see:
- **All chatbots** from your GitHub repository with their flow configurations
- **Complete flow key mappings** extracted from integration scripts
- **Ready-to-run SQL** for pgAdmin
- **Verification queries** to confirm everything worked

## 🎯 **Benefits**

Once stored in the database:
- ✅ **Backend knows which flows are configured** for each chatbot
- ✅ **Proper flow routing** based on database configuration
- ✅ **Centralized flow management** instead of scattered in integration scripts
- ✅ **Easy updates** through database instead of code changes
- ✅ **Better flow validation** and error handling

## 📋 **Flow Key Mapping:**

The script will extract these flow keys from your integration scripts:
- **flow2Key** - Secondary flow routing key
- **flow3Key** - Product flow routing key (usually "product")
- **flow4Key** - Product filter flow routing key (usually "productfilter")  
- **apiFlowKey** - API/Order flow routing key (usually "order")
- **metaDataKey** - Metadata flow routing key (usually "productfilter")
- **metaData2Key** - Secondary metadata flow routing key (if configured)

**Ready to run the extraction? Just execute `npm run extract-flow-keys` and copy the generated SQL to pgAdmin!** 🚀
