# Server

Express + Mongoose API for WhatsApp webhook simulation.

Endpoints:
- GET /api/health
- GET /api/messages/chats
- GET /api/messages/conversations/:wa_id
- POST /api/messages/send { wa_id, text, name? }
- POST /api/payloads/ingest { messages[] | statuses[] }

Spec-compatible endpoints:
- GET /api/chats and GET /chats
- GET /api/messages/:wa_id and GET /messages/:wa_id
- POST /api/messages and POST /messages { wa_id, name, text, status }

Data model:
- MongoDB Database: whatsapp
- Collection: processed_messages
- Message schema: { wa_id, name, text, timestamp, status, profilePic, direction, id, meta_msg_id, type }

Scripts:
- npm run seed -> process JSON payloads into MongoDB. Put JSON files under `server/payloads/` or pass a folder path: `npm run seed -- ./path/to/payloads`.

Env:
- MONGODB_URI
- PORT (default 8080)
- CORS_ORIGIN (comma separated allowed origins)
