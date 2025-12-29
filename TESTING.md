# Testing Guide

## Quick Start

```bash
# Run all tests (unit + E2E)
npm test

# Run only unit tests
npm run test:unit

# Run only E2E tests
npm run test:e2e

# Or use the test runner
./test/run-tests.sh
```

## Test Suites

### Unit Tests (35+ tests)

Validates core functionality:
- File structure (all required files exist)
- HTML/CSS/JavaScript structure
- Content Security Policy
- Format detection (clearsigned, detached, inline signatures)
- Web server accessibility

**Run:** `npm run test:unit` or `node test/test.js`

### E2E Tests (18+ tests)

Tests full browser workflows using Playwright:
- GPG signature verification (clearsigned, detached)
- Checksum verification (single and multiple files)
- File queue processing
- UI interactions (collapsible sections, progress bars)
- Error handling
- Accessibility (keyboard navigation, mobile viewport)

**Setup:**
```bash
npm install
npx playwright install chromium
```

**Run:** `npm run test:e2e` or `npm run test:e2e:headed` (visible browser)

## Manual Browser Testing

### Basic Test Workflow

1. Start web server:
   ```bash
   python3 -m http.server 8000
   ```

2. Open `http://localhost:8000`

3. Test GPG signature verification:
   - Upload public key: `test/test-data/public-key.asc`
   - Upload signed message: `test/test-data/message.txt.asc`
   - Verification should run automatically
   - Should show: ✓ SIGNATURE VALID

4. Test detached signatures:
   - Upload public key: `test/test-data/public-key.asc`
   - Upload signature: `test/test-data/data.txt.asc`
   - Upload data file: `test/test-data/data.txt`
   - Should verify successfully

5. Test error handling:
   - Paste invalid text as public key
   - Should show inline error message

## Test Data

Located in `test/test-data/`:
- `public-key.asc` - RSA-2048 test public key
- `message.txt.asc` - Clearsigned message
- `data.txt`, `data.txt.asc` - Data file with detached signature
- `test-file-1.txt` through `test-file-4.txt` - Files with known SHA-256 hashes
- `SHA256SUMS`, `CHECKSUM` - Checksum files in different formats

## Creating Test Data

Generate your own test signatures:

```bash
# Generate test key
gpg --gen-key

# Create clearsigned message
echo "Test message" > test.txt
gpg --clearsign test.txt

# Create detached signature
echo "Test data" > data.txt
gpg --detach-sign --armor data.txt

# Export public key
gpg --armor --export your-email@example.com > pubkey.asc
```

## Test Helpers

Generate test files with known checksums:

```bash
node test/test-helpers.js
```

Available utilities in `test/test-helpers.js`:
- `generateTestFiles(outputDir)` - Create test files with known hashes
- `generateLargeFile(outputDir, sizeInMB)` - Create large files for performance testing
- `calculateFileHash(filePath)` - Calculate SHA-256 hash
- `cleanupTestFiles(directory)` - Remove test files
- `setupTestEnvironment()` - Complete setup

## Expected Results

**Unit tests:** 30-35 passing (85-100%)
- Some tests require web server running
- OpenPGP.js loading may fail in Node.js (this is expected)

**E2E tests:** 18+ passing (100%)
- Requires Playwright installation
- Tests run in real browser environment

## Test Coverage

| Test Suite | Tests | Coverage |
|------------|-------|----------|
| Unit Tests | 35+ | Core functionality |
| E2E Tests | 18+ | Full workflows |
| **Total** | **57+** | **Comprehensive** |

## Troubleshooting

**Tests won't run:**
- Install Node.js 18+ (`node --version`)
- Run from project root directory

**Web server tests fail:**
- Start server: `python3 -m http.server 8000`
- Re-run tests

**E2E tests fail:**
- Install Playwright: `npx playwright install chromium`
- Check browser compatibility

**Debug failing E2E test:**
- Run with visible browser: `npm run test:e2e:headed`
- Add `await page.pause()` to inspect page state

## Browser Compatibility

Tests verify compatibility with:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Continuous Testing

Test after any code changes:
```bash
npm test
```

Test in multiple browsers manually to ensure cross-browser compatibility.

Test offline mode:
- Load page in browser
- Disconnect from internet
- Verify signatures still work

---

**For detailed test documentation, see the test files:**
- `test/test.js` - Unit test implementation
- `test/e2e-tests.js` - E2E test implementation
- `test/test-helpers.js` - Test utilities
