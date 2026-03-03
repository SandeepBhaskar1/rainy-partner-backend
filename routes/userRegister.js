const express = require('express');
const router = express.Router();
const User = require('../models/User');

function parseServiceAreaPins(input) {
  if (!input) return [];
  const str = String(input).trim();
  const matches = str.match(/\d{6}/g);
  return matches ? [...new Set(matches)] : [];
}

router.post('/', async (req, res) => {

  try {
    const {
      phone,
      name,
      address,
      city,
      district,
      state,
      pin,
      service_area_pin,
      experience,
      tools,
      aadhaar_number,
      plumber_license_number,
      profile,
      aadhaar_front,
      aadhaar_back,
      license_front,
      license_back, } = req.body;

    if (!name || !address || !city || !pin || !district || !state || !service_area_pin || !experience || !tools || !aadhaar_number  || !profile || !aadhaar_front || !aadhaar_back ) {
      return res.status(400).json({ message: 'All fields are required.' })
    }

    if (plumber_license_number && (!license_front || !license_back)) {
      return res.status(400).json({ message: 'Both license front and back images are required when license number is provided.' });
    }

    if (aadhaar_number.length !== 12 || !/^\d{12}$/.test(aadhaar_number)) {
      return res.status(400).json({ message: 'Aadhaar number must be a valid 12-digit number.' });
    }

    if ((license_front || license_back) && !plumber_license_number) {
      return res.status(400).json({ message: 'Plumber license number is required when license images are provided.' });
    }

        const parsedServiceAreaPins = parseServiceAreaPins(service_area_pin);
    
    if (parsedServiceAreaPins.length === 0) {
      return res.status(400).json({ message: 'At least one valid 6-digit PIN code is required for service area.' });
    }

    const updateUser = await User.findOneAndUpdate(
      { phone },
      {
        $set: {
        name,
        address: {
          address,
          city,
          district,
          state,
          pin,
        },
        service_area_pin: parsedServiceAreaPins,
        experience,
        tools,
        aadhaar_number,
        plumber_license_number,
        profile,
        aadhaar_front,
        aadhaar_back,
        license_front,
        license_back,
        needs_onboarding: false,
        kyc_status: 'pending',
        updated_at: new Date(),
      },
    },
    {new: true}
    );

    if(!updateUser){
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(201).json({ message: 'Onboarding completed successfully.', user: updateUser });
  } catch (error) {
    console.error('Onboarding error:', error.message, error.stack);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }}
);


router.get('/:_id', async (req, res) => {
  try {
    const user = await User.findById( req.params._id );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error('Fetch user error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const response = await User.find();
    res.status(200).json({response})
  } catch (error) {
    console.error('Error fetching users', error);
  }
});

module.exports = router;