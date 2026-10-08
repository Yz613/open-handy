# Contributing to OpenHandy

Thank you for your interest in contributing to OpenHandy! 🎉

OpenHandy is an open-source, universal AI speech-to-text dictation tool built for macOS using Electron, React, and Swift.

---

## 🛠️ Prerequisites

- **macOS** 13+ (Ventura, Sonoma, Sequoia, etc.)
- **Node.js** 18+ and **npm**
- **Xcode Command Line Tools** (for compiling Swift native helper utilities):
  ```bash
  xcode-select --install
  ```

---

## 💻 Local Development Setup

1. **Fork & Clone** the repository:
   ```bash
   git clone https://github.com/<your-username>/open-handy.git
   cd open-handy
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build native Swift helpers and assets**:
   ```bash
   npm run build
   ```

4. **Start the application in development mode**:
   ```bash
   npm run dev
   ```

---

## 🏗️ Project Architecture

- **`electron/`**: Electron main process, system tray setup, floating HUD overlay, IPC handlers, and AI provider clients (STT and LLM integrations).
- **`native/`**: Swift command-line tools:
  - `native/keylistener.swift`: Low-level macOS `CGEventTap` keyboard hook for low-latency Push-to-Talk / toggle shortcuts and active element detection.
  - `native/localstt.swift`: Native Apple Speech framework fallback.
- **`src/`**: React + Tailwind UI:
  - `src/components/`: Settings panes, provider configuration, pipeline routing, dictation history, and usage stats.
  - `src/hud.tsx`: Lightweight HUD floating pill with live audio visualizer.
- **`worker/`**: Optional standalone Cloudflare Worker for edge-GPU serverless dictation.

---

## 🧪 Testing and Quality Checks

Before opening a pull request, please run:

```bash
# Type-check and full build
npm run build

# Run pipeline unit tests
npm test
```

---

## 📦 Packaging a Release

To compile a standalone macOS `.dmg` and `.zip`:

```bash
npm run dist:mac
```
The packaged app will be generated in the `release/` directory.

---

## 🤝 Code of Conduct & Pull Requests

1. Fork the repo and create your feature branch: `git checkout -b feature/amazing-feature`.
2. Commit your changes with clear, descriptive commit messages.
3. Push to your branch: `git push origin feature/amazing-feature`.
4. Open a Pull Request against `main`.
