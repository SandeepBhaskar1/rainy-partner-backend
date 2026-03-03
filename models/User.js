const mongoose = require('mongoose');
const userCounter = require('./userCounter');

const userSchema = new mongoose.Schema({
  user_id: {
    type: String,
    unique: true,
    required: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please provide a valid Indian phone number']
  },
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  role: {
    type: String,
    enum: ['PLUMBER', 'ADMIN', 'COORDINATOR'],
    required: true,
    default: 'PLUMBER'
  },
  password_hash: {
    type: String
  },
  needs_onboarding: {
    type: Boolean,
    default: true
  },
  agreement_status: {
    type: Boolean,
    default: false
  },
  kyc_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'deleted'],
    default: 'pending'
  },
  coordinator_id: {
    type: String,
    ref: 'User'
  },
  assigned_plumbers: [{
    type: String,
    ref: 'User'
  }],
  address: {
    address: { type: String },
    city: { type: String },
    district: { type: String },
    state: { type: String },
    pin: { type: String }
  },
  service_area_pin : [{type: String}],
  experience: { type: Number },
  tools: [{ type: String }],
  profile: { type: String },
  aadhaar_front: { type: String },
  aadhaar_back: { type: String },
  aadhaar_number: { type: String },
  plumber_license_number: { type: String },
  license_front: { type: String },
  license_back: { type: String },
  gstInfo: { type: String },
  trust: {
    type: Number,
    default: 100
  },
  working_hours: {
    start: {
      type: Number,
      default: 9,
      min: 0,
      max: 23
    },
    end: {
      type: Number,
      default: 19,
      min: 0,
      max: 23
    }
  },
  approvedAt: {
    type: Date
  },
  created_at: {
    type: Date,
    default: Date.now()
  },
  updated_at: {
    type: Date,
    default: Date.now()
  },
  deleted_at: { type: Date },
  deleted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  last_login: Date,
  is_active: {
    type: Boolean,
    default: true
  },
  resetOtp: {type: Number},
  otpExpiry: {type: Date}
});

userSchema.pre("validate", async function (next) {
  if (!this.isNew) {
    this.updated_at = new Date();
    return next();
  }

  try {
    // use the imported Counter model directly
    const counter = await userCounter.findOneAndUpdate(
      { role: this.role },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    let prefix = "";
    let paddedSeq = "";

    switch (this.role) {
      case "ADMIN":
        prefix = "ADM";
        paddedSeq = counter.seq.toString().padStart(2, "0"); 
        break;
      case "COORDINATOR":
        prefix = "CRD";
        paddedSeq = counter.seq.toString().padStart(3, "0"); 
        break;
      case "PLUMBER":
        prefix = "PLB";
        paddedSeq = counter.seq.toString().padStart(6, "0"); 
        break;
      default:
        prefix = "USR";
        paddedSeq = counter.seq.toString().padStart(6, "0");
    }

    this.user_id = `${prefix}${paddedSeq}`;
    this.updated_at = new Date();
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.needsOnboarding = function() {
  return this.needs_onboarding || this.kyc_status === 'pending';
};


userSchema.methods.canWorkNow = function() {
  if (this.role !== 'COORDINATOR') {
    return true; 
  }
  
  const now = new Date();
  const currentHour = now.getHours();
  
  return currentHour >= this.working_hours.start && currentHour < this.working_hours.end;
};

userSchema.methods.canApproveKYC = function() {
  return this.role === 'ADMIN';
};

userSchema.methods.canCreateCoordinator = function() {
  return this.role === 'ADMIN';
};

userSchema.methods.getAccessiblePlumbers = async function() {
  if (this.role === 'ADMIN') {
    return await mongoose.model('User').find({ role: 'PLUMBER' });
  } else if (this.role === 'COORDINATOR') {
    return await mongoose.model('User').find({
      _id: { $in: this.assigned_plumbers },
      role: 'PLUMBER'
    });
  }
  return [];
};

userSchema.methods.getProfile = function() {
  return {
    id: this._id,
    user_id: this.user_id,
    name: this.name,
    phone: this.phone,
    email: this.email,
    role: this.role,
    kyc_status: this.kyc_status,
    address: this.address,
    experience: this.experience,
    aadhaar_number: this.aadhaar_number,
    aadhaar_front: this.aadhaar_front,
    aadhaar_back: this.aadhaar_back,
    plumber_license_number: this.plumber_license_number,
    license_front: this.license_front,
    license_back: this.license_back,
    coordinator_id: this.coordinator_id,
    tools: this.tools,
    service_area_pin: this.service_area_pin,
    profile: this.profile,
    photo_url: this.photo_url,
    trust: this.trust,
    needs_onboarding: this.needs_onboarding,
    created_at: this.created_at,
  }

  if (this.role === 'COORDINATOR') {
    profile.working_hours = this.working_hours;
    profile.assigned_plumbers = this.assigned_plumbers;
  }
};

userSchema.statics.findByPhone = function(phone) {
  return this.findOne({ phone });
};

userSchema.statics.findByUserId = function(user_id) {
  return this.findOne({ user_id });
}

userSchema.statics.findPlumbers = function(filter = {}) {
  return this.find({ ...filter, role: 'PLUMBER' });
};

userSchema.statics.findAdmins = function(filter = {}) {
  return this.find({ ...filter, role: 'ADMIN' });
};

userSchema.statics.findCoordinators = function(filter = {}) {
  return this.find({ ...filter, role: 'COORDINATOR' });
};

userSchema.statics.findAccessiblePlumbers = async function(userId) {
  const user = await this.findById(userId);
  if (!user) return [];
  return await user.getAccessiblePlumbers();
};

module.exports = mongoose.model('User', userSchema);