import {
  registerController, loginController, updateCompanyInfoController, getCompanyInfoController,
  updateAgentNameController, updateProfilePictureController, uploadLogoController,
  getLivechatNotificationSoundController, updateLivechatNotificationSoundController,
  getShowUserProfilePicturesController, updateShowUserProfilePicturesController,
  trackDashboardOpenController, trackPageVisitController
} from '../controllers/usersController.js';

export function registerUsersRoutes(app, pool, authenticateToken, jwtSecret) {
  // Auth
  app.post('/register', (req, res) => registerController(req, res, pool));
  app.post('/login', (req, res) => loginController(req, res, pool, jwtSecret));

  // Company info + profile
  app.put('/update-company-info', authenticateToken, (req, res) => updateCompanyInfoController(req, res, pool));
  app.get('/company-info', authenticateToken, (req, res) => getCompanyInfoController(req, res, pool));
  app.put('/update-agent-name', authenticateToken, (req, res) => updateAgentNameController(req, res, pool));
  app.put('/update-profile-picture', authenticateToken, (req, res) => updateProfilePictureController(req, res, pool));
  app.post('/upload-logo', authenticateToken, (req, res) => uploadLogoController(req, res));

  // Preferences
  app.get('/livechat-notification-sound', authenticateToken, (req, res) => getLivechatNotificationSoundController(req, res, pool));
  app.put('/livechat-notification-sound', authenticateToken, (req, res) => updateLivechatNotificationSoundController(req, res, pool));
  app.get('/show-user-profile-pictures', authenticateToken, (req, res) => getShowUserProfilePicturesController(req, res, pool));
  app.put('/show-user-profile-pictures', authenticateToken, (req, res) => updateShowUserProfilePicturesController(req, res, pool));

  // Tracking
  app.post('/track/dashboard-open', authenticateToken, (req, res) => trackDashboardOpenController(req, res, pool));
  app.post('/track/page-visit', authenticateToken, (req, res) => trackPageVisitController(req, res, pool));
}


