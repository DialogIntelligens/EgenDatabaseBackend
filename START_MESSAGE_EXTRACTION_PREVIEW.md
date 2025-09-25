# Start Message Extraction Preview

## 🎯 **What the Script Will Do**

The `extract-start-messages-from-github.js` script will:

1. **Fetch all integration scripts** from `https://github.com/DialogIntelligens/scripts`
2. **Extract start messages** from each script (`firstMessage`, `titleG`, `headerTitleG`)
3. **Generate SQL statements** for pgAdmin to store them in `chatbot_settings` table

## 📋 **Example: From Your It_script_new.js**

Based on your current integration script, it will extract:

```javascript
// From It_script_new.js:
titleG: "Vin Bot",
headerTitleG: "Vin Bot - Din AI Hjælper", 
firstMessage: "Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, ordrestatus, eller tips & tricks til drikkevarer og grej 🍾🍷"
```

## 🔧 **Generated SQL Preview**

The script will generate SQL like this:

```sql
-- 1. Add columns to chatbot_settings table
ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS first_message TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS header_title TEXT;

-- 2. Add documentation comments
COMMENT ON COLUMN chatbot_settings.first_message IS 'Start message for chatbot (firstMessage from integration script)';
COMMENT ON COLUMN chatbot_settings.title IS 'Chatbot title (titleG from integration script)';
COMMENT ON COLUMN chatbot_settings.header_title IS 'Header title (headerTitleG from integration script)';

-- 3. Insert vinhuset start message
INSERT INTO chatbot_settings (
  chatbot_id,
  first_message,
  title,
  header_title,
  updated_at
) VALUES (
  'vinhuset',
  'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, ordrestatus, eller tips & tricks til drikkevarer og grej 🍾🍷',
  'Vin Bot',
  'Vin Bot - Din AI Hjælper',
  NOW()
) 
ON CONFLICT (chatbot_id) 
DO UPDATE SET
  first_message = EXCLUDED.first_message,
  title = EXCLUDED.title,
  header_title = EXCLUDED.header_title,
  updated_at = NOW();

-- 4. Verification query
SELECT 
  chatbot_id,
  first_message IS NOT NULL as has_first_message,
  title,
  header_title,
  LENGTH(first_message) as message_length
FROM chatbot_settings 
WHERE first_message IS NOT NULL
ORDER BY chatbot_id;
```

## 🚀 **How to Use**

### **1. Run the Script:**
```bash
cd backend
npm run extract-start-messages
```

### **2. Copy the Generated SQL:**
The script will output complete SQL statements in the terminal

### **3. Paste into pgAdmin:**
Copy all the generated SQL and run it in pgAdmin

### **4. Verify Results:**
The verification query will show all chatbots with their start messages

## 📊 **Expected Results**

After running the script, you should see:
- **All chatbots** from your GitHub repository
- **Complete start messages** extracted from integration scripts
- **Ready-to-run SQL** for pgAdmin
- **Verification queries** to confirm everything worked

## 🎯 **Benefits**

Once stored in the database:
- ✅ **Backend can access start messages** for conversation initialization
- ✅ **Consistent messaging** across all chatbots
- ✅ **Centralized configuration** instead of scattered in integration scripts
- ✅ **Easy updates** through database instead of code changes

**Ready to run the extraction? Just execute `npm run extract-start-messages` and copy the generated SQL to pgAdmin!** 🚀
