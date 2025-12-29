# Quick Start Guide

Get started with GPG Verifier in 60 seconds.

## 🚀 Fastest Way to Start

```bash
# Navigate to the app directory
cd /path/to/gpg-verifier

# Start a local server (choose one):
python3 -m http.server 8000
# OR
python -m SimpleHTTPServer 8000
# OR
npx http-server -p 8000

# Open in browser
# http://localhost:8000
```

That's it! The app is now running.

## 📋 First Test (2 minutes)

### Option A: Test with Your Own Files

If you have GPG installed:

```bash
# Create test files
echo "Hello World" > test.txt
gpg --armor --detach-sign test.txt
gpg --armor --export your-email@example.com > pubkey.asc

# Now you have:
# - test.txt (file to verify)
# - test.txt.asc (signature)
# - pubkey.asc (public key)
```

### Option B: Test with Real Clearsigned Files

Many projects publish clearsigned announcements:
- **GnuPG announcements**: Often clearsigned
- **Bitcoin Core release notes**: Clearsigned
- **Package repository announcements**: Often clearsigned

Look for files with `.asc` extension that contain both the message and signature.

## 🎯 Using the App

1. **Provide Public Key** (Step 1) - Choose one method:
   - Click "Choose File" and select `.asc` or `.gpg` file
   - OR paste key text directly into text box

2. **Upload Signed File** (Step 2)
   - Click "Choose File" and select a file with inline/clearsigned signature
   - File must contain `-----BEGIN PGP SIGNED MESSAGE-----` (clearsigned)
   - Or `-----BEGIN PGP MESSAGE-----` (inline signed)

3. **Click "Verify Signature"**
   - Wait for verification

4. **Check Result**
   - ✅ **Green banner** = Valid signature, shows signature type
   - ❌ **Red banner** = Invalid signature, DO NOT trust the file

## 🔒 Security Quick Tips

1. **Always verify key fingerprints** - Check the key fingerprint matches the official source
2. **Use HTTPS** - When accessing remotely, always use HTTPS
3. **Self-host for max security** - Download OpenPGP.js locally (see README.md)

## ❓ Common Questions

**Q: Does this send my files anywhere?**
A: No! Everything happens in your browser. No data leaves your computer.

**Q: Can I use this offline?**
A: Yes! After the page loads once, it can work offline (if you self-host OpenPGP.js).

**Q: Is this as secure as command-line GPG?**
A: Yes, for signature verification. It uses the same cryptographic algorithms.

**Q: What if verification fails?**
A: Do NOT use the file. Re-download and try again. Verify you have the correct public key.

## 📚 Learn More

- **README.md** - Complete guide and security info
- **SECURITY.md** - Detailed security model
- **EXAMPLES.md** - More test examples
- **DEPLOYMENT.md** - How to deploy for others

## 🆘 Something Not Working?

1. **Check browser console** (F12) for errors
2. **Try a different browser** (Chrome, Firefox, Safari)
3. **Verify files are correct format**:
   - Public key: Starts with `-----BEGIN PGP PUBLIC KEY BLOCK-----`
   - Signature: Ends with `.sig` or `.asc`
4. **Try smaller test files first**

## 💡 Pro Tips

- **Large files**: Verification can take 30-60 seconds for multi-GB ISOs (be patient!)
- **Clear buttons**: Click the ✕ to reset and try again
- **Multiple signatures**: Verify one at a time (clear between verifications)
- **Paste keys**: For quick tests, paste the key text instead of uploading

## ✨ That's It!

You now know how to verify GPG signatures without installing anything or polluting your keychain.

---

**Need help?** Open an issue on the repository or see the full documentation in README.md.
