const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { default: mongoose } = require('mongoose');

const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ detail: 'Access token is missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const user = await User.findOne({ _id: new mongoose.Types.ObjectId(decoded.user_id) });
    
    if (!user || !user.is_active) {
      return res.status(401).json({ detail: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ detail: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ detail: 'Token expired' });
    }
    return res.status(500).json({ detail: 'Token verification failed' });
  }
};


const verifyPlumberToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ detail: 'Access token is missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const user = await User.findOne({ _id: new mongoose.Types.ObjectId(decoded.user_id), role: 'PLUMBER' });
    
    if (!user || !user.is_active) {
      return res.status(401).json({ detail: 'Invalid plumber token' });
    }

    req.user = {
      user_id: user._id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      kyc_status: user.kyc_status,
      agreement_status: user.agreement_status,
    };
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ detail: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ detail: 'Token expired' });
    }
    return res.status(500).json({ detail: 'Token verification failed' });
  }
};

const verifyAdminToken = async (req, res, next) => {
  try {
    const token = req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ detail: 'Access token is missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const user = await User.findOne({ _id: new mongoose.Types.ObjectId(decoded.id), role: 'ADMIN' });

    if (!user || !user.is_active) {
      return res.status(401).json({ detail: 'Invalid admin token' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error in verifyAdminToken:", error); 
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ detail: 'Invalid admin token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ detail: 'Admin token expired' });
    }
    return res.status(500).json({ detail: 'Admin token verification failed' });
  }
};

const verifyCoordinateToken = async (req, res, next) => {
  try {
    const token = req.cookies.access_token;
    if(!token){
      return res.status(401).json({details: 'Access token is missing'});
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const user = await User.findOne({_id: new mongoose.Types.ObjectId(decoded.id), role: 'COORDINATOR'});

    if (!user || !user.is_active) {
      return res.status(401).json({detail: 'Invalid Co-ordinator token'});
    }
    req.user = user;
    next();
  } catch (error){
    console.error("Error in verifyCoordinatorToken: ", error);
    if (error.name === 'JsonWebTokenError'){
      return res.status(401).json({detail: 'Co-Ordinator token expired.'})
    }
    return res.status(500).json({detail: 'Co-Ordinator token Verification Failed.'})
  }
};

const isPlumber = (req, res, next) => {
  if (req.user.role !== 'PLUMBER') {
    return res.status(403).json({ detail: 'Access denied. Plumber role required.' });
  }
  next();
};
 
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: 'Access denied. Admin role required.' });
  }
  next();
};

const generateToken = (user) => {
  return jwt.sign(    
    { user_id: user._id, role: user.role },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const generateAdminToken = (user) => {
  return jwt.sign(    
    { id: user._id, role: user.role },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const generateAdminRefreshToken = (user) => {
  return jwt.sign(    
    { id: user._id, role: user.role },
    process.env.JWT_REFRESH_SECRET_KEY,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
};


module.exports = {
  verifyToken,
  verifyPlumberToken,
  verifyAdminToken,
  verifyCoordinateToken,
  isPlumber,
  isAdmin,
  generateToken,
  generateAdminToken,
  generateAdminRefreshToken
};