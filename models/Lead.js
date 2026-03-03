const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  client: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      match: [/^[6-9]\d{9}$/, 'Please provide a valid Indian phone number']
    },
    address: {
      type: String,
      required: true
    },
    city: {type: String, required: true},
    district: {type: String, required: true},
    state: {type: String, required: true},
    pincode: {type: String, required: true}
  },
  model_purchased: {
    type: String,
    required: true
  },
  assigned_plumber_id: {
    type: String,
    ref: 'User',
    default: ""
  },
  assigned_on: {
    type: Date
  },
  status: {
    type: String,
    enum: ['not-assigned', 'assigned', 'under_review', 'completed', 'cancelled'],
    default: 'not-assigned'
  },
  lead_type: {
    type: String,
    enum: ['IO', 'SI'],
    default: 'IO'
  },
  install_fee_charged: {
    type: Number,
    min: 0,
    default: 0
  },
  completion_submitted_at: {type: Date, default: null},
  completion_submitted_by: {type: String, default: null},
  completion_images: {
    serial_number_url: {type: String, default: null},
    warranty_card_url: {type: String, default: null},
    installation_url: {type: String, default: null}
  },
  approved_by: {type: String, default: null},
  approved_at: {type: Date, default: null},
  rejected_by: {type: String, default: null},
  rejected_at: {type: Date, default: null},
  rejection_reason: {type: String, default: null},
  cancelled_at: {type: Date, default: null},
  cancelled_by: {type: mongoose.Types.ObjectId},
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  customer_paid: {
    type: Boolean,
    default: false
  },
  plumber_paid: {
    type: Boolean,
    default: false
  }
}, {
  collection: 'leads'
});

// Update the updated_at field before saving
leadSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

leadSchema.pre('validate', async function(next) {
  if (this.isNew && !this._id) {
    const Lead = mongoose.model('Lead', leadSchema);

    const lastLead = await Lead.findOne().sort({ _id: -1 }).lean();
    
    let nextNumber = 1;
    if (lastLead && lastLead._id) {
      const lastNum = parseInt(lastLead._id.replace('INST', ''), 10);
      nextNumber = lastNum + 1;
    }

    this._id = `INST${String(nextNumber).padStart(6, '0')}`;
  }
  next();
});


// Check if lead can be completed
leadSchema.methods.canBeCompleted = function() {
  return ['Assigned', 'assigned'].includes(this.status);
};

// Check if lead is under review
leadSchema.methods.isUnderReview = function() {
  return this.status === 'under_review';
};

// Static method to find by plumber
leadSchema.statics.findByPlumber = function(plumberId) {
  return this.find({ assigned_plumber_id: plumberId, }).sort({ created_at: -1 });
};

// Static method to find by status
leadSchema.statics.findByStatus = function(status) {
  return this.find({ status }).sort({ created_at: -1 });
};

module.exports = mongoose.model('Lead', leadSchema);