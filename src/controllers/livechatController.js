import {
  appendLivechatMessageService,
  getConversationMessagesService,
  migrateConversationWithMessagesService,
  getLivechatConversationAtomicService,
  setAgentTypingStatusService,
  getAgentTypingStatusService,
  getLivechatStatisticsService,
  getPublicAverageResponseTimeService
} from '../services/livechatService.js';

export async function appendLivechatMessageController(req, res, pool) {
  try {
    const result = await appendLivechatMessageService(req.body, pool);
    res.status(201).json(result);
  } catch (error) {
    console.error('Livechat: append message error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

export async function getConversationMessagesController(req, res, pool) {
  try {
    const data = await getConversationMessagesService(req.query, pool);
    res.json(data);
  } catch (error) {
    console.error('Livechat: get messages error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

export async function migrateConversationWithMessagesController(req, res, pool) {
  try {
    const result = await migrateConversationWithMessagesService(req.body, pool);
    res.json(result);
  } catch (error) {
    console.error('Livechat: migrate error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

export async function getLivechatConversationAtomicController(req, res, pool) {
  try {
    const data = await getLivechatConversationAtomicService(req.query, pool);
    res.json(data);
  } catch (error) {
    console.error('Livechat: get conversation (atomic) error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

export async function setAgentTypingStatusController(req, res, pool) {
  try {
    const result = await setAgentTypingStatusService(req.body, pool);
    res.json(result);
  } catch (error) {
    console.error('Livechat: set typing error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

export async function getAgentTypingStatusController(req, res, pool) {
  try {
    const data = await getAgentTypingStatusService(req.query, pool);
    res.json(data);
  } catch (error) {
    console.error('Livechat: get typing error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

export async function getLivechatStatisticsController(req, res, pool, user) {
  try {
    const data = await getLivechatStatisticsService(req.query, pool, user);
    res.json(data);
  } catch (error) {
    console.error('Livechat: statistics error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

export async function getPublicAverageResponseTimeController(req, res, pool) {
  try {
    const data = await getPublicAverageResponseTimeService(req.params, pool);
    res.json(data);
  } catch (error) {
    console.error('Livechat: public avg response time error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}


