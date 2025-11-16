import express from "express";
import serverless from "serverless-http";

const app = express();

// Rota de teste
app.get("/", (req, res) => {
    res.json({ message: "API funcionando sem banco!" });
});

export default serverless(app);
