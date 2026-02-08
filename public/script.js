const socket = io();

// Variables
let localStream;
let myUsername = "User"; // Default
let roomId = "";
let myLang = "en-US";
let listenLang = "en-US";
let recognition;
let isMuted = true;
let isVideoOff = true;
let subtitlesOn = true;
const peers = {};

// STUN Configuration (Google's free servers)
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- 1. SETUP & NAVIGATION ---

function goToSetup() {
    const input = document.getElementById('username');
    if (input.value.trim()) myUsername = input.value;
    else return alert("Please enter your name");
    
    switchScreen('login-screen', 'setup-screen');
}

function switchScreen(from, to) {
    document.getElementById(from).classList.remove('active');
    document.getElementById(to).classList.add('active');
}

function toggleSettings() {
    document.getElementById('settings-panel').classList.toggle('hidden');
}

async function joinRoom() {
    roomId = document.getElementById('room-id').value;
    if (!roomId) return alert("Please enter a Room ID");

    // Get Languages
    myLang = document.getElementById('setup-my-lang').value;
    listenLang = document.getElementById('setup-listen-lang').value;
    
    // Sync to in-call settings
    document.getElementById('in-call-my-lang').value = myLang;
    document.getElementById('in-call-listen-lang').value = listenLang;

    // Switch UI
    switchScreen('setup-screen', 'call-screen');
    document.getElementById('display-room-id').innerText = roomId;
    document.querySelector('#local-wrapper .label').innerText = "You";

    // 1. Get Media
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });
        document.getElementById('local-video').srcObject = localStream;
        
        // 2. Start Logic
        initSpeechRecognition();
        socket.emit('join-room', roomId, myUsername, myLang);

    } catch (err) {
        console.error("Media Error:", err);
        alert("⚠️ Camera/Mic Error: " + err.message + "\nCheck browser permissions.");
    }
}

function updateLanguages() {
    myLang = document.getElementById('in-call-my-lang').value;
    listenLang = document.getElementById('in-call-listen-lang').value;
    
    if (recognition) {
        recognition.stop();
        // It will restart automatically in 'onend' with new language
    }
    toggleSettings();
}

// --- 2. SPEECH RECOGNITION (The Critical Part) ---

function initSpeechRecognition() {
    // 1. Browser Check
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("⚠️ Voice AI not supported on this browser. Please use Google Chrome or Edge Desktop.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = myLang;
    recognition.continuous = true; 
    recognition.interimResults = false;

    recognition.onstart = () => console.log("🟢 Voice AI Listening...");
    
    recognition.onerror = (event) => {
        console.error("🔴 Voice AI Error:", event.error);
        if(event.error === 'not-allowed') alert("Microphone access blocked. Click the Lock icon 🔒 in the URL bar.");
    };

    recognition.onend = () => {
        console.log("🟡 Voice AI Stopped. Restarting...");
        if(!isMuted) recognition.start();
    };

    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript;
        
        console.log(`🎤 I said: ${text}`); // Debug Log
        
        // Emit to Server
        socket.emit('speak-data', {
            roomId: roomId,
            text: text,
            sourceLang: myLang,
            username: myUsername
        });
    };

    recognition.start();
}

// --- 3. RECEIVING & TRANSLATING ---

socket.on('receive-speak-data', async (data) => {
    console.log(`📩 Received from ${data.username}: ${data.text}`);
    
    let finalText = data.text; // Default to original text

    // 1. Try Translation (Only if languages differ)
    if(data.sourceLang.split('-')[0] !== listenLang.split('-')[0]) {
        try {
            finalText = await translateText(data.text, data.sourceLang, listenLang);
        } catch (err) {
            console.error("Translation Failed (Using original text):", err);
        }
    }

    // 2. Update Subtitles (Force Display)
    if(subtitlesOn) {
        const subContainer = document.getElementById('subtitle-container');
        const subText = document.getElementById('subtitle-text');
        
        // Update Content
        subText.innerHTML = `<span style="color:#2ed573; font-weight:bold;">${data.username}:</span> ${finalText}`;
        subText.style.opacity = 1;

        // Auto-Hide
        setTimeout(() => { 
            if(subText.innerHTML.includes(finalText)) subText.style.opacity = 0; 
        }, 6000);
    }

    // 3. Speak (TTS)
    speakText(finalText, listenLang);
});

async function translateText(text, source, target) {
    const src = source.split('-')[0];
    const tgt = target.split('-')[0];

    // Using MyMemory API (HTTPS)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;
    
    const res = await fetch(url);
    const data = await res.json();
    
    if(data.responseStatus === 200) return data.responseData.translatedText;
    
    console.warn("API Error:", data.responseDetails);
    return text; // Return original if API fails
}

function speakText(text, lang) {
    if(!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Stop previous
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.speak(u);
}

// --- 4. WEBRTC (Standard) ---

socket.on('user-connected', async (data) => {
    const pc = createPeer(data.userId, data.username);
    peers[data.userId] = pc;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { target: data.userId, offer: offer });
});

socket.on('offer', async (data) => {
    const pc = createPeer(data.callerId, data.callerName);
    peers[data.callerId] = pc;
    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { target: data.callerId, answer: answer });
});

socket.on('answer', async (data) => {
    if(peers[data.responderId]) await peers[data.responderId].setRemoteDescription(data.answer);
});

socket.on('ice-candidate', async (data) => {
    if(peers[data.senderId]) await peers[data.senderId].addIceCandidate(data.candidate);
});

socket.on('user-disconnected', (userId) => {
    if(peers[userId]) peers[userId].close();
    delete peers[userId];
    const el = document.getElementById(`wrapper-${userId}`);
    if(el) el.remove();
});

function createPeer(userId, username) {
    const pc = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
        if (!document.getElementById(`wrapper-${userId}`)) {
            const div = document.createElement('div');
            div.className = 'video-wrapper';
            div.id = `wrapper-${userId}`;
            
            const vid = document.createElement('video');
            vid.srcObject = event.streams[0];
            vid.autoplay = true;
            vid.playsInline = true;
            
            const lbl = document.createElement('span');
            lbl.className = 'label';
            lbl.innerText = username;

            div.appendChild(vid);
            div.appendChild(lbl);
            document.getElementById('video-grid').appendChild(div);
        }
    };
    
    pc.onicecandidate = (e) => {
        if(e.candidate) socket.emit('ice-candidate', { target: userId, candidate: e.candidate });
    };
    return pc;
}

// --- 5. CONTROLS ---

function toggleMute() {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    const btn = document.getElementById('mute-btn');
    btn.innerHTML = isMuted ? "<span>🔴</span>" : "<span>🎤</span>";
    btn.classList.toggle('active', !isMuted);
    
    if(isMuted) recognition.stop();
    else recognition.start();
}

function toggleVideo() {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks()[0].enabled = !isVideoOff;
    const btn = document.getElementById('video-btn');
    btn.innerHTML = isVideoOff ? "<span>🚫</span>" : "<span>📷</span>";
    btn.classList.toggle('danger', isVideoOff);
}

function toggleSubtitles() {
    subtitlesOn = !subtitlesOn;
    document.getElementById('cc-btn').classList.toggle('active', subtitlesOn);
}

function leaveCall() {
    location.reload();
}