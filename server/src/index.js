import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import messageRouter, { compatRoutes } from './routes/messages.js';
import payloadRouter from './routes/payloads.js';
import statusRouter from './routes/status.js';
import adminRouter from './routes/admin.js';
import usersRouter from './routes/users.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true;
const io = new SocketIOServer(server, {
  cors: { origin: allowedOrigins === true ? '*' : allowedOrigins, methods: ['GET','POST','PUT'] }
});

app.set('io', io);

// Middlewares
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Static uploads
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// MongoDB (resilient connect with retry, no hard exit)
const MONGODB_URI = process.env.MONGODB_URI;
const redact = (s) => s?.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/i, (_m, p, u) => `${p}${u}:****@`);
// Use 'whatsapp' by default to match spec; can be overridden via MONGO_DB_NAME
const dbName = process.env.MONGO_DB_NAME || 'whatsapp';

const mongoState = {
  connected: false,
  readyState: 0,
  error: null,
  lastConnectedAt: null,
};

function updateMongoStateFromConn() {
  mongoState.readyState = mongoose.connection.readyState;
  mongoState.connected = mongoose.connection.readyState === 1;
}

function connectWithRetry(delayMs = 5000) {
  if (!MONGODB_URI) {
    mongoState.error = 'Missing MONGODB_URI';
    console.error('Missing MONGODB_URI');
    return; // do not loop when config missing
  }
  console.log('Connecting to MongoDB...', dbName ? `(dbName=${dbName})` : '');
  const connectOpts = {
    ...(dbName ? { dbName } : {}),
    serverSelectionTimeoutMS: 5000,
  };
  mongoose
    .connect(MONGODB_URI, connectOpts)
    .then(() => {
      updateMongoStateFromConn();
      mongoState.error = null;
      mongoState.lastConnectedAt = Date.now();
      console.log('MongoDB connected');
    })
    .catch((err) => {
      mongoState.error = err?.message || String(err);
      updateMongoStateFromConn();
      console.error('MongoDB connection error:', redact(MONGODB_URI), '-', mongoState.error);
      // retry after delay
      setTimeout(() => connectWithRetry(delayMs), delayMs);
    });
}

mongoose.connection.on('disconnected', () => {
  updateMongoStateFromConn();
  console.warn('MongoDB disconnected');
});
mongoose.connection.on('error', (err) => {
  mongoState.error = err?.message || String(err);
  updateMongoStateFromConn();
  console.error('MongoDB error:', mongoState.error);
});

// kick off connect (non-blocking)
connectWithRetry();

// Routes
app.get('/api/health', (req, res) => {
  updateMongoStateFromConn();
  res.json({ ok: true, mongo: { ...mongoState } });
});
app.use('/api/messages', messageRouter);
app.use('/api/payloads', payloadRouter);
app.use('/api/status', statusRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
// Mount spec-compatible endpoints
compatRoutes(app);

// Socket.IO
io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);
  // Relay typing indicators to all clients
  socket.on('typing', (payload) => {
    try {
      io.emit('typing', { ...payload, at: Date.now() });
    } catch (_) {}
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server listening on :${PORT}`));

// Prevent unhandled rejections from killing the process
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason?.message || reason);
});
