let mcu = {};

mcu.main = (media_stream) => {
  // console.log(media_stream)
  const webrtc = require("wrtc");
  const { RTCVideoSink, RTCVideoSource } = require("wrtc").nonstandard;
  const { v4: uuidv4 } = require("uuid");
  const fs = require("fs");
  const http = require("http");
  const https = require("https");
  const WebSocket = require("ws");
  const express = require("express");
  const app = express();
  let sendChannel;
  let receiveChannel;
  app.use(express.static("public"));

  const redis = require("redis");
  //   const clientRedis = redis.createClient();

  //   let redis_promise = (key) =>
  // new Promise((resolve, reject) => {
  //   clientRedis.get(key, function (err, reply) {
  //     // reply is null when the key is missing
  //     if (err) reject(err);
  //     else resolve(reply);
  //   });
  // });

  const WebSocketServer = WebSocket.Server;
  let temp;
  let serverOptions = {
    listenPort: 5002,
    useHttps: true,
    httpsCertFile: "/etc/nginx/ssl/server.crt",
    httpsKeyFile: "/etc/nginx/ssl/server.key",
  };

  let sslOptions = {};
  if (serverOptions.useHttps) {
    sslOptions.key = fs.readFileSync(serverOptions.httpsKeyFile).toString();
    sslOptions.cert = fs.readFileSync(serverOptions.httpsCertFile).toString();
  }

  let webServer = null;
  if (serverOptions.useHttps) {
    webServer = https.createServer(sslOptions, app);
    webServer.listen(serverOptions.listenPort);
  } else {
    webServer = http.createServer(app);
    webServer.listen(serverOptions.listenPort);
  }
  let peers = new Map();
  let consumers = new Map();

  function handleTrackEvent(e, peer, ws) {
    if (e.streams && e.streams[0]) {
      peers.get(peer).stream = e.streams[0];

      const payload = {
        type: "newProducer",
        id: peer,
        username: peers.get(peer).username,
      };
      wss.broadcast(JSON.stringify(payload));
    }
  }

  // getMedia()
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
  const wss = new WebSocketServer({ server: webServer });
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

  client.on("connect", async function (connection) {
    var newPeer = createPeer();
    // var localStream = await redis_promise("stream1");

    var localStream = media_stream;
    localStream
      .getTracks()
      .forEach((track) => newPeer.addTrack(track, localStream));

    var offer = await newPeer.createOffer();
    newPeer.setLocalDescription(offer);
    connection.send(
      JSON.stringify({
        id: "client",
        sdpOffer: offer.sdp,
      })
    );

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

    connection.on("message", function (data) {
      var val = JSON.parse(data.utf8Data);
      // console.log(val)
      if (val.id === "response" && val.response === "accepted") {
        var test = {
          type: "answer",
          sdp: val.sdpAnswer
        }
        const desc = new webrtc.RTCSessionDescription(test);
        // console.log(desc)
        newPeer.setRemoteDescription(desc);
        newPeer.ontrack = (e) => {
          console.log("---traccccccccccccccccc: ", e.streams[0].active)
        };
      }
      // console.log(val.id)
      if(val.id === "iceCandidate"){
        console.log(val.candidate)
        var test = new webrtc.RTCIceCandidate(val.candidate)
        console.log(test)
        newPeer.addIceCandidate(test)
      }

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
    });
  });
};

module.exports = mcu;
