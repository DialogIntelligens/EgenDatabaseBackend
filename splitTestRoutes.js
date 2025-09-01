/* ================================
   Split Test Management Routes
================================ */

// GET split tests for a chatbot
export function registerSplitTestRoutes(app, pool, authenticateToken) {
  
  // GET all split tests for a chatbot
  app.get('/split-tests/:chatbot_id', authenticateToken, async (req, res) => {
    const { chatbot_id } = req.params;
    const userId = req.user.userId;

    try {
      console.log(`Fetching split tests for chatbot_id: ${chatbot_id}, user_id: ${userId}`);
      
      // First, let's check if there are ANY split tests in the database for debugging
      const allSplitTests = await pool.query('SELECT * FROM split_tests');
      console.log('Total split tests in database:', allSplitTests.rows.length);
      console.log('All split tests:', allSplitTests.rows);
      
      // Get split tests with their variants
      const result = await pool.query(`
        SELECT 
          st.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', stv.id,
                'name', stv.name,
                'percentage', stv.percentage,
                'popup_message', stv.popup_message
              ) ORDER BY stv.id
            ) FILTER (WHERE stv.id IS NOT NULL),
            '[]'::json
          ) as variants
        FROM split_tests st
        LEFT JOIN split_test_variants stv ON st.id = stv.split_test_id
        WHERE st.chatbot_id = $1 AND st.user_id = $2
        GROUP BY st.id
        ORDER BY st.created_at DESC
      `, [chatbot_id, userId]);

      console.log(`Found ${result.rows.length} split tests for user ${userId}, chatbot ${chatbot_id}`);
      console.log('Split test results:', result.rows);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching split tests:', error);
      console.error('Error details:', error.message);
      res.status(500).json({ error: 'Failed to fetch split tests', details: error.message });
    }
  });

  // POST create new split test
  app.post('/split-tests', authenticateToken, async (req, res) => {
    const { user_id, chatbot_id, name, variants } = req.body;
    const requestingUserId = req.user.userId;

    console.log('Creating split test with params:', { user_id, chatbot_id, name, variants, requestingUserId });

    // Validate input
    if (!chatbot_id || !name || !variants || !Array.isArray(variants)) {
      return res.status(400).json({ error: 'chatbot_id, name, and variants array are required' });
    }

    // Validate user access (admin or own user)
    if (!req.user.isAdmin && requestingUserId !== user_id) {
      return res.status(403).json({ error: 'Forbidden: You can only create split tests for your own chatbots' });
    }

    // Validate percentages
    const totalPercentage = variants.reduce((sum, variant) => sum + (variant.percentage || 0), 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return res.status(400).json({ error: 'Variant percentages must add up to 100%' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create split test
      console.log('Inserting split test:', { user_id, chatbot_id, name });
      const splitTestResult = await client.query(`
        INSERT INTO split_tests (user_id, chatbot_id, name, is_enabled)
        VALUES ($1, $2, $3, false)
        RETURNING *
      `, [user_id, chatbot_id, name]);

      const splitTestId = splitTestResult.rows[0].id;
      console.log('Split test created with ID:', splitTestId);

      // Create variants
      for (const variant of variants) {
        console.log('Inserting variant:', { splitTestId, variant });
        await client.query(`
          INSERT INTO split_test_variants (split_test_id, name, percentage, popup_message)
          VALUES ($1, $2, $3, $4)
        `, [splitTestId, variant.name, variant.percentage, variant.popup_message || '']);
      }

      await client.query('COMMIT');
      
      console.log('Split test creation completed successfully');
      res.status(201).json({
        message: 'Split test created successfully',
        split_test: splitTestResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating split test:', error);
      console.error('Error details:', error.message);
      res.status(500).json({ error: 'Failed to create split test', details: error.message });
    } finally {
      client.release();
    }
  });

  // PATCH update split test (enable/disable)
  app.patch('/split-tests/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { is_enabled } = req.body;
    const userId = req.user.userId;

    try {
      // Verify ownership
      const ownershipCheck = await pool.query(
        'SELECT user_id FROM split_tests WHERE id = $1',
        [id]
      );

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Split test not found' });
      }

      if (!req.user.isAdmin && ownershipCheck.rows[0].user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only modify your own split tests' });
      }

      const result = await pool.query(`
        UPDATE split_tests 
        SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [is_enabled, id]);

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating split test:', error);
      res.status(500).json({ error: 'Failed to update split test' });
    }
  });

  // GET single variant
  app.get('/split-test-variants/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
      const result = await pool.query(`
        SELECT stv.*, st.user_id, st.name as split_test_name
        FROM split_test_variants stv
        JOIN split_tests st ON stv.split_test_id = st.id
        WHERE stv.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      const variant = result.rows[0];

      // Verify ownership
      if (!req.user.isAdmin && variant.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only view your own split test variants' });
      }

      res.json(variant);
    } catch (error) {
      console.error('Error fetching variant:', error);
      res.status(500).json({ error: 'Failed to fetch variant' });
    }
  });

  // PATCH update variant
  app.patch('/split-test-variants/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { popup_message } = req.body;
    const userId = req.user.userId;

    try {
      // Verify ownership
      const ownershipCheck = await pool.query(`
        SELECT st.user_id
        FROM split_test_variants stv
        JOIN split_tests st ON stv.split_test_id = st.id
        WHERE stv.id = $1
      `, [id]);

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      if (!req.user.isAdmin && ownershipCheck.rows[0].user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only modify your own split test variants' });
      }

      const result = await pool.query(`
        UPDATE split_test_variants 
        SET popup_message = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [popup_message, id]);

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating variant:', error);
      res.status(500).json({ error: 'Failed to update variant' });
    }
  });

  // GET split test statistics
  app.get('/split-test-statistics/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    const userId = req.user.userId;

    try {
      // Verify ownership
      const ownershipCheck = await pool.query(
        'SELECT user_id, name FROM split_tests WHERE id = $1',
        [id]
      );

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Split test not found' });
      }

      if (!req.user.isAdmin && ownershipCheck.rows[0].user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only view statistics for your own split tests' });
      }

      // Get variant statistics
      let dateFilter = '';
      const queryParams = [id];
      let paramIndex = 2;

      if (start_date && end_date) {
        dateFilter = ` AND sta.assigned_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        queryParams.push(start_date, end_date);
      }

      const result = await pool.query(`
        SELECT 
          stv.id,
          stv.name,
          stv.percentage,
          stv.popup_message,
          COUNT(sta.id) as total_assignments,
          COUNT(c.id) as total_conversations
        FROM split_test_variants stv
        LEFT JOIN split_test_assignments sta ON stv.id = sta.variant_id${dateFilter}
        LEFT JOIN conversations c ON sta.user_session_id = c.user_id AND sta.chatbot_id = c.chatbot_id
        WHERE stv.split_test_id = $1
        GROUP BY stv.id, stv.name, stv.percentage, stv.popup_message
        ORDER BY stv.id
      `, queryParams);

      const totalAssignments = result.rows.reduce((sum, variant) => sum + parseInt(variant.total_assignments), 0);
      const totalConversations = result.rows.reduce((sum, variant) => sum + parseInt(variant.total_conversations), 0);

      res.json({
        split_test_name: ownershipCheck.rows[0].name,
        total_assignments: totalAssignments,
        total_conversations: totalConversations,
        variants: result.rows.map(row => ({
          ...row,
          total_assignments: parseInt(row.total_assignments),
          total_conversations: parseInt(row.total_conversations)
        }))
      });
    } catch (error) {
      console.error('Error fetching split test statistics:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  // POST assign user to variant (called from integration script)
  app.post('/split-test-assign', async (req, res) => {
    const { user_session_id, chatbot_id } = req.body;

    if (!user_session_id || !chatbot_id) {
      return res.status(400).json({ error: 'user_session_id and chatbot_id are required' });
    }

    try {
      // Check if user already has an assignment
      const existingAssignment = await pool.query(`
        SELECT sta.variant_id, stv.popup_message
        FROM split_test_assignments sta
        JOIN split_test_variants stv ON sta.variant_id = stv.id
        WHERE sta.user_session_id = $1 AND sta.chatbot_id = $2
      `, [user_session_id, chatbot_id]);

      if (existingAssignment.rows.length > 0) {
        return res.json({
          assigned: true,
          variant_id: existingAssignment.rows[0].variant_id,
          popup_message: existingAssignment.rows[0].popup_message
        });
      }

      // Get active split test for this chatbot
      const activeSplitTest = await pool.query(`
        SELECT st.id, stv.id as variant_id, stv.percentage, stv.popup_message
        FROM split_tests st
        JOIN split_test_variants stv ON st.id = stv.split_test_id
        WHERE st.chatbot_id = $1 AND st.is_enabled = true
        ORDER BY stv.id
      `, [chatbot_id]);

      if (activeSplitTest.rows.length === 0) {
        return res.json({ assigned: false, message: 'No active split test' });
      }

      // Assign user to variant based on percentage
      const random = Math.random() * 100;
      let cumulativePercentage = 0;
      let assignedVariant = null;

      for (const variant of activeSplitTest.rows) {
        cumulativePercentage += parseFloat(variant.percentage);
        if (random <= cumulativePercentage) {
          assignedVariant = variant;
          break;
        }
      }

      // Fallback to first variant if something goes wrong
      if (!assignedVariant) {
        assignedVariant = activeSplitTest.rows[0];
      }

      // Save assignment
      await pool.query(`
        INSERT INTO split_test_assignments (split_test_id, variant_id, user_session_id, chatbot_id)
        VALUES ($1, $2, $3, $4)
      `, [activeSplitTest.rows[0].id, assignedVariant.variant_id, user_session_id, chatbot_id]);

      res.json({
        assigned: true,
        variant_id: assignedVariant.variant_id,
        popup_message: assignedVariant.popup_message
      });
    } catch (error) {
      console.error('Error assigning split test variant:', error);
      res.status(500).json({ error: 'Failed to assign variant' });
    }
  });

  // GET popup message for chatbot (backwards compatible)
  app.get('/popup-message/:chatbot_id', async (req, res) => {
    const { chatbot_id } = req.params;
    const { user_session_id } = req.query;

    try {
      // First check if user has an active split test assignment
      if (user_session_id) {
        const assignmentResult = await pool.query(`
          SELECT stv.popup_message
          FROM split_test_assignments sta
          JOIN split_test_variants stv ON sta.variant_id = stv.id
          JOIN split_tests st ON stv.split_test_id = st.id
          WHERE sta.user_session_id = $1 AND sta.chatbot_id = $2 AND st.is_enabled = true
        `, [user_session_id, chatbot_id]);

        if (assignmentResult.rows.length > 0) {
          return res.json({
            popup_message: assignmentResult.rows[0].popup_message,
            source: 'split_test'
          });
        }
      }

      // Fallback to user's default popup message by finding the user who owns this chatbot
      const userResult = await pool.query(`
        SELECT u.popup_message
        FROM users u
        WHERE u.chatbot_ids @> $1::jsonb
        LIMIT 1
      `, [JSON.stringify([chatbot_id])]);

      if (userResult.rows.length > 0 && userResult.rows[0].popup_message) {
        return res.json({
          popup_message: userResult.rows[0].popup_message,
          source: 'database'
        });
      }

      // No database popup message found, let integration script use GitHub version
      res.json({
        popup_message: null,
        source: 'github'
      });
    } catch (error) {
      console.error('Error fetching popup message:', error);
      res.status(500).json({ error: 'Failed to fetch popup message' });
    }
  });

  // PUT update user's default popup message
  app.put('/popup-message/:user_id', authenticateToken, async (req, res) => {
    const targetUserId = parseInt(req.params.user_id);
    const { popup_message } = req.body;
    const requestingUserId = req.user.userId;

    // Validate access
    if (!req.user.isAdmin && requestingUserId !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden: You can only update your own popup message' });
    }

    try {
      const result = await pool.query(`
        UPDATE users 
        SET popup_message = $1, last_modified = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, username, popup_message
      `, [popup_message, targetUserId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        message: 'Popup message updated successfully',
        user: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating popup message:', error);
      res.status(500).json({ error: 'Failed to update popup message' });
    }
  });
}
