# Connect this project to GitHub

Your `.gitignore` already excludes `.env`, `node_modules`, and `uploads/`, so secrets and heavy folders won’t be pushed.

---

## Step 1 — Initialize Git and commit (already done if you ran the commands below)

In a terminal, from the **backend folder** (the one with `package.json` and `src/`):

```bash
cd c:\Users\chern\Downloads\backend_AgentAi-main\backend_AgentAi-main

git init
git add .
git commit -m "Initial commit: NestJS backend with meeting agents"
```

---

## Step 2 — Create a new repository on GitHub

1. Go to **https://github.com/new**
2. **Repository name:** e.g. `backend-agent-ai` (or any name you like)
3. **Public** or **Private** — your choice
4. **Do not** check “Add a README”, “Add .gitignore”, or “Choose a license” (you already have code)
5. Click **Create repository**

---

## Step 3 — Connect and push

GitHub will show you something like “…or push an existing repository from the command line.” Use that, or run (replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub username and repo name):

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Example if your username is `ilbab` and repo is `backend-agent-ai`:

```bash
git remote add origin https://github.com/ilbab/backend-agent-ai.git
git branch -M main
git push -u origin main
```

If GitHub asks for login, use your GitHub username and a **Personal Access Token** (not your password):  
**GitHub → Settings → Developer settings → Personal access tokens → Generate new token** (with `repo` scope).

---

## Done

After `git push`, your code is on GitHub. For later changes:

```bash
git add .
git commit -m "Your message"
git push
```
