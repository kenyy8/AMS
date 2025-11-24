const express = require('express');
const router = express.Router();
const meter = require('../controllers/meterDeviceController');

router.get('/', meter.getAll);
router.post('/reading', meter.postReading);
router.put('/update-reading/:id', meter.updateReading);
router.get('/meter-history', meter.getBillingHistory);
router.delete('/meter-history/:id', meter.deleteMeterHistory);
router.get('/settings/rates', meter.getRates);
router.post('/settings/rates', meter.setRates);
router.post('/', meter.create);
router.put('/:id', meter.update);
router.delete('/:id', meter.delete);

module.exports = router;
