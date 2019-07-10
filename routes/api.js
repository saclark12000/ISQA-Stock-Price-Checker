/*
*
*
*       Complete the API routing below
*
*
*/

'use strict';

var expect = require('chai').expect;

var StockData = require('../models/stockData.js')

var https = require('https');
var get_ip = require('ipware')().get_ip;
var async = require("async");

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(function (req, res){
      //console.log(req.query)
      // Stock array builder
      var stock = req.query.stock
      if (!Array.isArray(stock)){
        stock = [ stock.toUpperCase() ]
      } else {
        stock = [ stock[0].toUpperCase(), stock[1].toUpperCase() ]
      }
      
      // Client IP
      var ip_info = get_ip(req);
      var like = Boolean(req.query.like)
      var quote = '';
      var price = '';
      var returnObj = {}
      var currStockData = {};
    
    async.waterfall([
      function(mainCB) {
        if(stock.length > 1){
          returnObj = {"stockData":[]}
        }
          mainCB(null)
      },
      function(mainCB) {
        async.eachOfSeries(stock, function(stockSym, i, eachCB){
          
           https.get(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${stockSym}&interval=5min&apikey=${process.env.AK}`, (resp) => {
               //console.log(stockSym) 
               let data = '';

                // A chunk of data has been recieved.
                resp.on('data', (chunk) => {
                  data += chunk;
                });

                // The whole response has been received.
                resp.on('end', () => {
                  // console.log(JSON.parse(data));
                  // quote = JSON.parse(data)['Global Quote']
                  price = JSON.parse(data)['Global Quote']["05. price"]

                  // Build stock object for current stock symbol to pass into db
                  currStockData = {"stock":stockSym, "price":price}
                  like ? currStockData.likes = 1 : currStockData.likes = 0;
                  like ? currStockData.iplog = [ip_info.clientIp] : currStockData.iplog = [];
                  //console.log('currStockData - ', currStockData)
                  
                  // Look up current stock in database
                  async.waterfall([
                    function(dbCB){
                      StockData.findOne({stock:stockSym},(err, foundStock) => {
                        if (foundStock === null){
                          // Create stock in database if it's not found
                          //console.log('Creating stock for : ', currStockData)
                          StockData.create(currStockData, (err, data)=>{
                            err ? console.log(err) : null;
                            dbCB();
                          });
                        } else {
                          // Update stock in database if it's found
                          //console.log('Updating stock for : ', currStockData)
                          // if the user likes the stock and their ip is not already in db iplog, add likes and ip to log
                          if ( currStockData.likes && !Boolean(foundStock.iplog.find((ip) => { return Boolean(ip == currStockData.iplog[0])})) ){
                            foundStock.likes += 1;
                            foundStock.iplog.push(currStockData.iplog[0]);
                          } 
                          // update db price to match curr stock price and save all changes
                            foundStock.price = currStockData.price
                            foundStock.save().then( ()=>{ dbCB() });
                        }
                      })
                    },
                    function(dbCB){
                      // Get updated/created stock  
                      StockData.findOne({stock:stockSym},(err, foundStock) => {
                      // Adjusting likes, removing iplog and then putting currStockData into the returnObj
                        currStockData.likes = foundStock.likes
                        delete currStockData.iplog
                        
                        if (stock.length === 1){
                          returnObj = {"stockData": currStockData}
                          dbCB();
                        } else {
                          returnObj.stockData.push(currStockData)
                          if(i === 1){
                            async.waterfall([
                              function(likesCB){
                                returnObj.stockData[0].rel_likes = returnObj.stockData[0].likes - returnObj.stockData[1].likes;
                                returnObj.stockData[1].rel_likes = returnObj.stockData[1].likes - returnObj.stockData[0].likes;
                                likesCB(null);
                              },
                              function(likesCB){
                                delete returnObj.stockData[0].likes;
                                delete returnObj.stockData[1].likes;
                                likesCB(null);
                              }
                            ], function(err, result){ dbCB() })
                          } else {
                            dbCB();
                          }
                        } 
                      })
                    }
                  ], function(err, result){ eachCB(); })
                  
                })
           })
          }, function(){ mainCB(null, returnObj) })
      }
      ], function (err, result){
      err ? console.log(err) : null
      //console.log(result)
      res.json(result)
    })
  });
};