const mongoose = require('mongoose');

const productsSchema = new mongoose.Schema({

    code : {
        type: String,
        required: true
    },

    name: {
        type: String,
        required: true
    },

    mrp: {
        type: Number,
        required: true
    }, 

    short_desc: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('Products', productsSchema);