import express from "express";
import serverless from "serverless-http"; // se for serverless

const app = express();

// Rota de teste
app.get("/", (req, res) => {
    res.json({ message: "API funcionando sem banco!" });
});

export default app; // se for serverless
// ou, se estiver rodando localmente:
// app.listen(3000, () => console.log("API rodando na porta 3000"));
