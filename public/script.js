/* public/script.js */
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

// WebRTC Configuration (STUN servers allow connection through NATs)
const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- NAVIGATION FUNCTIONS ---

function handleLogin() {
    const user = document.getElementById('username').value;
    if(user) {
        switchScreen('login-screen', 'setup-screen');
    } else {
        alert("Please enter a username");
    }
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

    // 1. Get Media (Video/Audio)
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = localStream;

        // 2. Initialize Speech Recognition
        initSpeechRecognition();

        // 3. Connect to Room
        socket.emit('join-room', roomId, socket.id);
    } catch (err) {
        console.error("Media Error:", err);
        alert("Could not access camera/mic. Ensure you are on HTTPS or localhost.");
    }
}

// --- WEBRTC LOGIC (Standard Peer Connection) ---

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
        // IMPORTANT: We partly mute the remote video so we hear the TRANSLATION, not the original voice
        // But some users prefer hearing both (ducking). For MVP, we keep original audio low volume.
        remoteVid.volume = 0.1; 
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) socket.emit('ice-candidate', event.candidate);
    };
}

// --- SPEECH RECOGNITION (Talk -> Text) ---

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Browser not supported. Use Chrome/Edge.");

    recognition = new SpeechRecognition();
    recognition.lang = myLang; 
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const lastResult = event.results.length - 1;
        const text = event.results[lastResult][0].transcript;
        
        console.log(`Spoken (${myLang}):`, text);

        // Send to partner
        socket.emit('speak-data', {
            roomId: roomId,
            text: text,
            sourceLang: myLang
        });
    };

    recognition.start();
}

// --- TRANSLATION & TTS (Receive -> Translate -> Speak) ---

socket.on('receive-speak-data', async (data) => {
    // 1. Translate
    const translatedText = await translateText(data.text, data.sourceLang, listenLang);
    
    // 2. Show Subtitles (If enabled)
    const subtitleText = document.getElementById('subtitle-text');
    subtitleText.innerText = translatedText;
    subtitleText.style.opacity = subtitlesOn ? "1" : "0";

    // 3. Speak (TTS)
    speakText(translatedText, listenLang);
});

// Mock Translation function (Uses MyMemory API)
async function translateText(text, source, target) {
    const srcCode = source.split('-')[0];
    const targetCode = target.split('-')[0];
    if(srcCode === targetCode) return text;

    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${srcCode}|${targetCode}`);
        const data = await res.json();
        return data.responseData.translatedText;
    } catch (e) {
        console.error(e);
        return text; 
    }
}

function speakText(text, lang) {
    // Cancel previous speech to avoid overlapping
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1; // Speed
    window.speechSynthesis.speak(utterance);
}

// --- CONTROLS ---

function toggleMute() {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    
    const btn = document.getElementById('mute-btn');
    btn.innerText = isMuted ? "🔴 Unmute" : "🎤 Mute";
    btn.style.background = isMuted ? "red" : "#007bff";
    
    if(isMuted) recognition.stop();
    else recognition.start();
}

function toggleSubtitles() {
    subtitlesOn = !subtitlesOn;
    const btn = document.getElementById('cc-btn');
    const subText = document.getElementById('subtitle-text');

    if(subtitlesOn) {
        btn.innerText = "📝 CC On";
        btn.style.background = "#007bff";
        subText.style.opacity = "1";
    } else {
        btn.innerText = "CC Off";
        btn.style.background = "#555";
        subText.style.opacity = "0";
    }
}

function endCall() {
    location.reload();
}
