import { generateReport } from '../services/mainService.js';

/**
 * Generate report controller - handles the /generate-report endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function generateReportController(req, res) {
  try {
    const {
      statisticsData,
      timePeriod,
      chatbot_id,
      includeTextAnalysis,
      includeGPTAnalysis,
      maxConversations,
      language,
      selectedEmne
    } = req.body;

    // Validate required parameters
    if (!statisticsData) {
      return res.status(400).json({ error: 'Statistics data is required' });
    }

    console.log('Controller: Generating report with parameters:', {
      timePeriod,
      chatbot_id,
      includeTextAnalysis,
      includeGPTAnalysis,
      maxConversations,
      language,
      selectedEmne,
      userId: req.user?.userId
    });

    // Call the service layer
    const pdfBuffer = await generateReport(
      statisticsData,
      timePeriod,
      chatbot_id,
      includeTextAnalysis,
      includeGPTAnalysis,
      maxConversations,
      language,
      selectedEmne,
      req.user.userId,
      req.pool // Assuming pool is attached to req or we need to pass it differently
    );

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=statistics-report.pdf');
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send the PDF buffer directly as binary data
    res.end(pdfBuffer, 'binary');

  } catch (error) {
    console.error('Controller: Error generating report:', error);
    res.status(500).json({
      error: 'Failed to generate report',
      details: error.message
    });
  }
}
