const User = require('./models/User');

const checkCoordinatorWorkingHours = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.canWorkNow()) {
      const { start, end } = user.working_hours;
      return res.status(403).json({ 
        error: 'Access denied',
        message: `You can only work between ${start}:00 and ${end}:00`,
        working_hours: { start, end },
        should_logout: true
      });
    }

    req.userDoc = user; 
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

const checkCoordinatorLoginTime = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const user = await User.findByPhone(phone);
    
    if (!user) {
      return next();
    }

    if (user.role === 'COORDINATOR' && !user.canWorkNow()) {
      const { start, end } = user.working_hours;
      return res.status(403).json({ 
        error: 'Login denied',
        message: `Coordinators can only login between ${start}:00 and ${end}:00`,
        working_hours: { start, end }
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

module.exports = {
  checkCoordinatorWorkingHours,
  checkCoordinatorLoginTime
};