var redis = require('redis');
var publisher = redis.createClient();
let message = {
    id: 1,
    ok: "ok"
}
publisher.publish('notification', JSON.stringify(message), function(){
//  process.exit(0);
});