const recordBtn = document.getElementById("recordBtn");
let mediaRecorder, chunks = [];
let customVoiceId = null;

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  chunks = [];

  mediaRecorder.start();
  recordBtn.textContent = "녹음 중... 클릭해서 멈추기";

  mediaRecorder.ondataavailable = e => chunks.push(e.data);
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const text = await speechToText(blob);
    console.log("📝 변환된 텍스트:", text);
    document.getElementById("userText").textContent = "🗣 " + text;

    const reply = await getGPTResponse(text);
    document.getElementById("gptText").textContent = "🤖 " + reply;

    await playVoice(reply);
    recordBtn.textContent = "말하기";
    recordBtn.onclick = startRecording; // 다시 녹음 시작 가능하게 연결
  };

  recordBtn.onclick = () => {
    mediaRecorder.stop();
    recordBtn.textContent = "처리 중...";
    recordBtn.onclick = null; // 중복 클릭 방지
  };
}

recordBtn.onclick = startRecording;

async function speechToText(audioBlob) {
  const form = new FormData();
  form.append("file", audioBlob, "audio.webm");
  form.append("model", "whisper-1");

  const res = await fetch("http://localhost:3000/api/speech-to-text", {
    method: "POST",
    body: form
  });

  const data = await res.json();
  return data.text;
}

async function getGPTResponse(text) {
  const res = await fetch("http://localhost:3000/api/gpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  const data = await res.json();
  if (!data.choices || !data.choices[0]) {
    console.error("GPT API error:", data);
    return "GPT 응답 오류";
  }
  return data.choices[0].message.content;
}

document.getElementById("voiceFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("http://localhost:3000/api/voice-upload", {
    method: "POST",
    body: form
  });
  const data = await res.json();
  if (data.voice_id) {
    customVoiceId = data.voice_id;
    alert("목소리 등록 성공! 이제 내 목소리로 답변합니다.");
  } else {
    alert("목소리 등록 실패: " + (data.detail || JSON.stringify(data)));
  }
});

async function playVoice(text) {
  const voiceId = customVoiceId || "wl1CnM04OwXOUKQaKBWI";
  const res = await fetch("http://localhost:3000/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId })
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  new Audio(url).play();
}