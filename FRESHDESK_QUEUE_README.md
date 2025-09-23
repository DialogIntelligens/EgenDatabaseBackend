# Freshdesk Async Queue System

This document describes the new async processing system for Freshdesk tickets that prevents timeout errors and improves user experience.

## 🚀 Overview

The Freshdesk queue system processes ticket creation in the background, allowing users to receive immediate confirmation while tickets are processed asynchronously. This prevents the timeout issues that were occurring with direct API calls.

## 🏗️ Architecture

```
Frontend → Backend API → Queue → Background Processor → Freshdesk API
```

### Components:

1. **Queue Service** (`freshdeskQueueService.js`) - Manages ticket queue operations
2. **Updated Controller** - Routes requests to queue or direct processing
3. **Background Processor** - Cron job that processes queued tickets
4. **Database Table** - Stores pending tickets with retry logic

## 📊 Database Schema

```sql
CREATE TABLE freshdesk_ticket_queue (
    id SERIAL PRIMARY KEY,
    ticket_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_message TEXT,
    freshdesk_ticket_id VARCHAR(255),
    chatbot_id VARCHAR(255),
    user_id VARCHAR(255)
);
```

## 🔄 Processing Flow

### 1. Ticket Submission
- User submits Freshdesk form
- Frontend sends request to `/api/create-freshdesk-ticket`
- Backend queues ticket and returns 202 Accepted immediately
- User sees confirmation message

### 2. Background Processing
- Cron job runs every minute: `* * * * *`
- Processes up to 10 pending tickets per batch
- Implements exponential backoff for failed attempts
- Logs success/failure for monitoring

### 3. Retry Logic
- Failed tickets are retried with exponential backoff
- Backoff formula: `2^attempts` minutes
- Maximum 3 attempts before permanent failure
- Detailed error logging for troubleshooting

## 🛠️ Setup Instructions

### 1. Database Migration
```bash
cd backend
node scripts/setup-freshdesk-queue.js
```

### 2. Restart Backend Server
The cron jobs will start automatically when the server starts.

### 3. Verify Setup
Check queue status:
```bash
curl http://localhost:3000/api/freshdesk-queue/stats
```

## 📡 API Endpoints

### Main Endpoints

#### `POST /api/create-freshdesk-ticket`
Creates a ticket (now uses queue by default)
- **Response**: 202 Accepted with queue information
- **Fallback**: Direct processing if queue fails

#### `POST /api/create-freshdesk-ticket-direct`
Direct ticket creation (for admin/testing)
- **Response**: 201 Created with ticket ID

### Queue Management

#### `GET /api/freshdesk-queue/stats`
Get queue statistics
```json
{
  "success": true,
  "stats": {
    "pending": 5,
    "processing": 1,
    "completed": 150,
    "failed": 2
  }
}
```

#### `POST /api/freshdesk-queue/process`
Manually trigger queue processing
- **Query Params**: `batch_size` (default: 5)

## 📈 Monitoring

### Queue Statistics
Monitor queue health with the stats endpoint:
- **pending**: Tickets waiting to be processed
- **processing**: Tickets currently being processed
- **completed**: Successfully processed tickets
- **failed**: Permanently failed tickets

### Logs
Watch for these log messages:
- `Freshdesk ticket queued successfully`
- `Freshdesk queue processing: X successful, Y failed`
- `Freshdesk ticket completed: queue_id=X, ticket_id=Y`

### Cron Jobs
1. **Queue Processing**: Every minute (`* * * * *`)
2. **Cleanup**: Daily at 3 AM (`0 3 * * *`)

## 🔧 Configuration

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- Standard Freshdesk environment variables

### Queue Settings
- **Batch Size**: 10 tickets per minute (configurable)
- **Max Attempts**: 3 attempts per ticket
- **Backoff**: Exponential (2^attempts minutes)
- **Cleanup**: Remove old entries after 7 days

## 🚨 Troubleshooting

### Common Issues

#### Queue Not Processing
1. Check if cron jobs are running
2. Verify database connection
3. Check for errors in server logs

#### High Failure Rate
1. Check Freshdesk API status
2. Verify API credentials
3. Review error messages in queue table

#### Database Performance
1. Monitor queue table size
2. Ensure cleanup job is running
3. Check index usage

### Manual Recovery

#### Retry Failed Tickets
```sql
UPDATE freshdesk_ticket_queue 
SET status = 'pending', 
    attempts = 0, 
    next_attempt_at = NOW() 
WHERE status = 'failed' AND attempts < max_attempts;
```

#### Clear Old Tickets
```sql
DELETE FROM freshdesk_ticket_queue 
WHERE status IN ('completed', 'failed') 
  AND processed_at < NOW() - INTERVAL '7 days';
```

## 📊 Performance Benefits

### Before (Direct Processing)
- ❌ 35-second timeout risk
- ❌ User waits for Freshdesk API
- ❌ Network issues cause failures
- ❌ Poor mobile experience

### After (Queue Processing)
- ✅ Immediate user feedback (< 1 second)
- ✅ Background processing with retries
- ✅ Handles Freshdesk API slowness
- ✅ Exponential backoff for resilience
- ✅ Better error tracking and recovery

## 🔄 Migration Path

### Backwards Compatibility
- Existing direct endpoint still works
- Can opt-out with `?async=false` query parameter
- Frontend handles both response formats

### Gradual Rollout
1. Deploy backend changes
2. Run database migration
3. Monitor queue processing
4. Frontend automatically uses new system

## 🎯 Success Metrics

### Reduced Errors
- Target: < 1% Freshdesk timeout errors
- Monitor: Error logs with category `FRESHDESK_ERROR`

### Improved User Experience  
- Target: < 2 second form submission response
- Monitor: Frontend response times

### Queue Health
- Target: > 95% successful processing rate
- Monitor: Queue stats and completion rates

## 📞 Support

For issues or questions about the Freshdesk queue system:
1. Check server logs for error messages
2. Review queue statistics for bottlenecks
3. Monitor database performance
4. Check Freshdesk API status if high failure rates
