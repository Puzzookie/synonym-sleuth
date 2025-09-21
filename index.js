import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.static(path.join(__dirname, 'public')));

  // Load words from JSON file
  const wordsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'words.json'), 'utf8'));

  // Store sleuth information for each room
  const roomSleuths = new Map();

  app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  app.get('/', (req, res) => {
    const { r: roomId, n: name } = req.query;
    if (!roomId || !name) {
      return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
  });

  io.on('connection', (socket) => {

    socket.on('joinRoom', ({ roomId, name }) => {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.name = name;

      io.to(roomId).emit('message', `${name} has joined the room.`);
    });

    socket.on('chatMessage', (msg) => {
      if (socket.roomId) {
        io.to(socket.roomId).emit('message', `${socket.name}: ${msg}`);
      }
    });

    socket.on('disconnect', () => {
      if (socket.roomId && socket.name) {
        io.to(socket.roomId).emit('message', `${socket.name} has left the room.`);
      }
    });

    socket.on('sendSecretWord', () => {
        
      if (!socket.roomId) return;

      // Get all sockets in the room
      const roomSockets = Array.from(io.sockets.adapter.rooms.get(socket.roomId) || []);
      
      if (roomSockets.length < 3) {
        io.to(socket.roomId).emit('message', `#bb86fcThere needs to be at least 3 players to start.`);
        return;
      }

      // Randomly select one player to be the synonym sleuth
      const randomIndex = Math.floor(Math.random() * roomSockets.length);
      const sleuthSocketId = roomSockets[randomIndex];
      const sleuthSocket = io.sockets.sockets.get(sleuthSocketId);

      // Pick a random word
      const randomWord = wordsData[Math.floor(Math.random() * wordsData.length)];

      // Send special message to the selected sleuth
      if (sleuthSocket) {
        sleuthSocket.emit('message', '#FF0000You are the Synonym Sleuth. Blend in');
        // Store sleuth information for this room
        roomSleuths.set(socket.roomId, sleuthSocket.name);
      }

      // Send the word to all other players
      roomSockets.forEach(socketId => {
        if (socketId !== sleuthSocketId) {
          const otherSocket = io.sockets.sockets.get(socketId);
          if (otherSocket) {
            otherSocket.emit('message', `#00D100The secret word is ${randomWord}`);
          }
        }
      });
    });

    socket.on('revealSleuth', () => {
      if (!socket.roomId) return;

      const sleuthName = roomSleuths.get(socket.roomId);
      if (sleuthName) {
        // Send blue colored message revealing the sleuth
        io.to(socket.roomId).emit('message', `#bb86fcThe sleuth is ${sleuthName}!`);
      } else {
        // No sleuth has been selected yet
        socket.emit('message', '#bb86fcNo sleuth has been selected yet. Send a secret word first.');
      }
    });
  });

  return server;
}

const PORT = process.env.PORT || 3000;

const server = createServer();

server.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});