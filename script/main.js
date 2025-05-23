const recordBtn = document.getElementById("recordBtn");
const voiceRecordBtn = document.getElementById("voiceRecordBtn");
const voiceStatus = document.getElementById("voiceStatus");

let mediaRecorder, chunks = [];
let customVoiceId = null;
let isRecordingVoice = false;
let isRecordingChat = false;

// 1단계: 목소리 등록 녹음
voiceRecordBtn.onclick = async function() {
  if (!isRecordingVoice) {
    // 녹음 시작
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      chunks = [];
      
      mediaRecorder.start();
      isRecordingVoice = true;
      
      voiceRecordBtn.textContent = "⏹️ 녹음 중... 클릭해서 멈추기";
      voiceRecordBtn.style.background = "#dc2626";
      voiceStatus.textContent = "목소리를 녹음 중입니다... (최소 10초 권장)";
      voiceStatus.style.color = "#dc2626";
      
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        await uploadVoice(blob);
        
        // 스트림 정리
        stream.getTracks().forEach(track => track.stop());
      };
      
    } catch (error) {
      console.error("마이크 접근 에러:", error);
      alert("마이크에 접근할 수 없습니다. 권한을 확인해주세요.");
    }
  } else {
    // 녹음 중지
    mediaRecorder.stop();
    isRecordingVoice = false;
    
    voiceRecordBtn.textContent = "⏳ 업로드 중...";
    voiceRecordBtn.style.background = "#9ca3af";
    voiceStatus.textContent = "목소리를 업로드하고 있습니다...";
    voiceStatus.style.color = "#9ca3af";
  }
};

// 목소리 업로드 함수
async function uploadVoice(audioBlob) {
  try {
    const form = new FormData();
    form.append("file", audioBlob, "voice.webm");

    const res = await fetch("http://localhost:3000/api/voice-upload", {
      method: "POST",
      body: form
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    if (data.voice_id) {
      customVoiceId = data.voice_id;
      voiceRecordBtn.textContent = "✅ 등록 완료";
      voiceRecordBtn.style.background = "#22c55e";
      voiceStatus.textContent = "✅ 목소리 등록 완료! 이제 아래에서 대화해보세요.";
      voiceStatus.style.color = "#22c55e";
      
      // 5초 후 다시 녹음 가능하게
      setTimeout(() => {
        voiceRecordBtn.textContent = "🔴 다시 녹음하기";
        voiceRecordBtn.style.background = "#ef4444";
        voiceStatus.textContent = "새로운 목소리로 다시 등록하거나, 아래에서 대화를 시작하세요.";
        voiceStatus.style.color = "#666";
      }, 5000);
      
    } else {
      voiceRecordBtn.textContent = "❌ 등록 실패";
      voiceRecordBtn.style.background = "#ef4444";
      voiceStatus.textContent = "❌ 목소리 등록 실패: " + (data.detail || "알 수 없는 오류");
      voiceStatus.style.color = "#ef4444";
    }
  } catch (error) {
    console.error("목소리 업로드 에러:", error);
    voiceRecordBtn.textContent = "❌ 업로드 실패";
    voiceRecordBtn.style.background = "#ef4444";
    voiceStatus.textContent = "❌ 목소리 업로드 중 오류가 발생했습니다: " + error.message;
    voiceStatus.style.color = "#ef4444";
  }
}

// 2단계: 대화 녹음
async function startChatRecording() {
  if (isRecordingChat) return; // 중복 실행 방지
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = [];
    isRecordingChat = true;

    mediaRecorder.start();
    recordBtn.textContent = "⏹️ 클릭해서 멈추기";
    recordBtn.style.background = "#6366f1";

    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      recordBtn.textContent = "⏳ 처리 중...";
      recordBtn.style.background = "#9ca3af";

      const text = await speechToText(blob);
      if (text) {
        console.log("📝 변환된 텍스트:", text);
        document.getElementById("userText").textContent = "🗣 " + text;

        const reply = await getGPTResponse(text);
        document.getElementById("gptText").textContent = "🤖 " + reply;

        // 내 목소리로 답변 재생
        await playVoice(reply);
      }

      recordBtn.textContent = "🎤 말하기";
      recordBtn.style.background = "#6366f1";
      isRecordingChat = false;
      
      // 스트림 정리
      stream.getTracks().forEach(track => track.stop());
    };

    // 녹음 중지 이벤트
    recordBtn.onclick = () => {
      if (isRecordingChat) {
        mediaRecorder.stop();
        recordBtn.onclick = startChatRecording; // 다시 녹음 시작 가능하게 연결
      }
    };

  } catch (error) {
    console.error("대화 녹음 에러:", error);
    alert("마이크에 접근할 수 없습니다. 권한을 확인해주세요.");
    isRecordingChat = false;
  }
}

recordBtn.onclick = startChatRecording;

// 음성 → 텍스트 변환
async function speechToText(audioBlob) {
  try {
    const form = new FormData();
    form.append("file", audioBlob, "audio.webm");
    form.append("model", "whisper-1");

    const res = await fetch("http://localhost:3000/api/speech-to-text", {
      method: "POST",
      body: form
    });

    const data = await res.json();
    if (!data.text) {
      console.error("Whisper 변환 실패:", data);
      alert("음성 인식에 실패했습니다. 다시 시도해 주세요.");
      return null;
    }
    return data.text;
  } catch (error) {
    console.error("음성 변환 에러:", error);
    alert("음성 변환 중 오류가 발생했습니다.");
    return null;
  }
}

// GPT 응답 생성
async function getGPTResponse(text) {
  try {
    const res = await fetch("http://localhost:3000/api/gpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    if (!data.choices || !data.choices[0]) {
      console.error("GPT API error:", data);
      return "GPT 응답 오류가 발생했습니다.";
    }
    console.log("🤖 GPT 답변:", data.choices[0].message.content);
    return data.choices[0].message.content;
  } catch (error) {
    console.error("GPT 응답 에러:", error);
    return "GPT 응답 중 오류가 발생했습니다.";
  }
}

// 내 목소리로 답변 재생
async function playVoice(text) {
  try {
    const voiceId = customVoiceId || "wl1CnM04OwXOUKQaKBWI"; // 기본 목소리 ID
    const res = await fetch("http://localhost:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId })
    });

    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } else {
      console.error("TTS 실패:", res.status);
    }
  } catch (error) {
    console.error("음성 재생 에러:", error);
  }
}