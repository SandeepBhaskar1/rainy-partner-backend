const express = require('express');
router = express.Router();
const Orders = require('../models/Order');

router.get('/orders', async (req, res) => {
    try {
        const orders = await Orders.find({});
        res.json(orders);
        console.log(orders);
        
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }   
});

module.exports = router;