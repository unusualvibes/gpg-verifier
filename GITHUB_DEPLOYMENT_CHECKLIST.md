# GitHub Pages Deployment Checklist

Use this checklist to prepare your repository for GitHub Pages deployment.

## ✅ Pre-Deployment Checklist

### Files to Include (Must Commit)

**Core Application:**
- [x] `index.html` - Main entry point
- [x] `app.js` - Application logic
- [x] `styles.css` - Styling
- [x] `checksum-addon.js` - Checksum verification
- [x] `openpgp.min.js` - OpenPGP.js library v6.3.0
- [x] `hash-wasm-sha256.min.js` - WebAssembly SHA-256
- [x] `sha256.min.js` - JavaScript SHA-256 fallback

**Downloadable Package:**
- [x] `gpg-verifier-offline-v1.0.0.zip` - Offline package for download

**Configuration:**
- [x] `.nojekyll` - Disables Jekyll processing
- [x] `.github/workflows/deploy.yml` - Auto-deployment workflow
- [x] `.gitignore` - Excludes unnecessary files

**Documentation:**
- [x] `README.md` - Project documentation
- [x] `GITHUB_PAGES.md` - Deployment guide
- [x] `SECURITY.md` - Security information
- [x] `TESTING.md` - Testing documentation
- [x] `QUICKSTART.md` - Quick start guide
- [x] `EXAMPLES.md` - Usage examples
- [x] `LICENSE` - MIT License

**Testing (Optional but Recommended):**
- [x] `test/test.js` - Unit tests
- [x] `test/e2e-tests.js` - End-to-end tests
- [x] `test/test-helpers.js` - Test utilities
- [x] `test/run-tests.sh` - Test runner script
- [x] `package.json` - NPM configuration
- [x] `test/test-data/` - Small test files (<1MB each)

### Files to Exclude (In .gitignore)

**Build/Development:**
- [ ] `node_modules/` - NPM dependencies (too large)
- [ ] `package-lock.json` - Auto-generated (optional)

**Large Test Files:**
- [ ] `test/test-data/test-large-*.bin` - Large test files
- [ ] `test/test-data/*.bin` - Binary test files (>1MB)
- [ ] `test/test-data/*.iso` - ISO test files
- [ ] `*.iso` - Any ISO files

**Temporary/Backup:**
- [ ] `*.bak` - Backup files
- [ ] `*.tmp` - Temporary files
- [ ] `*~` - Editor backups
- [ ] `.DS_Store` - macOS files
- [ ] `Thumbs.db` - Windows files

## 📋 Deployment Steps

### 1. Verify File Structure

```bash
# Check that all required files exist
ls -la index.html app.js styles.css openpgp.min.js
ls -la .nojekyll .github/workflows/deploy.yml
ls -la gpg-verifier-offline-v1.0.0.zip
```

### 2. Verify Asset Paths

```bash
# All paths should be relative (no http:// or https:// for local files)
grep -E "src=|href=" index.html | grep -v "openpgpjs.org"
```

Expected output should show only relative paths like:
- `href="styles.css?v=1.0.0"`
- `src="app.js?v=5.0.3"`
- `href="gpg-verifier-offline-v1.0.0.zip"`

### 3. Check Repository Size

```bash
# Total size should be under 1GB (preferably under 100MB)
du -sh .
```

Current project size: ~15MB ✓

### 4. Create GitHub Repository

1. **On GitHub.com:**
   - Click "New Repository"
   - Name: `gpg-verifier` (or your preferred name)
   - Description: "Client-side GPG signature verifier"
   - Public repository (required for free GitHub Pages)
   - Don't initialize with README (we already have one)

2. **Locally:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - GPG Verifier v1.0.0"
   git branch -M main
   git remote add origin https://github.com/[username]/[repo-name].git
   git push -u origin main
   ```

### 5. Enable GitHub Pages

1. Go to repository **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Click **Save**

### 6. Verify Deployment

1. **Check GitHub Actions:**
   - Go to **Actions** tab
   - Wait for deployment workflow to complete (1-2 minutes)
   - Verify green checkmark

2. **Test the site:**
   - Visit: `https://[username].github.io/[repo-name]/`
   - Verify the application loads
   - Test GPG verification
   - Test offline package download

## 🔍 Quick Verification

Run these commands before pushing:

```bash
# 1. Check .gitignore is updated
cat .gitignore

# 2. Verify no large files will be committed
find . -type f -size +10M -not -path "./node_modules/*" -not -path "./.git/*"

# 3. Check what will be committed
git status

# 4. View file sizes
ls -lh *.js *.css *.html *.zip

# 5. Test locally first
python3 -m http.server 8000
# Open http://localhost:8000 and test
```

## ⚠️ Common Issues

### Issue: Files too large for GitHub

**Solution:** Check .gitignore excludes large files:
```bash
# Remove large files from git if accidentally committed
git rm --cached test-large-file.bin
git commit -m "Remove large test files"
```

### Issue: 404 errors after deployment

**Solution:** Verify .nojekyll file exists:
```bash
ls -la .nojekyll
git add .nojekyll
git commit -m "Add .nojekyll"
git push
```

### Issue: Offline package download fails

**Solution:** Verify package is committed:
```bash
ls -lh gpg-verifier-offline-v1.0.0.zip
git add gpg-verifier-offline-v1.0.0.zip
git commit -m "Add offline package"
git push
```

## ✨ Post-Deployment

After successful deployment:

1. **Update README** with live URL
2. **Add repository description** on GitHub
3. **Add topics/tags** for discoverability
4. **Consider adding:**
   - GitHub repository description
   - Website link in repository settings
   - Topics: `gpg`, `openpgp`, `signature-verification`, `security`

## 🎯 Success Criteria

- [ ] Site loads at `https://[username].github.io/[repo-name]/`
- [ ] All features work (GPG verification, checksum verification)
- [ ] Offline package downloads successfully
- [ ] No console errors in browser
- [ ] HTTPS is enabled (automatic for *.github.io)
- [ ] Site is responsive on mobile devices

---

**Ready to deploy?** Follow the checklist above! 🚀
