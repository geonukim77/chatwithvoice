require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json());

// Whisper 음성 → 텍스트
app.post('/api/speech-to-text', upload.single('file'), async (req, res) => {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(req.file.path), req.file.originalname);
  formData.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData
  });
  const data = await response.json();
  fs.unlinkSync(req.file.path); // 임시 파일 삭제
  res.json(data);
});

// GPT 답변
app.post('/api/gpt', async (req, res) => {
  const { text } = req.body;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: text }]
    })
  });
  const data = await response.json();
  res.json(data);
});

// ElevenLabs 목소리 등록
app.post('/api/voice-upload', upload.single('file'), async (req, res) => {
  const formData = new FormData();
  formData.append('name', '내 목소리');
  formData.append('files', fs.createReadStream(req.file.path), req.file.originalname);

  const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: formData
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

app.listen(3000, () => {
  console.log('서버 실행중: http://localhost:3000');
});