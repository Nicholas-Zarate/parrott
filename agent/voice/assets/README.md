# Voice assets

**Primary path:** Text-to-speech via ElevenLabs (see `voice/tts.js`). No file is required for the squawk tool.

**Optional:** Add a local audio file (e.g. `squawk.mp3`) if you want to use `playInVoiceChannel(..., { type: 'file', path: '...' })` elsewhere. The join_voice_and_squawk tool uses TTS only.
