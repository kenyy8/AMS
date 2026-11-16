const express = require('express');
const router = express.Router();
const studentController = require('../controllers/tenantController');
const { verifyToken, isAdmin, isStudent } = require('../middleware/auth');

router.post('/login', studentController.login);
router.post('/', verifyToken, isAdmin, studentController.create);
router.get('/', verifyToken, isAdmin, studentController.getAll);
router.put('/:id', verifyToken, isAdmin, studentController.update);
router.delete('/:id', verifyToken, isAdmin, studentController.delete);
router.get('/me', verifyToken, isStudent, studentController.getMe);

// Get last ID number for a specific year and course
router.get('/last-id/:yearCourse', verifyToken, isAdmin, async (req, res, next) => {
  try { res.json({ tenant_id: await require('../models/tenantModel').getNextTenantId() }); }
  catch (error) { next(error); }
});

module.exports = router;
