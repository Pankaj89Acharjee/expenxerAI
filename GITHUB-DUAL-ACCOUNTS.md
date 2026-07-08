# Dual GitHub Accounts Setup (Windows)

Guide for using **personal** and **office** GitHub accounts on the same Windows PC with Git Bash.

## Accounts

| Account | GitHub username | Email | Use for |
|---------|-----------------|-------|---------|
| **Personal** | `Pankaj89Acharjee` | `pankaj2007acharjee@gmail.com` | Personal repos (e.g. expenxerAI) |
| **Office** | `PankajEBIW` | `pankaj@ebiw.com` | Work repos |

---

## Two different configs (important)

Git uses **two separate** configuration layers. Do not confuse them.

| Config | File / command | What it controls | Auto-switches? |
|--------|----------------|------------------|----------------|
| **SSH config** | `~/.ssh/config` | Which **SSH key** is used → which GitHub account can **push/pull** | Yes — based on remote URL |
| **Git config** | `git config user.name` / `user.email` | **Author name/email on commits** | No — set once per repo (local) or globally |

**SSH config** = login / authentication (who can push).  
**Git config** = commit metadata (who appears as author on commits).

---

## SSH keys

Located in `C:\Users\EBIW\.ssh\`:

| Key file | Account | Created for |
|----------|---------|-------------|
| `id_ed25519` / `id_ed25519.pub` | Office (`PankajEBIW`) | `pankaj@ebiw.com` — already existed |
| `id_ed25519_personal` / `id_ed25519_personal.pub` | Personal (`Pankaj89Acharjee`) | `pankaj2007acharjee@gmail.com` |

### Create personal key (already done)

```bash
ssh-keygen -t ed25519 -C "pankaj2007acharjee@gmail.com" -f ~/.ssh/id_ed25519_personal
```

Add the **public** key (`id_ed25519_personal.pub`) to GitHub → **Pankaj89Acharjee** → Settings → SSH and GPG keys.

Do **not** add the personal key to the office account.

---

## SSH config (`~/.ssh/config`)

This file enables automatic key switching via host aliases.

```sshconfig
# Office GitHub (PankajEBIW)
Host github.com-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    AddressFamily inet

# Personal GitHub (Pankaj89Acharjee)
Host github.com-personal
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_personal
    IdentitiesOnly yes
    AddressFamily inet
```

### How auto-switching works

- Remote uses `git@github.com-personal:...` → SSH uses `id_ed25519_personal` → GitHub sees **Pankaj89Acharjee**
- Remote uses `git@github.com-work:...` → SSH uses `id_ed25519` → GitHub sees **PankajEBIW**

No manual key switching needed after the remote URL is set.

### Windows tip

The file must be named exactly `config`, **not** `config.txt`.

When saving with Notepad:

1. Set **Save as type** to **All Files (*.*)**
2. Filename: `config`
3. Verify: `ls ~/.ssh/` should show `config`, not `config.txt`

---

## Git identity

### Global (default — office)

```bash
git config --global user.email "pankaj@ebiw.com"
```

Use global for office work. Personal repos override with local config.

### Local (per repo)

Set **once per repo** so commits use the correct author.

**Personal repo (expenxerAI — already configured):**

```bash
cd /d/AndroidDevelopment/expenxerAI
git config user.name "Pankaj89Acharjee"
git config user.email "pankaj2007acharjee@gmail.com"
git remote set-url origin git@github.com-personal:Pankaj89Acharjee/expenxerAI.git
```

**Office repo:**

```bash
cd /path/to/office-repo
git config user.name "Your Office Name"
git config user.email "pankaj@ebiw.com"
git remote set-url origin git@github.com-work:ORG-OR-USER/REPO.git
```

---

## expenxerAI (this repo) — current setup

| Setting | Value |
|---------|-------|
| Remote | `git@github.com-personal:Pankaj89Acharjee/expenxerAI.git` |
| Commit author | `Pankaj89Acharjee` |
| Commit email | `pankaj2007acharjee@gmail.com` |
| Push account | `Pankaj89Acharjee` (via SSH personal key) |

---

## Verify setup

### Test SSH (both accounts)

```bash
ssh -T git@github.com-personal
# Expected: Hi Pankaj89Acharjee!

ssh -T git@github.com-work
# Expected: Hi PankajEBIW!
```

If DNS fails on office network, try:

```bash
ssh -4 -T git@github.com-personal
```

### Check current repo

```bash
git remote -v
git config --local user.name
git config --local user.email
```

### Push

```bash
git push -u origin main
```

---

## Clone new repos

```bash
# Personal
git clone git@github.com-personal:Pankaj89Acharjee/REPO.git
cd REPO
git config user.name "Pankaj89Acharjee"
git config user.email "pankaj2007acharjee@gmail.com"

# Office
git clone git@github.com-work:ORG/REPO.git
cd REPO
git config user.name "Your Office Name"
git config user.email "pankaj@ebiw.com"
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `Could not resolve hostname github.com-personal` | SSH config missing or wrong filename | Ensure `~/.ssh/config` exists (not `config.txt`) |
| `Could not resolve hostname github.com` | DNS / network (often office VPN) | Try `ssh -4 -T ...`, flush DNS, or test on another network |
| `Permission denied to PankajEBIW` on personal repo | Remote still uses HTTPS or wrong SSH host | Use `git@github.com-personal:...` not `https://github.com/...` |
| Commits show office email on personal repo | Missing local git config | Set `git config user.email` locally in that repo |
| `gh: command not found` | GitHub CLI not installed | Use SSH remotes instead, or install [GitHub CLI](https://cli.github.com/) |

---

## Quick reference

```
git push flow:
  remote URL (github.com-personal vs github.com-work)
    → ~/.ssh/config picks key
      → GitHub authenticates correct account

git commit flow:
  local git config (or global if no local override)
    → commit author name/email on GitHub history
```

---

*Setup completed: July 2026 — Windows 10, Git Bash*
