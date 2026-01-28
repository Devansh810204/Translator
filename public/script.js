const socket = io();

// State Variables
let localStream;
let peerConnection;
let recognition;
let myLang = 'en-US';
let listenLang = 'en-US';
let roomId = '';
let subtitlesOn = true;
let isMuted = false;
let isVideoOff = false; // Video State
let mediaRecorder;      // Recording State
let recordedChunks = [];
let isRecording = false;

// WebRTC Config
const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- NAVIGATION ---
function handleLogin() {
    const user = document.getElementById('username').value;
    if(user) switchScreen('login-screen', 'setup-screen');
    else alert("Please enter a username");
}

function switchScreen(fromId, toId) {
    document.getElementById(fromId).classList.remove('active');
    document.getElementById(toId).classList.add('active');
}

// --- CALL SETUP ---
async function startCall() {
    roomId = document.getElementById('room-id').value;
    myLang = document.getElementById('my-lang').value;
    listenLang = document.getElementById('listen-lang').value;

    if (!roomId) return alert("Enter a room name!");

    switchScreen('setup-screen', 'call-screen');
    document.getElementById('room-display').innerText = roomId;

    try {
        // Request Camera & Mic
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = localStream;

        initSpeechRecognition();
        socket.emit('join-room', roomId, socket.id);
    } catch (err) {
        console.error("Media Access Error:", err);
        alert("Camera/Mic access denied! Please check browser permissions.");
    }
}

// --- WEBRTC LOGIC ---
socket.on('user-connected', async (userId) => {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
});

socket.on('offer', async (offer) => {
    createPeerConnection();
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

socket.on('answer', async (answer) => {
    if(peerConnection) await peerConnection.setRemoteDescription(answer);
});

socket.on('ice-candidate', async (candidate) => {
    if(peerConnection) await peerConnection.addIceCandidate(candidate);
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        const remoteVid = document.getElementById('remote-video');
        remoteVid.srcObject = event.streams[0];
        remoteVid.volume = 0.1; // Low volume for original voice
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) socket.emit('ice-candidate', event.candidate);
    };
}

// --- SPEECH & TRANSLATION ---
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Your browser does not support Speech API. Please use Google Chrome.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = myLang; 
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const lastResult = event.results.length - 1;
        const text = event.results[lastResult][0].transcript;
        
        socket.emit('speak-data', {
            roomId: roomId,
            text: text,
            sourceLang: myLang
        });
    };
    recognition.start();
}

socket.on('receive-speak-data', async (data) => {
    const translatedText = await translateText(data.text, data.sourceLang, listenLang);
    
    // Show Subtitles
    if (subtitlesOn) {
        const subtitleText = document.getElementById('subtitle-text');
        subtitleText.innerText = translatedText;
        subtitleText.style.opacity = "1";
        setTimeout(() => { subtitleText.style.opacity = "0"; }, 6000);
    }

    // Speak Audio
    speakText(translatedText, listenLang);
});

// --- TRANSLATION FUNCTION (HTTPS FIXED) ---
async function translateText(text, source, target) {
    const srcCode = source.split('-')[0];
    const targetCode = target.split('-')[0];
    if(srcCode === targetCode) return text;

    try {
        // HTTPS LINK HERE
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${srcCode}|${targetCode}`);
        const data = await res.json();
        return data.responseData.translatedText;
    } catch (e) {
        console.error("Translation Error:", e);
        return text; 
    }
}

function speakText(text, lang) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
}

// --- CONTROLS LOGIC ---

// 1. Mute Audio
function toggleMute() {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    
    const btn = document.getElementById('mute-btn');
    btn.innerText = isMuted ? "🔴 Unmute" : "🎤 Mute";
    btn.style.background = isMuted ? "red" : "#007bff";
    
    if(isMuted) recognition.stop();
    else recognition.start();
}

// 2. Stop Video (NEW)
function toggleVideo() {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks()[0].enabled = !isVideoOff;
    
    const btn = document.getElementById('video-btn');
    btn.innerText = isVideoOff ? "📷 Start Video" : "📷 Stop Video";
    btn.style.background = isVideoOff ? "red" : "#007bff";
}

// 3. Toggle CC
function toggleSubtitles() {
    subtitlesOn = !subtitlesOn;
    const btn = document.getElementById('cc-btn');
    btn.innerText = subtitlesOn ? "📝 CC On" : "CC Off";
    btn.style.background = subtitlesOn ? "#007bff" : "#555";
}

// 4. Screen Recording (NEW)
async function handleRecording() {
    const btn = document.getElementById('record-btn');

    if (!isRecording) {
        // START RECORDING
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { mediaSource: "screen" },
                audio: true 
            });

            mediaRecorder = new MediaRecorder(stream);
            recordedChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onstop = saveRecording;

            mediaRecorder.start();
            isRecording = true;
            btn.innerText = "⏹️ Stop Rec";
            btn.style.background = "red";
            
            // Stop if user uses browser 'Stop Sharing' floating bar
            stream.getVideoTracks()[0].onended = () => {
                if(isRecording) handleRecording();
            };

        } catch (err) {
            console.error("Recording error: ", err);
        }
    } else {
        // STOP RECORDING
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        btn.innerText = "⏺️ Record";
        btn.style.background = "#ff9800";
    }
}

function saveRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `vingo-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    alert("Recording saved to your device!");
}

function endCall() {
    location.reload();
}
