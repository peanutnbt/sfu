let sfu = {};

sfu.main = (media_stream) => {
  const webrtc = require("wrtc");

  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  // let mcu = require("./bridge_mcu");
  let count = 0;
  //
  // var redis = require('redis');
  // var publisher = redis.createClient();

  //
  var WebSocketClient_SUB = require("websocket").client;
  var client_sub = new WebSocketClient_SUB();

  client_sub.on("connectFailed", function (error) {
    console.log("Connect Error: " + error.toString());
  });
  client_sub.connect("wss://localhost:5000", "echo-protocol");

  let Bridge = {
    localUUID: null,
    localPeer: null,
    clients: new Map(),
    consumers: new Map(),
    localStream: null,
    connection: null,
    streams: new Map(),
  };
  uuidv4 = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        var r = (Math.random() * 16) | 0,
          v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  };
  handleAnswer = ({ sdp }) => {
    console.log("------------------SFU SUB GOT ANSWER-------------------");
    const desc = new webrtc.RTCSessionDescription(sdp);
    Bridge.localPeer?.setRemoteDescription(desc).catch((e) => console.log(e));
  };
  handleConsumerIceCandidate = (e, id, consumerId) => {
    //   console.log("---send consumer_ice");
    const { candidate } = e;
    if (candidate && candidate.candidate && candidate.candidate.length > 0) {
      const payload = {
        type: "consumer_ice",
        ice: candidate,
        uqid: id,
        consumerId,
      };
      Bridge.connection?.send(JSON.stringify(payload));
    }
  };
  createConsumeTransport = async (peer) => {
    const consumerId = uuidv4();
    const consumerTransport = new webrtc.RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.stunprotocol.org:3478" },
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });
    Bridge.clients.get(peer.id).consumerId = consumerId;
    consumerTransport.id = consumerId;
    consumerTransport.peer = peer;
    Bridge.consumers.set(consumerId, consumerTransport);
    Bridge.consumers
      .get(consumerId)
      .addTransceiver("video", { direction: "recvonly" });
    Bridge.consumers
      .get(consumerId)
      .addTransceiver("audio", { direction: "recvonly" });
    // console.log("-----------ffff----------");
    const offer = await Bridge.consumers.get(consumerId).createOffer();
    await Bridge.consumers.get(consumerId).setLocalDescription(offer);

    Bridge.consumers.get(consumerId).onicecandidate = (e) =>
      handleConsumerIceCandidate(e, peer.id, consumerId);

    Bridge.consumers.get(consumerId).ontrack = (e) => {
      if (!Bridge.streams.get(e.streams[0].id)) {
        Bridge.streams.set(e.streams[0].id, e.streams[0].id);
      }
    };

    return consumerTransport;
  };
  consumeOnce = async (peer) => {
    //   console.log("---send consume");
    const transport = await createConsumeTransport(peer);
    const payload = {
      type: "consume",
      id: peer.id,
      consumerId: transport.id,
      sdp: await transport.localDescription,
    };
    Bridge.connection?.send(JSON.stringify(payload));
  };
  handlePeers = async ({ peers }) => {
    // console.log("----------------handlePeers--:", peers)
    if (peers.length > 0) {
      for (const peer in peers) {
        Bridge.clients.set(peers[peer].id, peers[peer]);
        await consumeOnce(peers[peer]);
      }
    }
  };

  handleConsume = ({ sdp, id, consumerId }) => {
    // console.log("---recv consume");
    const desc = new webrtc.RTCSessionDescription(sdp);
    Bridge.consumers
      .get(consumerId)
      ?.setRemoteDescription(desc)
      .catch((e) => console.log(e));
  };
  handleNewProducer = async ({ id, username }) => {
    console.log("--------------------fFFFFFFFFFFFFFFFFFfffff-------");
    if (id === Bridge.localUUID) {
      return;
    }
    Bridge.clients.set(id, { id, username });
    await consumeOnce({ id, username });
  };
  removeUser = ({ id }) => {
    const { username, consumerId } = Bridge.clients.get(id);
    Bridge.consumers.delete(consumerId);
    Bridge.clients.delete(id);
  };
  consumeAll = () => {
    // console.log("---send getPeers");
    const payload = {
      type: "getPeers",
      uqid: Bridge.localUUID,
    };
    Bridge.connection?.send(JSON.stringify(payload));
  };
  subscribe = async () => {
    // Consume media
    await consumeAll();
  };
  handleIceCandidate = ({ candidate }) => {
    // console.log("---send ice");
    if (candidate && candidate.candidate && candidate.candidate.length > 0) {
      const payload = {
        type: "ice",
        ice: candidate,
        uqid: Bridge.localUUID,
      };
      Bridge.connection?.send(JSON.stringify(payload));
    }
  };
  handleNegotiation = async (peer, type) => {
    // console.log("---negoitating send sdp offer");
    const offer = await Bridge.localPeer.createOffer();
    await Bridge.localPeer.setLocalDescription(offer);
    Bridge.connection?.send(
      JSON.stringify({
        type: "connect",
        sdp: Bridge.localPeer.localDescription,
        uqid: Bridge.localUUID,
        username: Math.floor(Math.random(10) * 10) + "",
      })
    );
  };
  createPeer = () => {
    Bridge.localPeer = new webrtc.RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.stunprotocol.org:3478" },
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });
    //   console.log("---createPeer: ", Bridge.localPeer);

    Bridge.localPeer.onicecandidate = (e) => handleIceCandidate(e);
    Bridge.localPeer.onnegotiationneeded = () => handleNegotiation();
    return Bridge.localPeer;
  };
  connect = async () => {
    // console.log("---connect");
    //Produce media
    // const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    // this.handleRemoteTrack(stream, username.value)
    // Bridge.localStream = stream;

    Bridge.localPeer = createPeer();
    console.log("----------------------SFU SUB CREATE TRACK------------")
    var count = 0
    media_stream
      .getTracks()
      .forEach((track) => {
        if(count == 1){
          Bridge.localPeer.addTrack(track, media_stream)
        }
        else count = 1
      });
    // this.localStream.getTracks().forEach(track => this.localPeer.addTrack(track, this.localStream));
    await subscribe();
  };
  client_sub.on("connect", function (connection) {
    // console.log("WebSocket client_sub Connected");
    connection.on("error", function (error) {
      console.log("Connection Error: " + error.toString());
    });
    connection.on("close", function () {
      console.log("echo-protocol Connection Closed");
    });
    connection.on("message", function (data) {
      const message = JSON.parse(data.utf8Data);
      switch (message.type) {
        case "welcome":
          Bridge.localUUID = message.id;
          Bridge.connection = connection;
          connect();
          break;
        case "answer":
          handleAnswer(message);
          break;
        case "peers":
          handlePeers(message);
          break;
        case "consume":
          handleConsume(message);
          break;
        case "newProducer":
          handleNewProducer(message);
          break;
        case "user_left":
          // removeUser(message);
          break;
      }
    });
  });
};

module.exports = sfu;
