let mcu = {};


mcu.main = (media_stream, sfuLocalPeer, emitter, localUUID) => new Promise((resolve, reject) => {
  // console.log('local', localUUID)
  // mcu.main = (media_stream) => {
  // console.log("------------process.argv--------------:", )
  // console.log("---------media_stream----------------", media_stream)
  // console.log("---------media_stream-1---------------", media_stream.id)
  const webrtc = require("wrtc");
  const express = require("express");
  const app = express();
  var redis = require('redis');
  var publisher = redis.createClient();
  // var sessionId;

  let redis_promise_get = (key) => new Promise((resolve, reject) => {
    publisher.get(key, function (err, reply) {
      // reply is null when the key is missing
      if (err) reject(err)
      else resolve(reply)
    });
  })

  let redis_promise_set = (key, value) => new Promise((resolve, reject) => {
    publisher.set(key, value, function (err, reply) {
      // reply is null when the key is missing
      if (err) reject(err)
      else resolve(reply)
    });
  })
  // const sfu = require('./bridge_sfu_sub')
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
    console.log("------------------------MCU CONNECT SOCKET OK > START SENDING OFFER----------")
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

    emitter.on(`${localUUID}`, () => {
      // console.log("sfu_outtttttttt", localUUID)
      connection.send(
        JSON.stringify({
          id: "stop_sfu",
          sessionId: sessionId
        })
      )
    })

    //    newPeer.onicecandidate = (e) => console.log(e.candidate);
    const webSocketCallback = async (data) => {
      var val = JSON.parse(data.utf8Data);
      // console.log(val)
      let setSDP_OK = false
      if (val.id === "response" && val.response === "accepted") {
        sessionId = val.sessionId
        console.log("sessionId", sessionId)
        var test = {
          type: "answer",
          sdp: val.sdpAnswer,
        };
        const desc = new webrtc.RTCSessionDescription(test);
        // console.log(desc)
        newPeer.setRemoteDescription(desc);
        setSDP_OK = true
        newPeer.ontrack = async (e) => {
          if (count == 1) {
            // console.log("---traccccccccccccccccc: ", e.streams[0]?.id)
            console.log("------------------ON TRACK IN BRIDGE MCU > START CALLING SFU--------------")
            //sfu.main(e.streams[0])
            count = 0;
            let call_mcu = await redis_promise_get("call_mcu")
            console.log("----------------REDISSSSS----:", call_mcu)
            if (call_mcu == "false") {
              console.log("------in-------------asdsadsadsadsa---------123213")
              e.streams[0].getTracks().forEach(track => sfuLocalPeer.addTrack(track, e.streams[0]));
              await redis_promise_set("call_mcu", "true")
            }
          }
        };
      }
      // console.log(val.id)
      if (val.id === "iceCandidate" && setSDP_OK) {
        try {
          // console.log(val.candidate)
          var test = new webrtc.RTCIceCandidate(val.candidate);
          // console.log(test)
          // console.log("--ice:", test);
          await newPeer.addIceCandidate(test);
          resolve("abc")

        } catch (err) {
          console.log("11111", err);
          reject(err)
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
});
// }

// mcu.main(process.argv.slice(2)[0])

module.exports = mcu;
