import http from "node:http";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { setupRealtimeGateway } from "./realtime/gateway.js";

dotenv.config();

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const app = createApp(port);
const server = http.createServer(app);
setupRealtimeGateway(server);

server.listen(port, () => {
  console.log(`[OiU Server] Listening on http://localhost:${port}`);
  console.log(`[OiU Server] Realtime WebSocket gateway mounted at ws://localhost:${port}/realtime`);
});
