const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const { verifyPlumberToken, verifyToken } = require('../middleware/auth');
const { APIError, asyncHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Order = require('../models/Order');
const { v4: uuidv4 } = require('uuid');
const Lead = require('../models/Lead');
const { token } = require('morgan');

const router = express.Router();

router.get('/profile', verifyPlumberToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.user_id);

  if (!user) {
    return res.status(404).json({ detail: 'Plumber not found' });
  }

  const profile = {
    name: user.name,
    user_id: user.user_id,
    phone: user.phone,
    email: user.email,
    kyc_status: user.kyc_status,
    experience: user.experience,
    plumber_license_number: user.plumber_license_number,
    address: user.address,
    tools: user.tools,
    service_area_pin: user.service_area_pin,
    profile: user.profile,
    aadhaar_number: user.aadhaar_number,
    trust: user.trust || 100,
    coordinator_id: user.coordinator_id,
    gstInfo: user.gstInfo || '',
  };

  res.json(profile);
  console.log(user.service_area_pin);
}));

router.put('/profile', verifyPlumberToken, [
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
  body('address.city').optional().trim(),
  body('address.state').optional().trim(),
  body('address.pin').optional().matches(/^\d{6}$/).withMessage('PIN must be 6 digits'),
  body('experience').optional().isInt({ min: 0 }).withMessage('Experience must be a non-negative integer'),
  body('tools').optional().isArray().withMessage('Tools must be an array of strings'),
  body('service_area_pin').optional().isArray().withMessage('Service area PINs must be an array of strings')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      detail: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  console.log("Decoded token user:", req.user);
  const user = await User.findOne({ _id: req.user.user_id });
  
  if (!user) {
    return res.status(404).json({ detail: 'Plumber not found' });
  }

  const allowedFields = ['email', 'address', 'experience', 'tools', 'service_area_pin'];
for (const field of allowedFields) {
  if (req.body[field] !== undefined) {
    if (field === 'address' && typeof req.body.address === 'object') {
      user.address = { ...user.address, ...req.body.address };
    } else {
      user[field] = req.body[field];
    }
  }
}

  await user.save();
  res.json({ message: 'Profile updated successfully', profile: user.getProfile() });
}));


router.get('/stats', async (req, res) => {
  try {
    const plumbers = await User.find({ role: 'PLUMBER' }).select('kyc_status agreement_status');
    const approved = plumbers.filter(p => p.kyc_status === 'approved').length;
    const pending = plumbers.filter(p => p.agreement_status === true && p.kyc_status === 'pending' ).length;
    const rejected = plumbers.filter(p => p.kyc_status === 'rejected').length;
    const deleted = plumbers.filter(p => p.kyc_status === 'deleted').length;

    const ordersCount = await Order.countDocuments();
    const leadsCount = await Lead.countDocuments();

    const openInstallations = await Lead.countDocuments({ status: /pending/i });
    const awaitingDispatch = await Order.countDocuments({ status: /payment-completed/i });

    const unassignedLeads = await Lead.find({ status: { $in: ["not-assigned", "Pending"] }})
      .select('client model_purchased created_at')
      .sort({ created_at: -1 })
      .lean();

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;

    const nowIST = new Date(now.getTime() + istOffset);
    console.log('Current IST Time:', nowIST.toISOString());

    const startOfTodayUTC = new Date(Date.UTC(
      nowIST.getUTCFullYear(),
      nowIST.getUTCMonth(),
      nowIST.getUTCDate()
    ) - istOffset);

    const endOfTodayUTC = new Date(Date.UTC(
      nowIST.getUTCFullYear(),
      nowIST.getUTCMonth(),
      nowIST.getUTCDate(),
      23, 59, 59, 999
    ) - istOffset);

    const todayOrders = await Order.find({
      created_at: { $gte: startOfTodayUTC, $lte: endOfTodayUTC }
    }).select('total_amount created_at');

    const todayOrderCount = todayOrders.length;
    const todayRevenue = todayOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);

    const allOrders = await Order.find()
      .select('createdAt total_amount')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      plumbers: {
        total: plumbers.length,
        approved,
        pending,
        rejected
      },
      orders: {
        total: ordersCount,
        awaitingDispatch,
        todayOrders: todayOrderCount,
        todayRevenue
      },
      leads: {
        total: leadsCount,
        openInstallations,
        unassigned: unassignedLeads
      },
      ordersList: allOrders
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      detail: 'Error fetching stats',
      error: error.message
    });
  }
});

router.put(
  '/agreement',
  verifyPlumberToken,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { agreement_status: true } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ detail: 'Plumber not found' });
    }

    res.json({
      message: 'Agreement accepted successfully',
      agreement_status: user.agreement_status,
      user: user,
    });
  })
);

router.get(
  '/assigned-jobs',
  verifyPlumberToken,
  asyncHandler(async (req, res) => {
    const plumberUserId = req.user.user_id.toString();
    console.log('Fetching assigned jobs for plumber:', plumberUserId);

    try {
      const db = mongoose.connection.db;
      
      const leads = await db.collection('leads').find({
        assigned_plumber_id: plumberUserId,
        status: { 
          $nin: ['completed', 'Completed'] 
        }
      }).toArray();

      console.log('Found assigned jobs:', leads.length);

      if (!leads || leads.length === 0) {
        return res.status(200).json({ 
          message: 'No pending jobs assigned yet', 
          jobs: [] 
        });
      }

      const jobs = leads.map(lead => ({
        id: lead._id.toString(),
        client: lead.client,
        status: lead.status,
        model_purchased: lead.model_purchased,
        created_at: lead.created_at,
        completion_submitted_at: lead.completion_submitted_at,
        completion_images: lead.completion_images || {
          installation_url: "",
          serial_number_url: "",
          warranty_card_url: ""
        }
      }));

      res.json({ jobs });
    } catch (error) {
      console.error('Error fetching assigned jobs:', error);
      res.status(500).json({ 
        detail: 'Failed to fetch assigned jobs',
        error: error.message 
      });
    }
  })
);

router.get('/completed-jobs', verifyPlumberToken, asyncHandler(async (req, res) => {
  const plumberUserId = req.user.user_id.toString();
  console.log('Fetching completed jobs for plumber:', plumberUserId);

  try {
    const db = mongoose.connection.db;
    
    const leads = await db.collection('leads').find({
      assigned_plumber_id: plumberUserId,
      status: { 
        $in: ['completed', 'Completed'] 
      }
    }).sort({ completion_date: -1 }).toArray(); 

    console.log('Found completed jobs:', leads.length);

    if (!leads || leads.length === 0) {
      return res.status(200).json({ 
        message: 'No completed jobs yet', 
        jobs: [] 
      });
    }

    // Format the response (same structure as assigned jobs)
    const jobs = leads.map(lead => ({
      id: lead._id.toString(),
      client: lead.client,
      status: lead.status,
      model_purchased: lead.model_purchased,
      created_at: lead.created_at,
      completion_date: lead.completion_date,
      completion_submitted_at: lead.completion_submitted_at,
      completion_images: lead.completion_images || {
        installation_url: "",
        serial_number_url: "",
        warranty_card_url: ""
      }
    }));

    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching completed jobs:', error);
    res.status(500).json({ 
      detail: 'Failed to fetch completed jobs',
      error: error.message 
    });
  }
}));

// Get plumber orders
router.get('/orders', verifyPlumberToken, asyncHandler(async (req, res) => {
  const orders = await Order.findByPlumber(req.user.user_id);
  res.json(orders);
}));

// Place new order
router.post('/place-order', verifyPlumberToken, [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').notEmpty().withMessage('Product code is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('client.name').trim().notEmpty().withMessage('Customer name is required'),
  body('client.phone').matches(/^[6-9]\d{9}$/).withMessage('Valid phone number is required'),
  body('shipping.address').trim().notEmpty().withMessage('Shipping address is required'),
  body('shipping.city').trim().notEmpty().withMessage('City is required'),
  body('shipping.pin').matches(/^\d{6}$/).withMessage('Valid PIN code is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      detail: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { items, client, shipping, billing } = req.body;

  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  const order = new Order({
    id: uuidv4(),
    plumber_id: req.user.user_id,
    client,
    items,
    shipping: {
      ...shipping,
      gstInfo: shipping.gstInfo || ''
    },
    billing: billing || shipping, 
    total_amount: totalAmount,
    status: 'Order-Placed',
  });

  await order.save();

  res.json({
    message: 'Order placed successfully! Admin will confirm and provide tracking details.',
    order_id: order.id,
    total_amount: totalAmount
  });
}));

router.post(
  '/jobs/submit-completion',
  verifyPlumberToken,
  asyncHandler(async (req, res) => {
    const { job_id, serial_number_image_key, warranty_card_image_key, installation_image_key } = req.body;

    console.log('=== JOB SUBMISSION DEBUG ===');
    console.log('Received job_id:', job_id);
    
    const plumberUserId = req.user.user_id.toString();
    console.log('Plumber user ID (string):', plumberUserId);

    if (!job_id || !serial_number_image_key || !warranty_card_image_key || !installation_image_key) {
      return res.status(400).json({ detail: 'Job ID and all image keys are required' });
    }

    const db = mongoose.connection.db;

    let job = null;
    
    job = await db.collection('leads').findOne({ id: job_id });
    console.log('Job found by id field:', !!job);
    
    if (!job) {
      job = await db.collection('leads').findOne({ _id: job_id });
      console.log('Job found by _id (string):', !!job);
    }
    
    if (!job && job_id.length === 24) {
      try {
        job = await db.collection('leads').findOne({ _id: new mongoose.Types.ObjectId(job_id) });
        console.log('Job found by _id (ObjectId):', !!job);
      } catch (error) {
        console.log('Invalid ObjectId format');
      }
    }

    if (!job) {
      return res.status(404).json({ 
        detail: 'Job not found in database',
        debug: {
          job_id_searched: job_id,
          job_id_length: job_id.length,
          tried_formats: ['id', '_id_string', '_id_objectid'],
          found: false
        }
      });
    }

    console.log('Found job:', {
      id: job.id,
      _id: job._id,
      assigned_plumber_id: job.assigned_plumber_id,
      status: job.status
    });

    if (job.assigned_plumber_id !== plumberUserId) {
      return res.status(403).json({ 
        detail: 'Job is not assigned to you',
        debug: {
          job_assigned_to: job.assigned_plumber_id,
          your_user_id: plumberUserId,
          ids_match: job.assigned_plumber_id === plumberUserId
        }
      });
    }

    const validStatuses = ['Assigned', 'assigned', 'in_progress'];
    if (!validStatuses.includes(job.status)) {
      return res.status(400).json({ 
        detail: 'Job is not in a status that allows completion',
        debug: {
          current_status: job.status,
          valid_statuses: validStatuses
        }
      });
    }

    const completionData = {
      status: 'under_review',
      completion_submitted_at: new Date(),
      completion_images: {
        serial_number_key: serial_number_image_key,
        warranty_card_key: warranty_card_image_key,
        installation_key: installation_image_key,
      },
      completion_submitted_by: plumberUserId,
    };

    const updateFilter = job.id ? { id: job.id } : { _id: job._id };
    const result = await db.collection('leads').updateOne(updateFilter, { $set: completionData });

    console.log('Update result:', result);

    res.json({
      success: true,
      message: 'Job completion submitted successfully',
      status: 'under_review',
    });
  })
);

router.post('/admin/approve-job-completion', verifyPlumberToken, asyncHandler(async (req, res) => {
  const { job_id } = req.body;
  
  if (!job_id) {
    return res.status(400).json({ detail: 'Job ID is required' });
  }

  const db = mongoose.connection.db;
  
  let job = null;
  if (job_id.length === 24) {
    try {
      job = await db.collection('leads').findOne({ _id: new mongoose.Types.ObjectId(job_id) });
    } catch (error) {
    }
  }
  
  if (!job) {
    job = await db.collection('leads').findOne({ id: job_id });
  }

  if (!job) {
    return res.status(404).json({ detail: 'Job not found' });
  }

  if (job.status !== 'under_review') {
    return res.status(400).json({ 
      detail: 'Job is not under review',
      current_status: job.status 
    });
  }

  const completionData = {
    status: 'completed', 
    completion_date: new Date(),
    approved_by: req.user.user_id,
    approved_at: new Date()
  };

  const updateFilter = job.id ? { id: job.id } : { _id: job._id };
  await db.collection('leads').updateOne(updateFilter, { $set: completionData });

  res.json({
    success: true,
    message: 'Job completion approved successfully',
    status: 'completed'
  });
}));

router.get('/coordinator/:id', verifyPlumberToken, async (req, res) => {
  try {
    const coordinatorId = req.params.id;

    const coordinator = await User.findOne({ _id: coordinatorId, role: 'COORDINATOR' });

    if (!coordinator) {
      return res.status(404).json({ message: 'Coordinator not found' });
    }

    res.status(200).json({
      name: coordinator.name,
      phone: coordinator.phone,
    });
  } catch (error) {
    console.error('Error fetching coordinator details:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});


router.get('/check-deletion-eligibility', verifyPlumberToken, asyncHandler(async (req, res) => {
  const plumberUserId = req.user.user_id.toString();
  
  try {
    const db = mongoose.connection.db;
    
    const incompleteJobs = await db.collection('leads').countDocuments({
      assigned_plumber_id: plumberUserId,
      status: { 
        $in: ['assigned', 'Assigned', 'under_review'] 
      }
    });
    
    const unfulfilledOrders = await Order.countDocuments({
      plumber_id: plumberUserId,
      status: { 
        $in: ['Order-Placed', 'Payment-Completed', 'Dispatched'] 
      }
    });
    
    console.log('Deletion eligibility check:', {
      plumber_id: plumberUserId,
      incompleteJobs,
      unfulfilledOrders
    });
    
    const canDelete = (incompleteJobs === 0 && unfulfilledOrders === 0);
    
    res.json({
      canDelete,
      incompleteJobs,
      unfulfilledOrders
    });
    
  } catch (error) {
    console.error('Error checking deletion eligibility:', error);
    res.status(500).json({ 
      detail: 'Failed to check deletion eligibility',
      error: error.message 
    });
  }
}));

router.put('/delete-account', verifyPlumberToken, asyncHandler(async (req, res) => {
  const plumberUserId = req.user.user_id;
  const { kyc_status } = req.body;
  
  if (kyc_status !== 'deleted') {
    return res.status(400).json({ 
      detail: 'Invalid kyc_status value' 
    });
  }
  
  try {
    const db = mongoose.connection.db;
    
    const incompleteJobs = await db.collection('leads').countDocuments({
      assigned_plumber_id: plumberUserId.toString(),
      status: { 
        $in: ['assigned', 'Assigned', 'under_review'] 
      }
    });
    
    const unfulfilledOrders = await Order.countDocuments({
      plumber_id: plumberUserId,
      status: { 
        $in: ['Order-Placed', 'Payment-Completed', 'Dispatched'] 
      }
    });
    
    if (incompleteJobs > 0 || unfulfilledOrders > 0) {
      return res.status(400).json({
        detail: 'Cannot delete account. Please complete all jobs and orders first.',
        incompleteJobs,
        unfulfilledOrders
      });
    }
    
    const user = await User.findByIdAndUpdate(
      plumberUserId,
      { 
        $set: { 
          kyc_status: 'deleted',
          deleted_at: new Date()
        } 
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ detail: 'Plumber not found' });
    }

    await User.updateMany(
      {
        role: 'COORDINATOR',
        assigned_plumbers: plumberUserId
      },
      {
        $pull: { assigned_plumbers: plumberUserId }
      }
    )
    
    console.log('Account deleted successfully:', {
      user_id: plumberUserId,
      kyc_status: user.kyc_status,
      deleted_at: user.deleted_at
    });
    
    res.json({
      success: true,
      message: 'Account deleted successfully',
      kyc_status: user.kyc_status
    });
    
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ 
      detail: 'Failed to delete account',
      error: error.message 
    });
  }
}));


module.exports = router;