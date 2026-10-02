# OpenHandy 🎙️

An open-source, universal AI speech-to-text alternative to [Handy.computer](https://handy.computer/) for macOS.

Plug in any API key from any model and dictate directly into any application on your Mac with a single keystroke.

---

## ✨ Features

- **Menu Bar Integration**: Sits cleanly in your macOS menu bar with quick mode switching, settings, and recording controls.
- **Floating HUD Overlay**: Non-activating, transparent floating pill window with a live audio waveform visualizer, elapsed timer, and status notifications that hovers on screen without stealing focus from your typing cursor.
- **Plug in Any Model / Any API Key**:
  - **Microsoft Azure OpenAI**: Enterprise Whisper STT deployments & GPT-4o post-processing.
  - **Vercel AI Gateway / Versacell**: Universal AI gateway with custom base URL and model routing.
  - **Groq**: Ultra-fast Whisper Large v3 / Turbo (~200ms latency) & Llama 3.3 70B for instant text polishing.
  - **OpenAI**: Whisper-1 audio transcription & GPT-4o / GPT-4o-mini.
  - **Google Gemini**: Gemini 2.0 Flash / 1.5 Flash multimodal audio ingestion or text post-processing.
  - **Anthropic Claude**: Claude 3.5 Sonnet / Haiku / Claude 3.7 Sonnet for text cleanup and prompt formatting.
  - **Deepgram**: Nova-2 & Nova-3 dedicated speech models.
  - **OpenRouter**: Access 100+ models with one API key.
  - **Cloudflare Workers AI & AI Gateway**: 100% serverless Whisper STT (`@cf/openai/whisper`) & Llama 3.3 on Cloudflare's edge GPUs — zero servers to spin up or manage.
  - **Custom / Local OpenAI-Compatible Server**: Connect to Ollama, LM Studio, vLLM, Together AI, or your own local Whisper server.
- **Interactive Hotkey Recorder**: Fully customizable global shortcut in Settings (defaults to `Option + Space`), supporting both **Toggle** (tap to start / tap to stop) and **Push-to-Talk**.
- **Auto-Paste & Output Controls**:
  - Automatically focuses the active application and pastes the final text using simulated `Cmd+V`.
  - Dedicated toggle for whether transcriptions are also copied to your macOS clipboard.
- **Prompt Presets**:
  - **Clean & Polish (Default)**: Removes filler words (*um, uh, like, you know*), fixes punctuation and capitalization without changing your authentic voice.
  - **Raw Transcript**: Exact verbatim transcription.
  - **Professional Email**: Formats dictation into a polite business email.
  - **Meeting Notes**: Formats spoken points into clean bullet points and action items.
  - **Developer & Technical**: Formats code identifiers, markdown code blocks, and terminal commands.
  - **Custom Presets**: Create unlimited custom system prompts!
- **Searchable Dictation History**: Full local library of all past transcriptions with word count, duration, models used, and one-click copy.
- **Audio Feedback**: Built-in synthesized chimes on start, stop, and successful paste.

---

## 🚀 Quick Start

### 1. Install & Build
```bash
npm install
npm run build
```

### 2. Launch App
```bash
npm start
```
The app will appear in your macOS menu bar. On first launch, the Settings window will open automatically so you can add your preferred API key (e.g. Azure, Groq, OpenAI, or Gemini).

### 3. Grant macOS Accessibility Permission
To allow OpenHandy to automatically paste text into other apps (like Slack, Notes, Chrome, or VS Code), grant Accessibility permission in:
**System Settings → Privacy & Security → Accessibility → OpenHandy**

---

## ⌨️ How to Use

1. Focus any text field in any app (Slack, Notes, VS Code, Browser, Word, etc.).
2. Press your global shortcut (default: `⌥ Space` or `Option + Space`).
3. The floating HUD pill will appear at the bottom of your screen with an active audio waveform.
4. Speak your thoughts.
5. Press the shortcut again to stop.
6. The audio is transcribed, polished (if enabled), and automatically typed into your active field!

---

## ☁️ Zero-Server Cloudflare Deployment

If you want a completely serverless backend with **zero servers to spin up or maintain**:

### Option 1: Direct Cloudflare Workers AI
1. Go to OpenHandy **Settings** → **API Keys & Providers** → **Cloudflare Workers AI**.
2. Enter your Cloudflare **Account ID** and **API Token**.
3. Select **Cloudflare Workers AI** in **Pipeline & Models**. Transcription runs directly on Cloudflare edge GPUs!

### Option 2: Deploy your own Cloudflare Worker
Deploy the included serverless worker in 1 step:
```bash
npm run deploy:worker
```
This deploys a serverless endpoint on Cloudflare with endpoints for `/transcribe` (Whisper) and `/process` (Llama 3.3).
