const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>S-Meet</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <script src="https://kit.fontawesome.com/a076d05399.js" crossorigin="anonymous"></script>
      <style>
        body {
          margin: 0;
          background: #000;
          color: #fff;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          text-align: center;
        }
        .title {
          font-size: 2.5rem;
          margin: 20px 0;
          animation: fadeIn 2s ease-in-out;
        }
        video {
          width: 45%;
          border: 3px solid #fff;
          border-radius: 10px;
          margin: 10px;
        }
        #messages {
          list-style: none;
          padding: 0;
          max-height: 150px;
          overflow-y: auto;
        }
        #messages li {
          background: rgba(255, 255, 255, 0.1);
          padding: 5px;
          margin: 2px;
          border-radius: 5px;
          animation: fadeIn 0.5s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        #intro {
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100%;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          color: #fff;
          font-size: 3rem;
          opacity: 1;
          transition: opacity 2s;
        }
      </style>
    </head>
    <body>
      <div id="intro">🚀 S-Meet</div>
      <h1 class="title"><i class="fas fa-rocket"></i> S-Meet Room</h1>
      <div>
        <video id="localVideo" autoplay muted playsinline></video>
        <video id="remoteVideo" autoplay playsinline></video>
      </div>
      <div class="mt-3">
        <button class="btn btn-light btn-sm" onclick="toggleMute()"><i class="fas fa-microphone"></i> Mute / Unmute</button>
        <button class="btn btn-light btn-sm" onclick="toggleVideo()"><i class="fas fa-video"></i> Start / Stop Video</button>
        <button class="btn btn-light btn-sm" onclick="shareScreen()"><i class="fas fa-desktop"></i> Share Screen</button>
      </div>
      <div class="mt-3">
        <input id="msgInput" placeholder="Type a message" class="form-control d-inline w-50" />
        <button class="btn btn-secondary btn-sm" onclick="sendMessage()"><i class="fas fa-paper-plane"></i> Send</button>
      </div>
      <ul id="messages" class="mt-2"></ul>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        let localStream;
        let peerConnection;
        const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

        window.onload = () => {
          setTimeout(() => {
            document.getElementById('intro').style.opacity = '0';
            setTimeout(() => {
              document.getElementById('intro').remove();
            }, 2000);
          }, 2000);
        };

        socket.on('connect', () => console.log('Connected to server!'));

        socket.on('chat message', (msg) => {
          const li = document.createElement('li');
          li.textContent = msg;
          document.getElementById('messages').appendChild(li);
        });

        async function startMedia() {
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('localVideo').srcObject = localStream;
            peerConnection = new RTCPeerConnection(config);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            peerConnection.ontrack = (event) => {
              document.getElementById('remoteVideo').srcObject = event.streams[0];
            };

            peerConnection.onicecandidate = (event) => {
              if (event.candidate) socket.emit('ice-candidate', event.candidate);
            };

            socket.emit('join');
          } catch (err) {
            console.error("Media start error:", err);
          }
        }

        function sendMessage() {
          const input = document.getElementById('msgInput');
          const msg = input.value;
          if(msg) {
            socket.emit('chat message', msg);
            input.value = '';
          }
        }

        function toggleMute() {
          localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
        }

        function toggleVideo() {
          localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
        }

        async function shareScreen() {
          try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
            screenTrack.onended = () => {
              sender.replaceTrack(localStream.getVideoTracks()[0]);
            };
          } catch (err) {
            console.error("Screen share error:", err);
          }
        }

        socket.on('ready', async () => {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          socket.emit('offer', offer);
        });

        socket.on('offer', async (offer) => {
          await peerConnection.setRemoteDescription(offer);
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit('answer', answer);
        });

        socket.on('answer', async (answer) => {
          await peerConnection.setRemoteDescription(answer);
        });

        socket.on('ice-candidate', async (candidate) => {
          if (candidate) {
            try {
              await peerConnection.addIceCandidate(candidate);
            } catch (err) {
              console.error('ICE candidate error:', err);
            }
          }
        });

        startMedia();
      </script>
    </body>
    </html>
  `);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });

  socket.on('join', () => {
    const otherClients = Array.from(io.sockets.sockets.values()).filter(s => s.id !== socket.id);
    if (otherClients.length) socket.emit('ready');
  });

  socket.on('offer', (offer) => socket.broadcast.emit('offer', offer));
  socket.on('answer', (answer) => socket.broadcast.emit('answer', answer));
  socket.on('ice-candidate', (candidate) => socket.broadcast.emit('ice-candidate', candidate));

  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

server.listen(port, () => console.log(`Server running at http://localhost:${port}`));
