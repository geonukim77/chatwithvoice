import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// 정적 파일 제공 (MIME 타입 명시)
app.use(express.static(path.join(__dirname, '../'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

// CORS 허용
app.use(cors());
app.use(express.json());

// 파일 업로드 설정 (메모리 저장)
const upload = multer({ storage: multer.memoryStorage() });

// 기본 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// JavaScript 파일 직접 서빙
app.get('/script/main.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, '../script/main.js'));
});

// STT API (Whisper)
app.post('/api/speech-to-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const form = new FormData();
    form.append('file', new Blob([req.file.buffer]), req.file.originalname);
    form.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('STT 에러:', error);
    res.status(500).json({ error: 'STT 실패: ' + error.message });
  }
});

// GPT API
app.post('/api/gpt', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: req.body.text }]
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('GPT 에러:', error);
    res.status(500).json({ error: 'GPT 실패: ' + error.message });
  }
});

// 목소리 삭제 함수들
async function getVoiceList() {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    console.error("목소리 목록 조회 실패:", error);
    return [];
  }
}

async function deleteVoice(voiceId) {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    return response.ok;
  } catch (error) {
    console.error("목소리 삭제 실패:", error);
    return false;
  }
}

async function deleteOldestCustomVoice() {
  const voices = await getVoiceList();
  const customVoices = voices.filter(voice => 
    voice.category === 'cloned' || voice.category === 'generated'
  );
  
  if (customVoices.length > 0) {
    const oldestVoice = customVoices[0];
    console.log("삭제할 목소리:", oldestVoice.name, oldestVoice.voice_id);
    
    const deleted = await deleteVoice(oldestVoice.voice_id);
    if (deleted) {
      console.log("✅ 목소리 삭제 성공:", oldestVoice.name);
      return true;
    }
  }
  return false;
}

// ElevenLabs 목소리 등록
app.post('/api/voice-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "파일이 업로드되지 않았습니다." });
    }

    console.log("목소리 파일 업로드됨:", req.file.originalname);
    
    const form = new FormData();
    form.append('name', `내 목소리 ${Date.now()}`);
    form.append('files', new Blob([req.file.buffer]), req.file.originalname);

    let response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: form
    });
    
    let data = await response.json();
    console.log("ElevenLabs 응답:", data);
    
    // 목소리 한도 초과 시 자동 삭제 후 재시도
    if (data.detail && data.detail.status === 'voice_limit_reached') {
      console.log("🔄 목소리 한도 초과, 기존 목소리 삭제 후 재시도...");
      
      const deleted = await deleteOldestCustomVoice();
      if (deleted) {
        response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
          body: form
        });
        data = await response.json();
        console.log("재시도 후 ElevenLabs 응답:", data);
      }
    }
    
    if (data.voice_id) {
      res.json({ 
        voice_id: data.voice_id,
        message: "목소리 등록 성공"
      });
    } else {
      res.status(400).json({ detail: "목소리 등록 실패: " + (data.detail?.message || JSON.stringify(data)) });
    }
    
  } catch (error) {
    console.error("목소리 업로드 에러:", error);
    res.status(500).json({ detail: "목소리 업로드 실패: " + error.message });
  }
});

// ElevenLabs TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        voice_settings: { stability: 0.7, similarity_boost: 0.9 }
      })
    });
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('TTS 에러:', error);
    res.status(500).json({ error: 'TTS 실패: ' + error.message });
  }
});

// Vercel 서버리스 함수로 내보내기 (로컬에서는 실행 안됨)
export default app;