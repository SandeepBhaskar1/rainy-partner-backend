const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { verifyAdminToken } = require('../middleware/auth');
const { sendCustomerSMS } = require('../utils/fast2sms');

router.post('/', verifyAdminToken, async (req, res) => {
  try {
    const { client, model_purchased } = req.body;

    if (!client || !client.name || !client.phone || !client.address || !client.city ||
      !client.district ||
      !client.state ||
      !client.pincode || !model_purchased) {
      return res.status(400).json({ message: 'Client info and model_purchased are required' });
    }

    const newLead = new Lead({
      client: {
        name: client.name,
        phone: client.phone,
        address: client.address,
        city: client.city,
        district: client.district,
        state: client.state,
        pincode: client.pincode,
      },
      model_purchased,
    });

    await newLead.save();

    sendCustomerSMS(client.phone).catch((err) => {
      console.error("Error sending customer SMS:", err);
    });
    res.status(201).json({ message: 'Lead created successfully', lead: newLead });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', verifyAdminToken, async (req, res) => {
    try {
        const leads = await Lead.find().
        sort({ created_at: -1 });   
        res.json(leads);
        console.log(leads);
        
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/:leadId/assign', verifyAdminToken, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { assigned_plumber_id, status } = req.body;


    if (!assigned_plumber_id || !status) {
      return res.status(400).json({ message: 'Plumber ID and status are required' });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    lead.assigned_plumber_id = assigned_plumber_id;
    lead.status = status;

    await lead.save();

    console.log('Lead after save:', lead);

    res.status(200).json({ message: 'Plumber assigned successfully', lead });
  } catch (error) {
    console.error('Error assigning plumber:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:leadId/reassign', verifyAdminToken, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { assigned_plumber_id, status } = req.body;


    if (!assigned_plumber_id || !status) {
      return res.status(400).json({ message: 'Plumber ID and status are required' });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    lead.assigned_plumber_id = assigned_plumber_id;
    lead.status = status;

    await lead.save();

    console.log('Lead after save:', lead);

    res.status(200).json({ message: 'Plumber assigned successfully', lead });
  } catch (error) {
    console.error('Error assigning plumber:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:leadId/status-completed', verifyAdminToken, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status Reqquired ' });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    lead.status = status;

    await lead.save();

    res.status(200).json({ message: 'Installation Approved.', lead });
  } catch (error) {
    console.error('Error Approving Installation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:leadId/cancel', verifyAdminToken, async (req, res) => {
  try {
    const { leadId } = req.params;

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    lead.assigned_plumber_id = '';
    lead.status = 'not-assigned';
    lead.cancelled_at = new Date();
    lead.cancelled_by = req.user?._id || req.user?.id || null;

    await lead.save();

    console.log('Lead after save:', lead);

    res.status(200).json({ message: 'Plumber cancelled successfully', lead });
  } catch (error) {
    console.error('Error cancelling plumber:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
