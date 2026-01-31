const socket = io();

// Variables
let localStream;
let myUsername = "";
let roomId = "";
let myLang = "en-US";
let listenLang = "en-US";
let recognition;
let subtitlesOn = true;
let isMuted = false;
let isVideoOff = false;
const peers = {};

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- 1. SETUP ---

function goToSetup() {
    const nameInput = document.getElementById('username');
    if (!nameInput.value) return alert("Please enter your name");
    myUsername = nameInput.value;
    switchScreen('login-screen', 'setup-screen');
}

function switchScreen(from, to) {
    document.getElementById(from).classList.remove('active');
    document.getElementById(to).classList.add('active');
}

function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
}

async function joinRoom() {
    roomId = document.getElementById('room-id').value;
    if (!roomId) return alert("Enter Room Code");

    // Get Languages
    myLang = document.getElementById('setup-my-lang').value;
    listenLang = document.getElementById('setup-listen-lang').value;
    
    // Sync to in-call menus
    document.getElementById('in-call-my-lang').value = myLang;
    document.getElementById('in-call-listen-lang').value = listenLang;

    // UI Change
    switchScreen('setup-screen', 'call-screen');
    document.getElementById('display-room-id').innerText = roomId;
    document.querySelector('#local-wrapper .label').innerText = "You";

    // 1. Get Camera/Mic
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
        if (err.name === 'NotAllowedError') {
            alert("⚠️ Permission Denied: Please click the lock icon 🔒 near the URL and allow Camera/Microphone.");
        } else if (err.name === 'NotFoundError') {
            alert("⚠️ No Camera/Mic found on this device.");
        } else if (err.name === 'NotReadableError') {
            alert("⚠️ Camera is being used by another app. Please close other apps.");
        } else {
            alert("Error accessing media: " + err.message);
        }
    }
}

function updateLanguages() {
    myLang = document.getElementById('in-call-my-lang').value;
    listenLang = document.getElementById('in-call-listen-lang').value;
    
    if (recognition) {
        recognition.stop(); // Restart with new lang
    }
    toggleSettings(); // Close menu
}

// --- 2. WEBRTC (VIDEO) ---

socket.on('user-connected', async (data) => {
    const userId = data.userId;
    const pc = createPeerConnection(userId, data.username);
    peers[userId] = pc;
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { target: userId, offer: offer });
});

socket.on('offer', async (data) => {
    const pc = createPeerConnection(data.callerId, data.callerName);
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

function createPeerConnection(userId, username) {
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
    
    pc.onicecandidate = (event) => {
        if(event.candidate) socket.emit('ice-candidate', { target: userId, candidate: event.candidate });
    };

    return pc;
}

// --- 3. SPEECH & TRANSLATION ---

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("⚠️ Your browser does not support Speech Recognition. Please use Google Chrome.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = myLang;

    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript;
        
        console.log("Speaking:", text);
        socket.emit('speak-data', {
            roomId: roomId,
            text: text,
            sourceLang: myLang,
            username: myUsername
        });
    };

    recognition.onend = () => {
        // Auto-restart to keep listening
        if(!isMuted) {
            recognition.lang = myLang;
            recognition.start();
        }
    };

    recognition.start();
}

socket.on('receive-speak-data', async (data) => {
    // 1. Translate
    const translated = await translateText(data.text, data.sourceLang, listenLang);
    
    // 2. Display Subtitle
    if(subtitlesOn) {
        const sub = document.getElementById('subtitle-text');
        sub.innerHTML = `<span style="color:#2ed573">${data.username}:</span> ${translated}`;
        sub.style.opacity = 1;
        
        // Hide after 5s
        setTimeout(() => { if(sub.innerHTML.includes(translated)) sub.style.opacity = 0; }, 5000);
    }

    // 3. Speak
    speakText(translated, listenLang);
});

async function translateText(text, source, target) {
    const src = source.split('-')[0];
    const tgt = target.split('-')[0];
    if(src === tgt) return text;

    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.responseData.translatedText;
    } catch (e) {
        console.error("Translation failed:", e);
        return text;
    }
}

function speakText(text, lang) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.speak(u);
}

// --- 4. CONTROLS ---

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
    btn.innerHTML = isVideoOff ? "<span>�</span>" : "<span>📷</span>";
    btn.classList.toggle('danger', isVideoOff);
}

function toggleSubtitles() {
    subtitlesOn = !subtitlesOn;
    const btn = document.getElementById('cc-btn');
    btn.classList.toggle('active', subtitlesOn);
}

function leaveCall() {
    window.location.reload();
}
