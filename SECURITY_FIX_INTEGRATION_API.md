# SECURITY FIX: Integration API Credential Exposure

## Critical Security Issue Fixed

The `/api/integration-config/:chatbot_id` endpoint was exposing sensitive backend credentials and API keys to the frontend!

## What Was Exposed (BEFORE - VULNERABLE)

The endpoint was doing `SELECT * FROM chatbot_settings` and returning ALL fields, including:

### Sensitive Backend Data (API Keys & Credentials)
- `pinecone_api_key` - Pinecone API keys
- `knowledgebase_index_endpoint` - Backend API endpoints
- `flow2_knowledgebase_index` - Internal index names
- `flow3_knowledgebase_index` - Internal index names
- `flow4_knowledgebase_index` - Internal index names
- `apiflow_knowledgebase_index` - Internal index names

## What Is Exposed Now (AFTER - SECURE)

The endpoint now uses an explicit `SELECT` with only frontend-safe fields:

### Safe UI Configuration Only
- Visual settings (colors, fonts, logos)
- Text content (labels, messages, placeholders)
- Feature flags (enable/disable UI features)
- UI positioning (button positions)
- Form labels and validation messages

## Security Impact

### Before: HIGH RISK
- API keys visible in browser developer tools
- Credentials accessible via JavaScript console
- Potential for credential theft

### After: SECURE
- Only UI configuration exposed
- Backend credentials remain server-side only
- Frontend cannot access sensitive data

## Files Modified

1. `backend/src/routes/integrationRoutes.js`
   - Replaced `SELECT *` with explicit field selection
   - Added security documentation
   - Only returns frontend-safe fields

## Testing

Verify the endpoint returns only safe fields and chatbot functionality still works.
