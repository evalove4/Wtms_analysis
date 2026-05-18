import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

app.get('/api/weather', async (req, res) => {
  const { tm1, tm2, stn } = req.query;
  const authKey = process.env.KMA_KEY;

  if (!authKey) {
    return res.status(500).json({ error: 'KMA API key (KMA_KEY) not configured' });
  }

  const url = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php?tm1=${tm1}&tm2=${tm2}&stn=${stn}&help=0&authKey=${authKey}`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    res.send(text);
  } catch (error) {
    console.error('Weather API Error:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// Gemini Analysis Endpoint
app.post("/api/analyze-integrity", async (req, res) => {
  try {
    const { anomalies, summary, weatherData } = req.body;
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

    Nearby Weather Data (Hourly):
    ${weatherData ? JSON.stringify(weatherData) : 'No weather data available'}
    
    Provide your report in Korean, with clear sections: [상태 요약], [주요 이상 원인 분석], [시설 유지보수 권고].
    Use professional tone.
    
    Additional Instructions:
    \"4. For the measured values of TOC, SS, T-N, T-P, etc., where the status is '장비정상', please evaluate the effects of periodicity, seasonality, and weather conditions such as temperature and rainfall.\"
    \"5. 처리시설의 운영에 대한 평가는 엄격히 금지합니다. 오직 TMS 측정 장비와 수질 데이터의 신뢰성에만 집중하십시오.\" `;

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
