import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';
dotenv.config();

const app = express();
app.use(express.static('.')); // 또는 app.use(express.static('public'));
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json());

// Whisper 음성 → 텍스트
app.post('/api/speech-to-text', upload.single('file'), async (req, res) => {
  const form = new FormData();
  // 원본 파일명(req.file.originalname)으로 확장자 전달
  form.append('file', await fileFromPath(req.file.path, req.file.originalname));
  form.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  });
  const data = await response.json();
  console.log("Whisper 응답:", data);
  fs.unlinkSync(req.file.path);
  res.json(data);
});

// GPT 답변
app.post('/api/gpt', async (req, res) => {
  console.log("GPT 질문:", req.body.text); // 질문 로그
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
  console.log("GPT 응답:", data); // 응답 로그
  res.json(data);
});

// ElevenLabs 목소리 등록
app.post('/api/voice-upload', upload.single('file'), async (req, res) => {
  const form = new FormData();
  form.append('name', '내 목소리');
  form.append('files', await fileFromPath(req.file.path));

  const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: form
  });
  const data = await response.json();
  fs.unlinkSync(req.file.path);
  res.json(data);
});

// ElevenLabs TTS
app.post('/api/tts', async (req, res) => {
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
});

// 사전신청 이메일 수집
app.post('/api/notify', express.json(), (req, res) => {
  const { email } = req.body;
  // 실제로는 DB나 파일에 저장해야 함
  console.log("사전신청 이메일:", email);
  res.json({ ok: true });
});

app.listen(3000, () => {
  console.log('서버 실행중: http://localhost:3000');
});