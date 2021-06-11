let mcu = {};


// mcu.main = (media_stream) => new Promise((resolve, reject) => {
mcu.main = (media_stream) => {
  // console.log(media_stream)
  const webrtc = require("wrtc");
  const express = require("express");
  const app = express();
  const sfu = require('./bridge_sfu copy')
  app.use(express.static("public"));
  let count = 1
  // var redis = require('redis');
  // var subscriber = redis.createClient();

  // subscriber.subscribe('bridge');
  // subscriber.on('message', function (channel, message) {
  //   let media_stream = JSON.parse(message)
  //   console.log("----------------media_stream-------:", media_stream)
  //   console.log("----------------media_stream-0------:", message)
  //   console.log("----------------media_stream-1------:", media_stream.id)
    function createPeer() {
      let peer = new webrtc.RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.stunprotocol.org:3478" },
          { urls: "stun:stun.l.google.com:19302" },
        ],
      });

      return peer;
    }

    // Create a server for handling websocket calls
    // const wss = new WebSocketServer({ server: webServer });
    //
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    var WebSocketClient = require("websocket").client;
    var client = new WebSocketClient();

    client.on("connectFailed", function (error) {
      console.log("Connect Error: " + error.toString());
    });
    // uncomment this
    client.connect("wss://localhost:8080/call", "echo-protocol");
    //
    // uncomment this
    var candidate;
    var newPeer = createPeer();
    client.on("connect", async function (connection) {
      // var localStream = await redis_promise("stream1");
      var localStream = media_stream;
      localStream
        .getTracks()
        .forEach((track) => newPeer.addTrack(track, localStream));

      var offer = await newPeer.createOffer();
      newPeer.setLocalDescription(offer);
      setTimeout(() => {
        connection.send(
          JSON.stringify({
            id: "client",
            sdpOffer: offer.sdp,
          })
        );
      }, 2000);
      newPeer.onicecandidate = (e) => {
        candidate = e.candidate;
        // console.log(e.candidate);
        connection.send(
          JSON.stringify({
            id: "onIceCandidate",
            candidate: candidate,
          })
        );
      };

      //    newPeer.onicecandidate = (e) => console.log(e.candidate);
      const webSocketCallback = async (data) => {
        var val = JSON.parse(data.utf8Data);
        // console.log(val)
        if (val.id === "response" && val.response === "accepted") {
          var test = {
            type: "answer",
            sdp: val.sdpAnswer,
          };
          const desc = new webrtc.RTCSessionDescription(test);
          // console.log(desc)
          newPeer.setRemoteDescription(desc);
          newPeer.ontrack = (e) => {
            if(count == 1){
              console.log("---traccccccccccccccccc: ", e.streams[0])
              sfu.main(e.streams[0])
              count = 0
            }
          };
        }
        // console.log(val.id)
        if (val.id === "iceCandidate") {
          try {
            // console.log(val.candidate)
            var test = new webrtc.RTCIceCandidate(val.candidate);
            // console.log(test)
            // console.log("--ice:", test);
            await newPeer.addIceCandidate(test);
            // resolve("abc")

          } catch (err) {
            console.log("11111", err);
            // reject(err)
          }
        }
        // if (val.id === "endCandidate") {
        //   resolve("abc")
        // }
      };
      connection.on("message", (data) => webSocketCallback(data))
      // connection.on("message", async function (data) {
      // newPeer.onicecandidate = (e) => {
      //   candidate = e.candidate;
      //   // console.log(e.candidate);
      //   connection.send(
      //     JSON.stringify({
      //       id: "onIceCandidate",
      //       candidate: candidate,
      //     })
      //   );
      // };
      // console.log('-----------------------------')
      // console.log("-----------------------------",val.id)
      // if(val.id === 'iceCandidate'){
      //   console.log(val)
      //   newPeer.addIceCandidate(val.candidate)
      // }
      // });
    });

  // });


};

mcu.main()

module.exports = mcu;
