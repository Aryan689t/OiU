import express from "express";
import cors from "cors";
import { createSessionsRouter } from "./routes/sessions.js";
export function handleHealth(_req, res) {
    return res.status(200).json({
        status: "ok",
        service: "oiu-backend",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
}
export function createApp(wsPort) {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.get("/health", handleHealth);
    app.use("/v1/sessions", createSessionsRouter(wsPort));
    return app;
}
