var mongoose = require('mongoose');

var stockDataSchema = new mongoose.Schema({
  stock:  {type: String, required: true},
  price: Number,
  likes: Number,
  iplog: [String]
});

module.exports = mongoose.model("StockData", stockDataSchema);