# Conversation Processing System - Phase 1

This document describes the new backend conversation processing system that moves AI conversation logic from frontend to backend.

## 🚀 Overview

The conversation processing system handles all AI conversation logic on the backend, allowing the frontend to focus purely on UI rendering and user interaction. This provides better security, performance, and maintainability.

## 🏗️ Architecture

```
Frontend → Backend API → Flow Routing → AI APIs → Streaming Response → Frontend
```

### Components:

1. **ConversationProcessingService** - Main orchestration service
2. **FlowRoutingService** - Handles flow determination and parallel execution  
3. **AiStreamingService** - Manages streaming responses and SSE events
4. **Controllers & Routes** - API endpoints for conversation processing
5. **Database Tables** - Session tracking and event storage

## 📊 Database Schema

### New Tables Created:

1. **conversation_sessions** - Active conversation sessions
2. **streaming_sessions** - Streaming response sessions
3. **streaming_events** - Individual SSE events for polling
4. **conversation_processing_metrics** - Performance tracking

## 🔄 Processing Flow

### 1. Message Processing
- Frontend sends message to `POST /api/process-message`
- Backend determines conversation flow (parallel or sequential)
- Backend starts streaming response
- Returns session IDs for tracking

### 2. Streaming Response
- Backend processes AI response in background
- Events stored in `streaming_events` table
- Frontend polls `GET /api/stream-events/:sessionId`
- Real-time updates delivered to frontend

### 3. Session Management
- Each conversation gets a unique session ID
- Streaming sessions track individual AI responses
- Automatic cleanup of old sessions and events

## 📡 API Endpoints

### Main Endpoints

#### `POST /api/process-message`
Process user message and start AI response
```json
{
  "user_id": "user-123",
  "chatbot_id": "chatbot-456", 
  "message_text": "Hello",
  "image_data": null,
  "conversation_history": [],
  "session_id": "optional-session-id",
  "configuration": {}
}
```

**Response:**
```json
{
  "success": true,
  "session_id": "session-abc",
  "streaming_session_id": "stream-xyz",
  "flow_type": "main",
  "streaming_url": "/api/stream-events/stream-xyz"
}
```

#### `GET /api/stream-events/:streamingSessionId`
Get streaming events (frontend polling)
```json
{
  "events": [
    {
      "id": 1,
      "event": "token",
      "data": {"token": "Hello", "markers": {}},
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ],
  "session_status": "active",
  "last_event_id": 1,
  "has_more": true
}
```

#### `GET /api/conversation-config/:chatbotId`
Get conversation configuration
```json
{
  "success": true,
  "configuration": {
    "chatbot_id": "chatbot-456",
    "image_enabled": true,
    "language": "danish",
    "topKSettings": {"main": 5},
    "flowApiKeys": {"main": "api-key"}
  }
}
```

#### `POST /api/upload-image`
Process image uploads
```json
{
  "chatbot_id": "chatbot-456",
  "image_data": {"name": "image.jpg", "data": "base64...", "mime": "image/jpeg"},
  "message_text": "What is this?",
  "configuration": {}
}
```

#### `GET /api/conversation-health`
Health check for conversation processing
```json
{
  "status": "healthy",
  "database": "connected", 
  "active_streams": 5,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## 🛠️ Setup Instructions

### 1. Database Migration
```bash
cd backend
node scripts/setup-conversation-processing.js
```

### 2. Restart Backend Server
The new routes and cron jobs will start automatically.

### 3. Verify Setup
Check system health:
```bash
curl http://localhost:3000/api/conversation-health
```

## 🔧 Configuration

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- Standard AI API keys and configuration

### Flow Configuration
- All existing flow configurations are preserved
- New system reads from existing `flow_template_assignments` table
- Prompt templates work exactly as before

## 📈 Monitoring

### Performance Metrics
- Processing time tracking
- Token streaming performance
- Flow execution timing
- Parallel vs sequential execution stats

### Session Management
- Active conversation sessions
- Streaming session status
- Event delivery tracking
- Automatic cleanup

### Logs
Watch for these log messages:
- `🔄 Backend: Starting conversation processing`
- `🚀 Backend: Starting parallel execution`
- `📡 SSE emitted: [event] for session [id]`
- `✅ Backend: Streaming session completed`

## 🚨 Error Handling

### Automatic Retries
- Network errors: 2 retries with exponential backoff
- API timeouts: Automatic retry logic
- Streaming failures: Graceful degradation

### Error Logging
- All errors logged to `error_logs` table
- Category: `CONVERSATION_PROCESSING_ERROR`
- Full context and stack traces captured

## 🔄 Migration Status

### Phase 1 Complete ✅
- [x] Backend services created
- [x] Controllers and routes implemented
- [x] Database schema updated
- [x] Utility functions created
- [x] Integration with existing backend

### Next: Phase 2
- [ ] Migrate core conversation logic from frontend
- [ ] Update frontend to use new backend APIs
- [ ] Test streaming performance
- [ ] Validate all flow types

## 🎯 Success Metrics

### Performance Targets
- Response time: < 2 seconds to first token
- Streaming: > 10 tokens/second
- Availability: > 99.9% uptime

### Functionality Targets  
- All existing flows work identically
- No regression in conversation quality
- Improved error handling and recovery

## 📞 Testing

### Manual Testing
```bash
# Test message processing
curl -X POST http://localhost:3000/api/process-message \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","chatbot_id":"test","message_text":"Hello"}'

# Test configuration
curl http://localhost:3000/api/conversation-config/test

# Test health
curl http://localhost:3000/api/conversation-health
```

### Integration Testing
- Test with real chatbot configurations
- Validate streaming event delivery
- Test error scenarios and recovery
- Performance benchmarking

## 🔧 Troubleshooting

### Common Issues

#### Database Connection
1. Verify DATABASE_URL environment variable
2. Check table creation with setup script
3. Verify indexes are created

#### Streaming Issues  
1. Check active streaming sessions in database
2. Monitor streaming_events table
3. Verify cleanup jobs are running

#### Performance Issues
1. Monitor conversation_processing_metrics table
2. Check for slow API responses
3. Analyze parallel vs sequential execution

### Debug Queries
```sql
-- Check active sessions
SELECT * FROM conversation_sessions WHERE status = 'active';

-- Check streaming sessions
SELECT * FROM streaming_sessions WHERE status = 'active';

-- Check recent events
SELECT * FROM streaming_events WHERE created_at > NOW() - INTERVAL '1 hour';

-- Performance metrics
SELECT * FROM conversation_processing_metrics ORDER BY created_at DESC LIMIT 10;
```
