# OpenHandy 🎙️

An open-source, universal AI speech-to-text alternative to [Handy.computer](https://handy.computer/) for macOS.

Plug in any API key from any model and dictate directly into any application on your Mac with a single keystroke.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![macOS](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)]()

---

## ✨ Features

- **Menu Bar Integration**: Sits cleanly in your macOS menu bar with quick mode switching, settings, and recording controls.
- **Floating HUD Overlay**: Non-activating, transparent floating pill window with a live audio waveform visualizer, elapsed timer, and status notifications that hovers on screen without stealing focus from your typing cursor.
- **Plug in Any Model / Any API Key**:
  - **Microsoft Azure OpenAI**: Enterprise Whisper STT deployments & GPT-4o post-processing.
  - **Vercel AI Gateway / Microsoft MAI**: Universal AI gateway with custom base URL and model routing.
  - **Groq**: Ultra-fast Whisper Large v3 / Turbo (~200ms latency) & Llama 3.3 70B for instant text polishing.
  - **OpenAI**: Whisper-1 audio transcription & GPT-4o / GPT-4o-mini.
  - **Google Gemini**: Gemini 2.0 Flash / 1.5 Flash multimodal audio ingestion or text post-processing.
  - **Anthropic Claude**: Claude 3.5 Sonnet / Haiku / Claude 3.7 Sonnet for text cleanup and prompt formatting.
  - **Deepgram**: Nova-2 & Nova-3 dedicated speech models.
  - **OpenRouter**: Access 100+ models with one API key.
  - **Cloudflare Workers AI & AI Gateway**: 100% serverless Whisper STT (`@cf/openai/whisper`) & Llama 3.3 on Cloudflare's edge GPUs — zero servers to spin up or manage.
  - **Apple Local Speech (Offline)**: Built-in macOS native Speech framework fallback.
  - **Custom / Local OpenAI-Compatible Server**: Connect to Ollama, LM Studio, vLLM, Together AI, or your own local Whisper server.
- **Dictation Usage & Productivity Meter**:
  - Live statistics tracking your total dictations, total words spoken, and estimated time saved compared to manual typing (~40 wpm vs ~150 wpm dictation speed).
- **Interactive Hotkey Recorder**: Fully customizable global shortcut in Settings (defaults to `Option + Space`), supporting both **Toggle** (tap to start / tap to stop) and **Push-to-Talk**.
- **Auto-Paste & Focused Application Target**:
  - Automatically targets the active application and pastes the final text using simulated `Cmd+V`.
  - Dedicated toggle for whether transcriptions are also copied to your macOS clipboard.
- **Prompt Presets**:
  - **Clean & Polish (Default)**: Strips filler words (*um, uh, like, you know*), false starts, and fixes punctuation without altering your voice.
  - **Raw Transcript**: Exact verbatim transcription.
  - **Professional Email**: Formats dictation into a polite business email.
  - **Meeting Notes**: Formats spoken points into clean bullet points and action items.
  - **Developer & Technical**: Formats code identifiers, markdown code blocks, and terminal commands.
  - **Custom Presets**: Create unlimited custom system prompts!
- **Searchable Dictation History**: Full local library of all past transcriptions with word count, duration, models used, and one-click copy.
- **Audio Feedback**: Built-in synthesized chimes on start, stop, and successful paste.

---

## 🚀 Getting Started

### Prerequisites

- **macOS** 13+ (Ventura, Sonoma, Sequoia)
- **Node.js** 18+ and **npm**
- **Xcode Command Line Tools** (required to compile the native keyboard hook helper):
  ```bash
  xcode-select --install
  ```

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Yz613/open-handy.git
   cd open-handy
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build native helpers & assets:**
   ```bash
   npm run build
   ```

4. **Launch the application:**
   ```bash
   npm start
   ```

*(For development with hot reload, use `npm run dev`.)*

---

## ⚙️ Configuration & API Keys

OpenHandy does not ship with hardcoded API keys. You can configure your keys in one of two ways:

1. **In-App Settings UI (Recommended)**:
   - On first launch, the Settings window will open automatically.
   - Go to **API Keys & Providers** and paste your API key for whichever service you want to use (e.g., Groq, OpenAI, Gemini, Claude, etc.).
   - In **Pipeline & Models**, select which provider to use for Speech-to-Text and which for AI text polishing.

2. **Local `.env` File**:
   - You can copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Add your keys (e.g., `AI_GATEWAY_API_KEY=your_key_here`). Note: `.env` is ignored by Git and never committed.

---

## 🔐 Required macOS Permissions

To allow OpenHandy to listen to global shortcuts and automatically paste transcribed text into whichever app you are typing in:

1. **Accessibility Permission**:
   - Go to **System Settings → Privacy & Security → Accessibility**.
   - Enable **OpenHandy** (or your terminal if running during development).
2. **Microphone Permission**:
   - macOS will prompt you for microphone access on your first recording. Grant permission so OpenHandy can capture your audio.

---

## ⌨️ How to Use

1. Focus any text field in any app (Slack, Notes, VS Code, Browser, Messages, Word, etc.).
2. Hold or tap your global shortcut (default: `⌥ Space` or `Option + Space`).
3. The floating HUD pill will appear at the bottom of your screen with an active audio waveform.
4. Speak your thoughts.
5. Release or tap the shortcut to finish.
6. The audio is transcribed, polished according to your active preset, and automatically typed into your focused text field!

---

## 📦 Building Standalone App / DMG

To generate a standalone macOS `.app` and `.dmg` for distribution:

```bash
npm run dist:mac
```

The resulting packages will be created in the `release/` directory.

---

## ☁️ Optional Cloudflare Serverless Deployment

If you want a completely serverless backend with **zero servers to spin up or maintain**:

See the [worker/README.md](worker/README.md) for full instructions on deploying your own edge GPU worker with:

```bash
npm run deploy:worker
```

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!
Please check out [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).
