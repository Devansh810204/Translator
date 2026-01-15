# VoiceBridge - Real-Time Video Translator

A real-time video calling application with automatic voice translation capabilities. Connect with people globally and break language barriers instantly.

## Features

- 🎥 **Real-time Video Calling** - WebRTC-powered peer-to-peer video calls
- 🗣️ **Speech Recognition** - Automatic speech-to-text conversion
- 🌍 **Multi-Language Translation** - Support for 6+ languages (English, Spanish, French, Hindi, German, Japanese)
- 🔊 **Text-to-Speech** - Translated text spoken in target language
- 📝 **Live Subtitles** - Toggle-able subtitle display
- 🎤 **Audio Controls** - Mute/unmute functionality
- 📱 **Cross-Platform** - Works on desktop and mobile devices

## Technologies Used

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Real-time Communication**: WebRTC, Socket.io
- **Speech APIs**: Web Speech API, Speech Synthesis API
- **Translation**: MyMemory Translation API

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/voice-translator.git
cd voice-translator
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
- Local: `http://localhost:3000`
- Network: `http://YOUR_LOCAL_IP:3000`

## Usage

1. **Login**: Enter any username to continue
2. **Setup**: 
   - Enter a room name
   - Select your spoken language
   - Select target language for translation
3. **Start Call**: Join the video room
4. **Communicate**: Speak naturally - your speech will be translated in real-time

## Language Support

- English (en-US)
- Spanish (es-ES)
- French (fr-FR)
- Hindi (hi-IN)
- German (de-DE)
- Japanese (ja-JP)

## Deployment

### For Production Use:

1. **Frontend**: Deploy to Vercel, Netlify, or GitHub Pages
2. **Backend**: Deploy to Heroku, Railway, or Render
3. **Environment**: Ensure HTTPS is enabled for microphone access

### Environment Variables:
```bash
PORT=3000
NODE_ENV=production
```

## API Integration

The app uses [MyMemory Translation API](https://api.mymemory.translated.net) for free translation services. For production use, consider upgrading to their premium API for higher limits.

## Browser Compatibility

- ✅ Chrome/Chromium (Recommended)
- ✅ Firefox
- ✅ Edge
- ⚠️ Safari (Limited WebRTC support)

## Security Notes

- HTTPS required for microphone/camera access in production
- SSL certificates automatically handled by deployment platforms
- No sensitive data stored locally

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
- Open an issue on GitHub
- Check the troubleshooting section below

## Troubleshooting

**Microphone not working?**
- Ensure HTTPS is enabled (production) or use localhost (development)
- Check browser permissions for microphone access
- Try Chrome with insecure content enabled for testing

**Video not connecting?**
- Both users need stable internet connection
- Check firewall settings
- Ensure WebRTC ports are not blocked

**Translation not working?**
- Check internet connection
- Verify MyMemory API is accessible
- Try different language combinations

---

Made with ❤️ for breaking language barriers globally.
