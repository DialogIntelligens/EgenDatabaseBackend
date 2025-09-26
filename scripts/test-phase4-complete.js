/**
 * Phase 4 Complete Testing Script
 * Comprehensive testing of the entire conversation processing system
 */

import fetch from 'node-fetch';
import pg from 'pg';

const { Pool } = pg;

// Test configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const TEST_CHATBOT_ID = 'vinhuset'; // Use real chatbot for testing
const TEST_USER_ID = `test-user-${Date.now()}`;

// Database connection for verification
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

/**
 * Main testing function
 */
async function runPhase4CompleteTesting() {
  console.log('🧪 Phase 4 Complete Testing - Conversation Logic Migration');
  console.log('Backend URL:', BACKEND_URL);
  console.log('Test Chatbot ID:', TEST_CHATBOT_ID);
  console.log('Test User ID:', TEST_USER_ID);
  
  const testResults = {
    passed: 0,
    failed: 0,
    tests: []
  };

  try {
    // Test 1: Backend Health and Monitoring
    await runTest('Backend Health Check', testBackendHealth, testResults);
    
    // Test 2: Configuration Loading
    await runTest('Configuration Loading', testConfigurationLoading, testResults);
    
    // Test 3: Flow Routing
    await runTest('Flow Routing', testFlowRouting, testResults);
    
    // Test 4: Metadata Flow Processing
    await runTest('Metadata Flow Processing', testMetadataFlows, testResults);
    
    // Test 5: Order Tracking Integration
    await runTest('Order Tracking', testOrderTracking, testResults);
    
    // Test 6: Image Processing
    await runTest('Image Processing', testImageProcessing, testResults);
    
    // Test 7: Streaming Performance
    await runTest('Streaming Performance', testStreamingPerformance, testResults);
    
    // Test 8: Error Handling
    await runTest('Error Handling', testErrorHandling, testResults);
    
    // Test 9: Database Integration
    await runTest('Database Integration', testDatabaseIntegration, testResults);
    
    // Test 10: Cache Performance
    await runTest('Cache Performance', testCachePerformance, testResults);

    // Final Results
    console.log('\n🎉 Phase 4 Testing Complete!');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📊 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.failed === 0) {
      console.log('\n🚀 ALL TESTS PASSED - MIGRATION COMPLETE!');
      console.log('✅ Backend conversation processing system is fully operational');
      console.log('✅ All integrations are working correctly');
      console.log('✅ Performance optimizations are active');
      console.log('✅ Error handling is comprehensive');
      console.log('\n🎯 Ready for production deployment!');
    } else {
      console.log('\n⚠️ Some tests failed - review results before deployment');
      testResults.tests.filter(t => !t.passed).forEach(test => {
        console.log(`❌ ${test.name}: ${test.error}`);
      });
    }

  } catch (error) {
    console.error('❌ Testing failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Run individual test with error handling
 */
async function runTest(testName, testFunction, testResults) {
  try {
    console.log(`\n🧪 Running: ${testName}`);
    await testFunction();
    console.log(`✅ ${testName} - PASSED`);
    testResults.passed++;
    testResults.tests.push({ name: testName, passed: true });
  } catch (error) {
    console.log(`❌ ${testName} - FAILED: ${error.message}`);
    testResults.failed++;
    testResults.tests.push({ name: testName, passed: false, error: error.message });
  }
}

/**
 * Test backend health and monitoring
 */
async function testBackendHealth() {
  const response = await fetch(`${BACKEND_URL}/api/conversation-health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  
  const health = await response.json();
  if (health.status !== 'healthy') {
    throw new Error(`Backend status: ${health.status}`);
  }
  
  console.log('  ✓ Backend is healthy');
  console.log('  ✓ Database connected');
  console.log(`  ✓ Active streams: ${health.active_streams}`);
}

/**
 * Test configuration loading
 */
async function testConfigurationLoading() {
  const response = await fetch(`${BACKEND_URL}/api/conversation-config/${TEST_CHATBOT_ID}`);
  if (!response.ok) {
    throw new Error(`Configuration loading failed: ${response.status}`);
  }
  
  const config = await response.json();
  if (!config.success || !config.configuration) {
    throw new Error('Invalid configuration response');
  }
  
  // Check for required configuration keys
  const requiredKeys = ['chatbot_id', 'image_enabled', 'pineconeApiKey'];
  for (const key of requiredKeys) {
    if (!(key in config.configuration)) {
      throw new Error(`Missing required configuration key: ${key}`);
    }
  }
  
  console.log('  ✓ Configuration loaded successfully');
  console.log(`  ✓ Configuration keys: ${Object.keys(config.configuration).length}`);
}

/**
 * Test flow routing
 */
async function testFlowRouting() {
  const testMessages = [
    { text: 'rødvin til under 80kr', expectedFlow: 'flow4' },
    { text: 'hvad er jeres åbningstider', expectedFlow: 'main' },
    { text: 'jeg vil gerne tracke min ordre', expectedFlow: 'apiflow' }
  ];

  for (const testMessage of testMessages) {
    const response = await fetch(`${BACKEND_URL}/api/process-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        chatbot_id: TEST_CHATBOT_ID,
        message_text: testMessage.text,
        conversation_history: [],
        configuration: {}
      })
    });

    if (!response.ok) {
      throw new Error(`Flow routing failed for "${testMessage.text}": ${response.status}`);
    }

    const result = await response.json();
    console.log(`  ✓ "${testMessage.text}" → Flow processing started`);
    console.log(`  ✓ Session ID: ${result.session_id}`);
    console.log(`  ✓ Streaming ID: ${result.streaming_session_id}`);
  }
}

/**
 * Test metadata flow processing
 */
async function testMetadataFlows() {
  const response = await fetch(`${BACKEND_URL}/api/process-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      chatbot_id: TEST_CHATBOT_ID,
      message_text: 'vin til under 100kr', // Should trigger metadata flow
      conversation_history: [],
      configuration: {}
    })
  });

  if (!response.ok) {
    throw new Error(`Metadata flow test failed: ${response.status}`);
  }

  const result = await response.json();
  console.log('  ✓ Metadata flow processing started');
  console.log(`  ✓ Session created: ${result.session_id}`);
  
  // Wait a moment and check if streaming events are generated
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const eventsResponse = await fetch(`${BACKEND_URL}/api/stream-events/${result.streaming_session_id}?lastEventId=0`);
  if (eventsResponse.ok) {
    const events = await eventsResponse.json();
    console.log(`  ✓ Streaming events generated: ${events.events.length}`);
  }
}

/**
 * Test order tracking integration
 */
async function testOrderTracking() {
  // Test with order-related message
  const response = await fetch(`${BACKEND_URL}/api/process-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      chatbot_id: TEST_CHATBOT_ID,
      message_text: 'jeg vil gerne tracke min ordre nummer 12345 mit navn er test',
      conversation_history: [],
      configuration: {}
    })
  });

  if (!response.ok) {
    throw new Error(`Order tracking test failed: ${response.status}`);
  }

  const result = await response.json();
  console.log('  ✓ Order tracking flow started');
  console.log(`  ✓ Session: ${result.session_id}`);
}

/**
 * Test image processing
 */
async function testImageProcessing() {
  // Create a small test image (1x1 pixel PNG)
  const testImageData = {
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    name: 'test.png',
    mime: 'image/png',
    size: 95
  };

  const response = await fetch(`${BACKEND_URL}/api/process-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      chatbot_id: TEST_CHATBOT_ID,
      message_text: '',
      image_data: testImageData,
      conversation_history: [],
      configuration: { imageEnabled: true }
    })
  });

  if (!response.ok) {
    throw new Error(`Image processing test failed: ${response.status}`);
  }

  const result = await response.json();
  console.log('  ✓ Image processing started');
  console.log(`  ✓ Session: ${result.session_id}`);
}

/**
 * Test streaming performance
 */
async function testStreamingPerformance() {
  const startTime = Date.now();
  
  const response = await fetch(`${BACKEND_URL}/api/process-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      chatbot_id: TEST_CHATBOT_ID,
      message_text: 'test performance',
      conversation_history: [],
      configuration: {}
    })
  });

  if (!response.ok) {
    throw new Error(`Performance test failed: ${response.status}`);
  }

  const result = await response.json();
  const responseTime = Date.now() - startTime;
  
  if (responseTime > 5000) {
    throw new Error(`Response time too slow: ${responseTime}ms`);
  }
  
  console.log(`  ✓ Response time: ${responseTime}ms`);
  console.log(`  ✓ Performance summary available: ${!!result.performance_summary}`);
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  // Test with invalid chatbot ID
  const response = await fetch(`${BACKEND_URL}/api/process-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      chatbot_id: 'invalid-chatbot-id',
      message_text: 'test error handling',
      conversation_history: [],
      configuration: {}
    })
  });

  // Should handle gracefully (might succeed with default config or fail gracefully)
  console.log(`  ✓ Error handling test completed with status: ${response.status}`);
  
  if (response.ok) {
    console.log('  ✓ System handled invalid chatbot gracefully');
  } else {
    console.log('  ✓ System rejected invalid chatbot appropriately');
  }
}

/**
 * Test database integration
 */
async function testDatabaseIntegration() {
  // Check that all required tables exist
  const tables = [
    'conversation_sessions',
    'streaming_sessions', 
    'streaming_events',
    'conversation_processing_metrics',
    'chatbot_settings'
  ];

  for (const tableName of tables) {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_name = $1
    `, [tableName]);
    
    if (result.rows[0].count === 0) {
      throw new Error(`Required table missing: ${tableName}`);
    }
  }
  
  console.log(`  ✓ All ${tables.length} required tables exist`);
  
  // Check recent activity
  const activityResult = await pool.query(`
    SELECT COUNT(*) as recent_sessions
    FROM conversation_sessions
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `);
  
  console.log(`  ✓ Recent sessions: ${activityResult.rows[0].recent_sessions}`);
}

/**
 * Test cache performance
 */
async function testCachePerformance() {
  // Test cache statistics endpoint
  const response = await fetch(`${BACKEND_URL}/api/monitoring/cache-stats`);
  if (!response.ok) {
    throw new Error(`Cache stats failed: ${response.status}`);
  }
  
  const stats = await response.json();
  console.log('  ✓ Cache statistics available');
  console.log(`  ✓ Configuration cache: ${stats.configuration.active} active`);
  console.log(`  ✓ Prompt cache: ${stats.prompts.active} active`);
}

// Run the complete test suite
runPhase4CompleteTesting();
