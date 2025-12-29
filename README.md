# 🔐 GPG Verifier

**Version 1.0.0** - Production release

A secure, client-side web application for verifying GPG signatures without polluting your local keychain. Perfect for verifying Linux ISO downloads, software releases, and other signed files.

## Features

- 🔒 **100% client-side** - All processing happens in your browser
- 🛡️ **Zero external dependencies** - OpenPGP.js v6.3.0 included locally
- ✈️ **Fully offline capable** - Works completely air-gapped
- 📝 **GPG signature verification** - Clearsigned, detached, and inline signatures
- ✅ **Checksum verification** - SHA-256 with WebAssembly (~360 MB/s)
- 📦 **Multiple file queue** - Verify multiple checksums sequentially
- 🎯 **Auto-verification** - Automatic verification when files are loaded
- 🎨 **Modern interface** - Collapsible sections, progress bars, responsive design

## Quick Start

### Use Locally

```bash
# Serve with any static web server
python3 -m http.server 8000

# Or open index.html directly in your browser
```

### Deploy to GitHub Pages (Free Hosting)

1. Fork or upload this repository to GitHub
2. Go to **Settings** → **Pages** → Select **GitHub Actions**
3. Push to main branch
4. Access at: `https://[username].github.io/[repository-name]/`

See [GITHUB_PAGES.md](GITHUB_PAGES.md) for complete deployment guide.

## How It Works

1. **Upload GPG public key** (file or paste text)
2. **Upload signed file** (detached signature, clearsigned, or inline)
3. **Verify** - Results appear automatically

For checksum verification:
1. **Upload checksum file** (SHA256SUMS format)
2. **Upload files to verify** (single or multiple)
3. **Watch progress** - Queue processes files sequentially

## Security

**Client-side only architecture:**
- No server-side processing
- No data transmission - files never leave your computer
- No tracking, cookies, or persistent storage
- All dependencies self-hosted (no CDN reliance)
- Strict Content Security Policy blocks external resources

**Trust model:**
- ✅ Trust: This code (open source), OpenPGP.js (industry standard), your browser
- ❌ Don't need to trust: Any server, API, cloud service, or CDN

**Offline usage:**
1. Download the offline package: `gpg-verifier-offline-v1.0.0.zip`
2. Extract to USB drive or air-gapped computer
3. Open `index.html` - works 100% offline

## Understanding Results

### ✅ Valid Signature (Green)
The file was signed by the key holder and has not been modified.

**Important:** You must still verify the key fingerprint matches the official source!

### ❌ Invalid Signature (Red)
The file may be corrupted, modified, or signed with a different key.

**Do not use the file.** Re-download and verify you have the correct public key.

## Testing

Create test signatures with GPG:

```bash
# Generate test key
gpg --gen-key

# Sign a file
echo "Hello World" > test.txt
gpg --armor --detach-sign test.txt

# Export public key
gpg --armor --export your-email@example.com > pubkey.asc

# Verify in the app: test.txt + test.txt.asc + pubkey.asc
```

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Quick start guide
- **[SECURITY.md](SECURITY.md)** - Security details
- **[TESTING.md](TESTING.md)** - Test suite
- **[GITHUB_PAGES.md](GITHUB_PAGES.md)** - Deployment guide

## Browser Compatibility

Requires modern browser with ES6+ support:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

MIT License - See [LICENSE](LICENSE) file

## Disclaimer

This tool implements industry-standard cryptographic verification. However:
- Always verify key fingerprints through official channels
- Signature verification only proves the file was signed by a key, not key ownership
- For high-security scenarios, consider using GPG command-line tools

---

**Built with security and privacy in mind.** 🔒

For questions or issues, see the documentation or open an issue.
