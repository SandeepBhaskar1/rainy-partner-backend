const express = require('express');
const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const getProducts = async () => {
  const db = mongoose.connection.db;
  const products = await db.collection('products').find({}).toArray();
  return products;
};

router.get('/products', asyncHandler(async (req, res) => {
  const products = await getProducts();
  res.json(products.map(product => ({
    code: product.code,
    name: product.name,
    short_desc: product.short_desc,
    specs: product.specs,
    mrp: product.mrp,
    image: product.image
  })));
}));

router.post('/products/refresh', asyncHandler(async (req, res) => {
  const db = mongoose.connection.db;
  
  await db.collection('products').deleteMany({});
  await db.collection('products').insertMany(defaultProducts);

  res.json({
    message: 'Products refreshed successfully',
    count: defaultProducts.length
  });
}));

// Get system configuration
router.get('/config', asyncHandler(async (req, res) => {
  const db = mongoose.connection.db;
  const config = await db.collection('config').findOne({ id: 'system_config' });
  
  if (!config) {
    // Return default config
    const defaultConfig = {
      id: 'system_config',
      install_fee_default: 500,
      io_earning_per_job: 300, 
      si_earning_per_job: 800
    };
    res.json(defaultConfig);
  } else {
    res.json(config);
  }
}));


router.get('/delete-account-request', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Account Deletion - Rainy Partner</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .contact { background: #e3f2fd; padding: 15px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>Account Deletion Request - Rainy Partner</h1>
      
      <div class="info">
        <h2>How to Delete Your Account</h2>
        <p>To delete your Rainy Partner account and associated data, please follow these steps:</p>
        <ol>
          <li>Open the Rainy Partner app</li>
          <li>Go to Profile section</li>
          <li>Click on the settings icon on the top right side beside logut button, and click on Delete account button."</li>
          <li>Follow the on-screen instructions to complete the deletion process</li>
          <li>If the user have uncompleted jobs or unfulfilled orders, please complete them first before requesting deletion.</li>
          <li>Alternatively, you can send us an email as described in the profile page of the app.</li>
          <li>Confirm your deletion request</li>
        </ol>
      </div>

      <div class="contact">
        <h3>Alternative Method</h3>
        <p>You can also email us directly at:</p>
        <p><strong>Email:</strong> sales@rainyfilters.com</p>
        <p><strong>Subject:</strong> Account Deletion Request</p>
        <p><strong>Include:</strong> Your registered phone number, name and Plumber ID</p>
      </div>

      <div class="info">
        <h3>What Data Gets Deleted</h3>
        <p>When you delete your account, the following data will be permanently removed:</p>
        <ul>
          <li>Personal information (name, phone, email, address)</li>
          <li>Profile photos and documents</li>
          <li>KYC information</li>
        </ul>
        
        <h3>Data Retention</h3>
        <li>Order History and Installation details for company internal use.</li>
        <p>Some data may be retained for up to 90 days for legal and security purposes, after which it will be permanently deleted.</p>
      </div>

      <p style="color: #666; font-size: 14px; margin-top: 40px;">
        © 2025 Rainy Partner. All rights reserved.
      </p>
    </body>
    </html>
  `);
});

module.exports = router;