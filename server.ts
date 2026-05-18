import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Gemini Analysis Endpoint
app.post("/api/analyze-integrity", async (req, res) => {
  try {
    const { anomalies, summary } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = `You are a professional environmental engineer and facility integrity analyst. 
    Analyze the following Water TMS (Tele-Monitoring System) data anomalies and provide a concise 'Facility Integrity Report'.
    Focus on potential causes for zero values, abrupt changes, and abnormal statuses (TOC, SS, TN, TP).
    
    Data Summary:
    ${JSON.stringify(summary)}
    
    Sample Anomalies:
    ${JSON.stringify(anomalies.slice(0, 10))}
    
    Provide your report in Korean, with clear sections: [상태 요약], [주요 이상 원인 분석], [시설 유지보수 권고].
    Use professional tone.`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    res.json({ report: result.text });
  } catch (error) {
    console.error("Gemini analysis error:", error);
    res.status(500).json({ error: "Failed to generate AI report" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
