import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';

dotenv.config();

const app = express();

// 정적 파일 제공 (HTML, CSS, JS)
app.use(express.static('.'));

// CORS 허용
app.use(cors());

const upload = multer({ dest: 'uploads/' });
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

// 기존 목소리 목록 조회
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

// 목소리 삭제
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

// 가장 오래된 커스텀 목소리 삭제
async function deleteOldestCustomVoice() {
  const voices = await getVoiceList();
  
  // 커스텀 목소리만 필터링 (기본 목소리 제외)
  const customVoices = voices.filter(voice => 
    voice.category === 'cloned' || voice.category === 'generated'
  );
  
  if (customVoices.length > 0) {
    // 가장 오래된 목소리 (첫 번째) 삭제
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

// 더 정교한 삭제 전략 (선택사항)
async function deleteOldestCustomVoices(deleteCount = 1) {
  const voices = await getVoiceList();
  
  // 커스텀 목소리만 필터링하고 생성일순 정렬
  const customVoices = voices
    .filter(voice => voice.category === 'cloned' || voice.category === 'generated')
    .sort((a, b) => new Date(a.date_unix * 1000) - new Date(b.date_unix * 1000));
  
  let deletedCount = 0;
  for (let i = 0; i < Math.min(deleteCount, customVoices.length); i++) {
    const voice = customVoices[i];
    console.log(`삭제할 목소리 ${i+1}:`, voice.name, voice.voice_id);
    
    const deleted = await deleteVoice(voice.voice_id);
    if (deleted) {
      deletedCount++;
      console.log(`✅ 목소리 삭제 성공: ${voice.name}`);
      
      // 삭제 간격 (API 제한 방지)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return deletedCount;
}

// ElevenLabs 목소리 등록 (수정된 버전)
app.post('/api/voice-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "파일이 업로드되지 않았습니다." });
    }

    console.log("목소리 파일 업로드됨:", req.file.originalname);
    
    const form = new FormData();
    form.append('name', `내 목소리 ${Date.now()}`); // 고유한 이름
    form.append('files', await fileFromPath(req.file.path));

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
        // 다시 시도
        response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
          body: form
        });
        data = await response.json();
        console.log("재시도 후 ElevenLabs 응답:", data);
      }
    }
    
    // 업로드된 파일 정리
    fs.unlinkSync(req.file.path);
    
    // 응답 처리
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

// 추가: 목소리 목록 조회 API (디버깅용)
app.get('/api/voices', async (req, res) => {
  const voices = await getVoiceList();
  res.json({ voices, count: voices.length });
});

// 추가: 특정 목소리 삭제 API (관리용)
app.delete('/api/voice/:voiceId', async (req, res) => {
  const deleted = await deleteVoice(req.params.voiceId);
  if (deleted) {
    res.json({ message: "목소리 삭제 성공" });
  } else {
    res.status(400).json({ detail: "목소리 삭제 실패" });
  }
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

// 서버 시작 (기존 코드가 없다면 추가)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});