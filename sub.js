var redis = require('redis');
var subscriber = redis.createClient();
subscriber.on('message', function (channel, message) {
 console.log(JSON.parse(message))
});
subscriber.subscribe('notification');