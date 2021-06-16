"use strict";

const webrtc = require("wrtc");
const { RTCVideoSink, RTCVideoSource } = require("wrtc").nonstandard;
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const http = require("http");
const https = require("https");
const WebSocket = require("ws");
const express = require("express");
const app = express();
app.use(express.static("public"));
const WebSocketServer = WebSocket.Server;
let temp;
let serverOptions = {
  listenPort: 5000,
  useHttps: true,
  httpsCertFile: "./cert.pem",
  httpsKeyFile: "./cert.key",
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
    // wss.broadcast(JSON.stringify(payload));
    wss.clients.forEach(function each(client) {
      console.log("===:", client.id)
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });
  }
}

function createPeer() {
  let peer = new webrtc.RTCPeerConnection({
    // iceServers: [
    //   { urls: "stun:stun.stunprotocol.org:3478" },
    //   { urls: "stun:stun.l.google.com:19302" },
    // ],
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
// client.connect("wss://localhost:8080/call", "echo-protocol");
//
// uncomment this
// client.on("connect", function (connection) {
// connection.on("message", function (data) {
//   console.log("------------data-----------:", data);
// });
wss.on("connection", function (ws) {
  let peerId = uuidv4();
  ws.id = peerId;
  console.log("---------connection---------------", ws.id);

  ws.on("close", (event) => {
    peers.delete(ws.id);
    consumers.delete(ws.id);

    wss.broadcast(
      JSON.stringify({
        type: "user_left",
        id: ws.id,
      })
    );
  });

  ws.send(JSON.stringify({ type: "welcome", id: peerId }));
  ws.on("message", async function (message) {
    const body = JSON.parse(message);
    switch (body.type) {
      case "connect":
        // console.log("---------message connect---------------");
        peers.set(body.uqid, { socket: ws });
        // console.log("---------message connect---------------: ", peers);
        const peer = createPeer();

        peers.get(body.uqid).username = body.username;
        peers.get(body.uqid).peer = peer;
        peer.ontrack = (e) => {
          handleTrackEvent(e, body.uqid, ws);
        };
        const desc = new webrtc.RTCSessionDescription(body.sdp);
        await peer.setRemoteDescription(desc);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        console.log("-------: ", body.sdp)

        const payload = {
          type: "answer",
          sdp: peer.localDescription,
        };
        ws.send(JSON.stringify(payload));
        //
        // async handleIceCandidate({ candidate }) {
        //     if (candidate && candidate.candidate && candidate.candidate.length > 0) {
        //         const payload = {
        //             type: 'ice',
        //             ice: candidate,
        //             uqid: this.localUUID
        //         }
        //         this.connection.send(JSON.stringify(payload));
        //     }
        // }
        // const localPeer = createPeer();
        // var sendChannel = localPeer.createDataChannel("sendChannel");
        // // sendChannel.onopen = onSendChannelStateChange;
        // // sendChannel.onclose = onSendChannelStateChange;
        // sendChannel.onopen = function(event) {
        //   var readyState = sendChannel.readyState;
        //   console.log(readyState)
        //   if (readyState == "open") {
        //     sendChannel.send("Hello");
        //   }
        // };

        // this.localStream.getTracks().forEach(track => localPeer.addTrack(track, this.localStream));

        //   const offer = await localPeer.createOffer();
        //   console.log("--------offer:", offer);
        //   await localPeer.setLocalDescription(offer);
        //   console.log("--------localPeer:", localPeer);
        //   localPeer.onicecandidate = (candidate) => {
        //     console.log("1111");
        //     if (
        //       candidate &&
        //       candidate.candidate &&
        //       candidate.candidate.length > 0
        //     ) {
        //       console.log("222");
        //       connection.send(
        //         JSON.stringify({
        //           id: "onIceCandidate",
        //           candidate: candidate,
        //         })
        //       );
        //     }
        //   };

        //   connection.send(
        //     JSON.stringify({
        //       id: "client",
        //       sdpOffer: localPeer.localDescription,
        //     })
        //   );

        break;
      case "getPeers":
        // console.log("---------message getPeers---------------");
        let uuid = body.uqid;
        const list = [];
        peers.forEach((peer, key) => {
          if (key != uuid) {
            const peerInfo = {
              id: key,
              username: peer.username,
            };
            list.push(peerInfo);
          }
        });

        const peersPayload = {
          type: "peers",
          peers: list,
        };

        ws.send(JSON.stringify(peersPayload));
        break;
      case "ice":
        const user = peers.get(body.uqid);
        if (!temp) temp = body.ice;
        if (user.peer) {
          user.peer
            .addIceCandidate(new webrtc.RTCIceCandidate(body.ice))
            .catch((e) => console.log(e));
        }

        break;
      case "consume":
        try {
          let { id, sdp, consumerId } = body;
          console.log("----sdp consume---: ", sdp)
          const remoteUser = peers.get(id);
          // console.log("---------message consume--remoteUser-------------:", remoteUser.socket.id);
          const newPeer = createPeer();
          consumers.set(consumerId, newPeer);
          const _desc = new webrtc.RTCSessionDescription(sdp);
          await consumers.get(consumerId).setRemoteDescription(_desc);

          remoteUser.stream.getTracks().forEach((track) => {
            // console.log("----------------------------------------------------------------: ",consumers.get(consumerId))
            consumers.get(consumerId).addTrack(track, remoteUser.stream);
            // console.log("11111111111ok")
            // ws.send(JSON.stringify({
            //   type: "fwstream",
            //   stream: remoteUser.stream
            // }));
            // console.log("-----------remoteUser.stream-------: ", remoteUser.stream)
            // wss.broadcast(JSON.stringify({
            //   type: "fwstream",
            //   stream: remoteUser.stream
            // }));
            // wss.clients.forEach(function each(client) {
            //   if (client !== ws && client.readyState === WebSocket.OPEN) {
            //     client.send(JSON.stringify({
            //       type: "fwstream",
            //       stream: remoteUser.stream
            //     }));
            //   }
            // });

            // console.log("22222222222ok")
          });
          const _answer = await consumers.get(consumerId).createAnswer();
          await consumers.get(consumerId).setLocalDescription(_answer);
          // console.log("++++++++++++++++++++++++++++++++++++++++++++")

          const _payload = {
            type: "consume",
            sdp: consumers.get(consumerId).localDescription,
            username: remoteUser.username,
            id,
            consumerId,
          };
          // console.log("-ice:", temp)
          ws.send(JSON.stringify(_payload));
          // console.log("---------------------------: ", peers);
          // connection.send(
          //   JSON.stringify({
          //     id: "abc",
          //     sdpOffer: consumers.get(consumerId).localDescription.sdp,
          //     candidate: temp
          //   })
          // );
          //
          const source = new RTCVideoSource();
          const track = source.createTrack();
          const transceiver = newPeer.addTransceiver(track);
          const sink = new RTCVideoSink(transceiver.receiver.track);
          let lastFrame = null;

          function onFrame({ frame }) {
            console.log("--------------frame: ", frame);
            lastFrame = frame;
          }
          // console.log("--sink: ", sink.addEventListener("frame", onFrame));

          //
        } catch (error) {
          console.log(error);
        }

        break;
      case "consumer_ice":
        if (consumers.has(body.consumerId)) {
          consumers
            .get(body.consumerId)
            .addIceCandidate(new webrtc.RTCIceCandidate(body.ice))
            .catch((e) => console.log(e));
        }
        break;
      // default:
      //   console.log("22222222222");
      //   wss.broadcast(message);
    }
  });

  ws.on("error", () => ws.terminate());
});
// });

wss.broadcast = function (data) {
  // console.log("---------wss.broadcast---------------");
  peers.forEach(function (peer) {
    // console.log("---------wss.broadcast---------------: ", peer.socket.id);
    if (peer.socket.readyState === WebSocket.OPEN) {
      peer.socket.send(data);
    }
  });
};

console.log("Server running.");
