# OpenHandy — Cloudflare Serverless Worker

This worker allows you to run **Whisper Speech-to-Text** and **Llama 3.3 LLM** post-processing directly on **Cloudflare's serverless GPU edge network**, meaning **zero servers to spin up or maintain**!

---

### Features
- 🚀 **100% Serverless**: Runs on Cloudflare Workers AI edge GPUs.
- ⚡️ **Speech-to-Text**: `@cf/openai/whisper` (or `@cf/openai/whisper-large-v3-turbo`).
- 🧠 **LLM Polish & Prompts**: `@cf/meta/llama-3.3-70b-instruct`.
- 🌐 **Global Low Latency**: Runs in 300+ Cloudflare edge data centers worldwide.

---

### 1-Minute Deployment

1. Make sure you have a Cloudflare account.
2. In your terminal, deploy directly with Wrangler:
   ```bash
   cd worker
   npx wrangler deploy
   ```
3. When prompted, log in to your Cloudflare account in your browser.
4. Wrangler will output your worker's live public URL, for example:
   ```
   https://openhandy-ai-worker.<your-subdomain>.workers.dev
   ```

---

### How to use in OpenHandy

You have two easy ways to use Cloudflare in OpenHandy:

#### Option A: Direct Cloudflare Workers AI (Built into OpenHandy)
1. Open **OpenHandy Settings** $\rightarrow$ **API Keys & Providers** $\rightarrow$ **Cloudflare Workers AI**.
2. Enter your Cloudflare **Account ID** (found in your dashboard URL) and **API Token** (with Workers AI Read/Edit permissions).
3. In **Pipeline & Models**, select **Cloudflare Workers AI** as your STT and/or LLM provider.

#### Option B: Using Your Deployed Worker URL as a Custom Provider
1. Open **OpenHandy Settings** $\rightarrow$ **API Keys & Providers** $\rightarrow$ **Custom / Local Server**.
2. Set **Server Base URL** to your worker URL:
   ```
   https://openhandy-ai-worker.<your-subdomain>.workers.dev
   ```
3. In **Pipeline & Models**, select **Custom / Local Server**.
