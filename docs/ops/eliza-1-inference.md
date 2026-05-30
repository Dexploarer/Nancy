# Eliza-1 Inference Droplet Runbook

## ⚠️ License Finding — Read Before Proceeding

The `elizaos/eliza-1` model on Hugging Face carries **`license: other`** (non-standard).
The repository root contains only `.gitattributes`, `README.md`, and `upload-manifest.json` — **no LICENSE file exists in the model repo**, and the model card itself states no specific terms. Commercial use and self-hosted inference are therefore **NOT positively confirmed**.

The MIT license found in the `elizaOS/eliza` GitHub repository covers the agent *software framework*, not the eliza-1 model *weights*. Do not rely on that license to authorise weight-based inference.

**Until the eliza-1 model license is clarified by elizaOS/Eliza Labs:**
- Leave `ELIZA_MODEL_URL` **UNSET** in production.
- The bot operates fully without it: the `/nancy` command uses the deterministic templated fallback in `explanationService` and all tests pass.
- Monitor [https://huggingface.co/elizaos/eliza-1](https://huggingface.co/elizaos/eliza-1) and the [elizaOS GitHub](https://github.com/elizaOS/eliza) for a formal license update before enabling inference.

---

## Overview

This runbook describes how to optionally provision a CPU droplet on DigitalOcean and run a
[llama.cpp](https://github.com/ggml-org/llama.cpp) OpenAI-compatible inference server for the
eliza-1 4B model. This server is consumed by the `/nancy` command's `explanationService` when
`ELIZA_MODEL_URL` is set on the App Platform app.

The Nancy bot itself runs on a **DigitalOcean App Platform `basic-xxs` instance**. The model
runs on a **separate CPU droplet**; the App Platform app calls it over HTTPS.

Because `/nancy` verdict text is generated lazily (on detail-open, per token), CPU-level latency
(~2–5 s for a short paragraph) is acceptable.

---

## 1. Provision the Droplet

| Setting      | Value                                              |
|--------------|----------------------------------------------------|
| Droplet type | CPU-Optimized (dedicated vCPU)                     |
| Size         | ≥ 8 vCPU / 16 GB RAM (e.g. `c-8`, ~$84/mo)        |
| Region       | Same as the App Platform app — `sfo` (San Francisco) |
| OS           | Ubuntu 24.04 LTS                                   |
| SSH key      | Add your operator key at creation                  |

> A shared-CPU droplet (General Purpose) can work for low-traffic inference but expect slower
> cold-start and higher per-request latency. The CPU-Optimized tier is recommended.

---

## 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Re-login or: newgrp docker
docker --version
```

---

## 3. Download the Model Weights

Confirm the exact GGUF filename before running these commands — visit
`https://huggingface.co/elizaos/eliza-1/tree/main/bundles/4b/` and copy the Q4\_K\_M file name.
The expected filename is `eliza-1-4b-Q4_K_M.gguf` but verify in the repo.

```bash
mkdir -p /opt/eliza && cd /opt/eliza

# Install huggingface-cli (one-time)
pip install --break-system-packages huggingface_hub

# Download — replace the filename below if it differs in the repo
huggingface-cli download elizaos/eliza-1 bundles/4b/eliza-1-4b-Q4_K_M.gguf \
  --local-dir /opt/eliza --local-dir-use-symlinks False
```

---

## 4. Run the llama.cpp Server

```bash
# Pick a strong random key for the API
export ELIZA_KEY=$(openssl rand -hex 32)
echo "ELIZA_KEY=$ELIZA_KEY"   # save this — you'll need it for Step 6

docker run -d --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v /opt/eliza:/models \
  ghcr.io/ggml-org/llama.cpp:server \
  -m /models/eliza-1-4b-Q4_K_M.gguf \
  -c 8192 \
  --host 0.0.0.0 \
  --port 8080 \
  --api-key "$ELIZA_KEY"
```

The server listens on `127.0.0.1:8080` only (localhost). Confirm it is healthy:

```bash
curl -s http://127.0.0.1:8080/health
```

Expected: `{"status":"ok"}`.

---

## 5. Security: Firewall + TLS Reverse Proxy

**Never expose port 8080 publicly.** Two acceptable approaches:

### Option A — DigitalOcean Private Network + App Platform internal connectivity

If the App Platform app and the droplet are in the same VPC (same region), route traffic over
the private network interface (`10.x.x.x`). Add a firewall rule allowing inbound TCP 8080 from
the App Platform egress CIDR only. This avoids a separate proxy.

### Option B — Nginx + Let's Encrypt (recommended for simplicity)

```bash
apt install -y nginx certbot python3-certbot-nginx
# Point a subdomain (e.g. eliza.yourdomain.com) to the droplet's public IP first, then:
certbot --nginx -d eliza.yourdomain.com

# /etc/nginx/sites-available/eliza (example)
# server {
#   listen 443 ssl;
#   server_name eliza.yourdomain.com;
#   location / {
#     proxy_pass http://127.0.0.1:8080;
#     proxy_set_header Authorization $http_authorization;
#   }
# }
```

Set the DigitalOcean cloud firewall to allow **inbound TCP 443** only from the App Platform
outbound IP range (find it in the App Platform dashboard under Networking → Outbound IPs). Block
all other inbound traffic to port 443 and ensure port 8080 is not exposed externally.

---

## 6. Configure the App Platform App

In the **App Platform dashboard** (do NOT commit these to `.do/app.yaml` or any repo file):

| Variable             | Value                                              | Type   |
|----------------------|----------------------------------------------------|--------|
| `ELIZA_MODEL_URL`    | `https://eliza.yourdomain.com/v1/chat/completions` | Plain  |
| `ELIZA_MODEL_NAME`   | `eliza-1`                                          | Plain  |
| `ELIZA_MODEL_API_KEY`| `<the ELIZA_KEY from Step 4>`                      | Secret |

After saving, the App Platform app will restart and `/nancy` will use the live model.

---

## 7. Validate End-to-End

```bash
# From a machine with access to the droplet proxy, or from inside the App Platform app:
curl -s https://eliza.yourdomain.com/v1/chat/completions \
  -H "Authorization: Bearer $ELIZA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"eliza-1","messages":[{"role":"user","content":"Hello"}],"max_tokens":32}'
```

Then run `/nancy` in a Telegram group linked to the bot and tap a detail row — the verdict text
should appear within a few seconds.

---

## 8. Ongoing Maintenance

- **Restarts**: `docker ps` and `docker restart <id>` as needed; `--restart unless-stopped` covers reboots.
- **Model updates**: Re-download the GGUF from the HF repo; stop/remove the container, replace the file, re-run Step 4.
- **License re-check**: Before enabling `ELIZA_MODEL_URL` in production, confirm the eliza-1 model license permits commercial self-hosted inference (see the warning at the top of this document).
- **Cost**: ~$84/month for a `c-8` CPU-Optimized droplet. Destroy it when not needed.
