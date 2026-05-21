#!/usr/bin/env node
/**
 * End-to-end tests for GPG Verifier
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'test-data');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function printHeader(title) {
    console.log('\n' + colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + title + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');
}

function printSection(title) {
    console.log('\n' + colors.blue + '▶ ' + title + colors.reset);
}

async function assert(condition, message, details = '') {
    testsRun++;
    if (condition) {
        testsPassed++;
        console.log(colors.green + `  ✓ ${message}` + colors.reset);
        if (details) {
            console.log(colors.gray + `    ${details}` + colors.reset);
        }
        return;
    }

    testsFailed++;
    console.log(colors.red + `  ✗ ${message}` + colors.reset);
    if (details) {
        console.log(colors.gray + `    ${details}` + colors.reset);
    }
}

function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const requestPath = req.url === '/' ? '/index.html' : new URL(req.url, 'http://127.0.0.1').pathname;
            const fullPath = path.join(ROOT, requestPath);

            fs.readFile(fullPath, (error, data) => {
                if (error) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }

                const ext = path.extname(fullPath);
                const contentTypes = {
                    '.html': 'text/html; charset=utf-8',
                    '.js': 'application/javascript; charset=utf-8',
                    '.css': 'text/css; charset=utf-8',
                    '.asc': 'text/plain; charset=utf-8',
                    '.txt': 'text/plain; charset=utf-8',
                    '.sig': 'application/octet-stream',
                    '.bin': 'application/octet-stream'
                };

                res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
                res.end(data);
            });
        });

        server.listen(0, () => {
            resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
        });
    });
}

function fixture(...parts) {
    return path.join(FIXTURES, ...parts);
}

async function gotoApp(page, url) {
    await page.goto(url, { waitUntil: 'networkidle' });
}

async function uploadPublicKey(page) {
    await page.locator('#public-key').setInputFiles(fixture('public-key.asc'));
    await page.waitForFunction(() => {
        const info = document.getElementById('key-info');
        const section = document.querySelector('[data-section="public-key"]');
        return info && info.textContent.includes('public-key.asc') && section.classList.contains('collapsed');
    });
}

async function waitForResult(page, titleText) {
    await page.waitForFunction((expectedTitle) => {
        const resultContainer = document.getElementById('result-container');
        const result = document.getElementById('result');
        return resultContainer &&
            resultContainer.style.display !== 'none' &&
            result &&
            result.textContent.includes(expectedTitle);
    }, titleText);
}

async function testApplicationLoads(page, url) {
    printSection('Application');

    await gotoApp(page, url);

    await assert(
        await page.title() === 'GPG Verifier - Client-Side Verification',
        'Page title matches the application title'
    );

    await assert(
        await page.locator('#app-status-detail').textContent() === 'Load a public key and a signed file. Verification will start automatically when both inputs are ready.',
        'Status panel explains the auto-verification workflow'
    );

    await assert(
        await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light') === 'light',
        'Application starts in light mode'
    );
}

async function testThemeToggle(page, url) {
    printSection('Theme Toggle');

    await gotoApp(page, url);
    await page.locator('#theme-toggle').click();

    await assert(
        await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark',
        'Theme toggle switches the app into dark mode'
    );

    await assert(
        await page.locator('#theme-toggle-label').textContent() === 'Light Mode',
        'Toggle label updates for the next available theme'
    );

    await page.reload({ waitUntil: 'networkidle' });

    await assert(
        await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark',
        'Theme preference persists across reloads'
    );
}

async function testCollapsibleSectionToggle(page, url) {
    printSection('Collapsible Sections');

    await gotoApp(page, url);

    const initialExpanded = await page.locator('[data-section="public-key"] .collapsible-header').getAttribute('aria-expanded');
    await page.locator('[data-section="public-key"] .collapsible-header').click();
    await page.waitForFunction(() => document.querySelector('[data-section="public-key"]').classList.contains('collapsed'));

    await assert(initialExpanded === 'true', 'Public key section starts expanded');
    await assert(
        await page.locator('[data-section="public-key"] .collapsible-header').getAttribute('aria-expanded') === 'false',
        'Clicking a collapsible header collapses the section'
    );

    await page.locator('[data-section="public-key"] .collapsible-header').click();
    await page.waitForFunction(() => !document.querySelector('[data-section="public-key"]').classList.contains('collapsed'));

    await assert(
        await page.locator('[data-section="public-key"] .collapsible-header').getAttribute('aria-expanded') === 'true',
        'Clicking the header again re-expands the section'
    );
}

async function testKeyboardAccessibility(page, url) {
    printSection('Keyboard Accessibility');

    await gotoApp(page, url);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    await assert(
        await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('collapsible-header')),
        'Tab navigation reaches a collapsible header'
    );

    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-section="public-key"]').classList.contains('collapsed'));

    await assert(
        await page.locator('[data-section="public-key"] .collapsible-header').getAttribute('aria-expanded') === 'false',
        'Enter toggles the focused collapsible header closed'
    );

    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('[data-section="public-key"]').classList.contains('collapsed'));

    await assert(
        await page.locator('[data-section="public-key"] .collapsible-header').getAttribute('aria-expanded') === 'true',
        'Enter toggles the focused collapsible header open again'
    );
}

async function testClearsignedVerification(page, url) {
    printSection('Clearsigned Verification');

    await gotoApp(page, url);
    await uploadPublicKey(page);
    await page.locator('#signed-file').setInputFiles(fixture('message.txt.asc'));
    await waitForResult(page, 'SIGNATURE VALID');

    const resultText = await page.locator('#result').textContent();
    await assert(resultText.includes('Clearsigned'), 'Clearsigned message verifies successfully');
    await assert(resultText.includes('Fingerprint'), 'Verified result includes the signing fingerprint');
    await assert(
        (await page.locator('#app-status-badge').textContent()) === 'Verified',
        'Status badge changes to Verified after success'
    );
}

async function testDetachedVerification(page, url) {
    printSection('Detached Verification');

    await gotoApp(page, url);
    await uploadPublicKey(page);
    await page.locator('#signed-file').setInputFiles(fixture('data.txt.asc'));
    await page.waitForFunction(() => document.getElementById('detached-data-wrapper').style.display !== 'none');
    await page.locator('#detached-data-file').setInputFiles(fixture('data.txt'));
    await waitForResult(page, 'SIGNATURE VALID');

    const resultText = await page.locator('#result').textContent();
    await assert(resultText.includes('Detached Signature'), 'Detached signature verifies successfully');
}

async function testChecksumVerification(page, url) {
    printSection('Checksum Verification');

    await gotoApp(page, url);
    const checksums = await fs.promises.readFile(fixture('SHA256SUMS'), 'utf8');

    await page.evaluate((content) => {
        window.ChecksumVerifier.showChecksumSection(content);
    }, checksums);

    await page.waitForFunction(() => document.getElementById('checksum-container').style.display !== 'none');
    await page.locator('#checksum-file').setInputFiles(fixture('test-file-4.txt'));
    await page.waitForFunction(() => document.getElementById('checksum-result').textContent.includes('CHECKSUM VERIFIED'));

    await assert(
        await page.locator('#checksum-result').textContent().then((text) => text.includes('CHECKSUM VERIFIED')),
        'Checksum verification succeeds for bundled SHA256SUMS fixtures'
    );

    await assert(
        await page.locator('.checksum-item.verified').count() >= 1,
        'Checksum list marks verified files'
    );
}

async function testChecksumEscaping(page, url) {
    printSection('Checksum XSS Regression');

    await gotoApp(page, url);

    await page.evaluate(() => {
        window.__checksumXss = 0;
    });

    const maliciousChecksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  <img src=x onerror="window.__checksumXss=1">.iso';
    await page.evaluate((content) => {
        window.ChecksumVerifier.showChecksumSection(content);
    }, maliciousChecksum);

    const hasRenderedImage = await page.locator('#checksum-list img').count();
    const checksumHtml = await page.locator('#checksum-list').innerHTML();
    const checksumXss = await page.evaluate(() => window.__checksumXss);

    await assert(hasRenderedImage === 0, 'Checksum filenames are rendered as text, not live HTML');
    await assert(checksumHtml.includes('&lt;img'), 'Malicious checksum filename is escaped in the DOM');
    await assert(checksumXss === 0, 'Escaped checksum filename does not execute script');
}

async function testInvalidInputRouting(page, url) {
    printSection('Input Validation');

    await gotoApp(page, url);
    const signedMessage = await fs.promises.readFile(fixture('message.txt.asc'), 'utf8');
    await page.evaluate((value) => {
        const textarea = document.getElementById('key-text');
        textarea.value = value;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }, signedMessage);

    await page.waitForFunction(() => {
        const error = document.getElementById('key-section-error');
        return error.style.display !== 'none' && error.textContent.includes('Wrong Section!');
    });

    await assert(
        await page.locator('#key-section-error').textContent().then((text) => text.includes('Wrong Section!')),
        'Pasting signed content into the key field shows a targeted inline error'
    );
}

async function testInvalidInputsAndSignatureRejection(page, url) {
    printSection('Invalid Inputs');

    await gotoApp(page, url);
    await page.locator('#key-text').fill('this is not a public key');
    await page.locator('#signed-text').fill('totally invalid signature text');

    await page.waitForFunction(() => {
        const keyInfo = document.getElementById('key-info');
        const signedError = document.getElementById('signed-section-error');
        return keyInfo.textContent.includes('Pasted key') &&
            signedError.style.display !== 'none' &&
            signedError.textContent.includes('Invalid Format');
    });

    await assert(
        await page.locator('#signed-section-error').textContent().then((text) => text.includes('Invalid Format')),
        'Invalid signed text is rejected with an inline error'
    );

    await page.locator('#signed-file').setInputFiles(fixture('message.txt.asc'));
    await waitForResult(page, 'ERROR');

    const errorText = await page.locator('#result').textContent();
    await assert(errorText.includes('Error verifying signed message'), 'Garbage public key input produces a verification error');

    await gotoApp(page, url);
    await uploadPublicKey(page);
    const tamperedSignedMessage = (await fs.promises.readFile(fixture('message.txt.asc'), 'utf8'))
        .replace('This is a test message for GPG verification.', 'This is a tampered test message for GPG verification.');

    await page.locator('#signed-text').fill(tamperedSignedMessage);
    await waitForResult(page, 'SIGNATURE INVALID');

    await assert(
        await page.locator('#result').textContent().then((text) => text.includes('SIGNATURE INVALID')),
        'Tampered signed content is rejected as an invalid signature'
    );
}

async function testPasteKeyViaTextarea(page, url) {
    printSection('Pasted Public Key');

    await gotoApp(page, url);
    const publicKey = await fs.promises.readFile(fixture('public-key.asc'), 'utf8');

    await page.locator('#key-text').fill(publicKey);
    await page.waitForFunction(() => {
        const info = document.getElementById('key-info');
        const section = document.querySelector('[data-section="public-key"]');
        return info.textContent.includes('Pasted') && section.classList.contains('collapsed');
    });

    await assert(
        await page.locator('#key-info').textContent().then((text) => text.includes('Pasted')),
        'Valid public key can be loaded from the textarea'
    );

    await assert(
        await page.locator('[data-section="public-key"] .collapsible-header').getAttribute('aria-expanded') === 'false',
        'Public key section collapses after a valid key is pasted'
    );
}

async function testStopButtonPreservesInputs(page, url) {
    printSection('Stop Button');

    const appRoute = async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const instrumented = source.replace(
            "        console.log('Verification will stop at next checkpoint - inputs preserved');\n    }\n",
            "        console.log('Verification will stop at next checkpoint - inputs preserved');\n    }\n\n    window.__testStopVerification = stopVerification;\n"
        );

        await route.fulfill({
            response,
            body: instrumented,
            contentType: 'application/javascript; charset=utf-8'
        });
    };

    await page.route('**/app.js*', appRoute);
    await gotoApp(page, url);

    // Use the clearsigned flow and intercept openpgp.verify so verification
    // stays in progress until the UI enters the stop path. Once the reset
    // button switches to "Stopping...", reject the verify promise so the outer
    // catch block runs and updates status to "Stopped".
    await page.evaluate(() => {
        window.__stopButtonVerifyStarted = false;
        const originalConsoleError = console.error.bind(console);
        const resetBtn = document.getElementById('reset-btn');

        console.error = (...args) => {
            if (args.some((arg) => String(arg).includes('Verification aborted by test'))) {
                return;
            }
            originalConsoleError(...args);
        };

        resetBtn.addEventListener('click', (event) => {
            if (window.__stopButtonVerifyStarted && resetBtn.textContent.includes('Stop')) {
                event.preventDefault();
                event.stopImmediatePropagation();
                window.__testStopVerification();
            }
        }, true);

        window.openpgp.verify = function(...args) {
            window.__stopButtonVerifyStarted = true;
            return new Promise((resolve, reject) => {
                const poll = window.setInterval(() => {
                    if (resetBtn && resetBtn.textContent.includes('Stopping')) {
                        window.clearInterval(poll);
                        reject(new Error('Verification aborted by test'));
                    }
                }, 50);
            });
        };
    });

    await uploadPublicKey(page);

    // Use clearsigned message (no streaming) so our verify mock fully controls the flow.
    await page.locator('#signed-file').setInputFiles(fixture('message.txt.asc'));

    // Wait until verify() has actually been entered; the button text changes to
    // "Stop" earlier in verifySignature, which is too soon for this test.
    await page.waitForFunction(() => {
        const resetBtn = document.getElementById('reset-btn');
        return window.__stopButtonVerifyStarted && resetBtn.textContent.includes('Stop');
    }, { timeout: 10000 });

    await page.evaluate(() => {
        document.getElementById('reset-btn').click();
    });

    await page.waitForFunction(() => {
        const statusBadge = document.getElementById('app-status-badge');
        return statusBadge && statusBadge.textContent === 'Stopped';
    }, { timeout: 10000 });

    const preserved = await page.evaluate(() => ({
        statusBadge: document.getElementById('app-status-badge').textContent,
        resetBtnText: document.getElementById('reset-btn').textContent,
        keyInfo: document.getElementById('key-info').textContent,
        keySectionCollapsed: document.querySelector('[data-section="public-key"]').classList.contains('collapsed'),
        signedSectionCollapsed: document.querySelector('[data-section="signed-file"]').classList.contains('collapsed')
    }));

    await assert(preserved.statusBadge === 'Stopped', 'Stop button changes status to Stopped');
    await assert(preserved.resetBtnText.includes('Start Over'), 'Reset button returns to Start Over after stopping');
    await assert(preserved.keyInfo.includes('public-key.asc'), 'Stopping verification preserves the loaded public key');
    await assert(preserved.keySectionCollapsed, 'Stopping verification keeps the public key section collapsed');
    await assert(preserved.signedSectionCollapsed, 'Stopping verification keeps the signed file section collapsed');

    await page.unroute('**/app.js*', appRoute);
}

async function testKnownKeyBanner(page, url) {
    printSection('Known Key Banner');

    await gotoApp(page, url);

    // Read the test key so we can put it in the mock KnownKeys database
    const testKeyArmored = fs.readFileSync(path.join(FIXTURES, 'public-key.asc'), 'utf8');

    // Inject a KnownKeys database that maps the test key's ID to a mock entry.
    // Key ID is the last 16 hex chars of fingerprint 9591F6C004F01D8D48C1CDC02672E6587FB0A5A2
    await page.evaluate((armoredKey) => {
        window.KnownKeys = {
            lookup: function(keyID) {
                if (keyID === '2672e6587fb0a5a2') {
                    return {
                        distro: 'TestDistro',
                        label: 'TestDistro Release Key',
                        fingerprint: '9591F6C004F01D8D48C1CDC02672E6587FB0A5A2',
                        armoredKey: armoredKey
                    };
                }
                return null;
            }
        };
    }, testKeyArmored);

    // Upload the clearsigned test file (signed with the test key)
    const signedFilePath = path.join(FIXTURES, 'message.txt.asc');
    await page.locator('#signed-file').setInputFiles(signedFilePath);

    // Banner should appear in the public key section
    const banner = page.locator('#known-key-banner');
    await banner.waitFor({ state: 'visible', timeout: 3000 });
    await assert(await banner.isVisible(), 'Known key banner appears after uploading file signed with a known key');

    const bannerText = await banner.textContent();
    await assert(bannerText.includes('TestDistro Release Key'), 'Banner shows the key label');
    await assert(bannerText.includes('9591F6C004'), 'Banner shows partial fingerprint');

    // Click "Use this key" — should load the key, collapse sections, and verify
    await page.locator('#known-key-accept').click();

    // Banner should disappear
    await banner.waitFor({ state: 'detached', timeout: 3000 });
    await assert(!(await page.locator('#known-key-banner').isVisible().catch(() => false)), 'Banner disappears after accepting');

    // Verification should succeed
    const result = page.locator('#result');
    await result.waitFor({ state: 'visible', timeout: 5000 });
    const resultText = await result.textContent();
    await assert(resultText.includes('SIGNATURE VALID'), 'Verification succeeds after loading known key via banner');

    // --- Negative test: unknown key shows no banner ---
    await gotoApp(page, url);

    // Empty KnownKeys database — no matches
    await page.evaluate(() => {
        window.KnownKeys = { lookup: function() { return null; } };
    });

    await page.locator('#signed-file').setInputFiles(signedFilePath);
    await page.waitForTimeout(500);

    const bannerAfterUnknown = await page.locator('#known-key-banner').isVisible().catch(() => false);
    await assert(!bannerAfterUnknown, 'No banner appears for a file signed with an unknown key');

    // --- Dismiss test: clicking dismiss hides banner and leaves key section empty ---
    await gotoApp(page, url);

    await page.evaluate((armoredKey) => {
        window.KnownKeys = {
            lookup: function(keyID) {
                if (keyID === '2672e6587fb0a5a2') {
                    return {
                        distro: 'TestDistro', label: 'TestDistro Release Key',
                        fingerprint: '9591F6C004F01D8D48C1CDC02672E6587FB0A5A2',
                        armoredKey: armoredKey
                    };
                }
                return null;
            }
        };
    }, testKeyArmored);

    await page.locator('#signed-file').setInputFiles(signedFilePath);
    await page.locator('#known-key-banner').waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('#known-key-dismiss').click();

    await page.locator('#known-key-banner').waitFor({ state: 'detached', timeout: 2000 });
    const dismissedBannerGone = !(await page.locator('#known-key-banner').isVisible().catch(() => false));
    await assert(dismissedBannerGone, 'Banner disappears after clicking dismiss');

    const keyTextValue = await page.locator('#key-text').inputValue();
    const keyFileValue = await page.locator('#public-key').evaluate(el => el.value);
    await assert(!keyTextValue && !keyFileValue, 'Dismissing banner leaves public key section empty');
}

async function testResetAndResponsiveLayout(page, url) {
    printSection('Reset And Layout');

    await gotoApp(page, url);
    await uploadPublicKey(page);
    await page.locator('#reset-btn').click();

    const collapsedStates = await page.$$eval('.input-section', (sections) =>
        sections.map((section) => section.classList.contains('collapsed'))
    );

    await assert(collapsedStates.every((value) => value === false), 'Start Over re-expands the main sections');

    await page.setViewportSize({ width: 375, height: 812 });
    const containerWidth = await page.locator('.container').evaluate((node) => node.getBoundingClientRect().width);
    await assert(containerWidth <= 375, 'Layout adapts to a mobile-width viewport', `container width ${Math.round(containerWidth)}px`);

    await page.setViewportSize({ width: 1280, height: 720 });
}

async function runTests() {
    printHeader('GPG Verifier - End-to-End Test Suite');

    const { server, url } = await startServer();
    const headless = process.env.HEADLESS !== 'false';
    const browser = await chromium.launch({ headless });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    const consoleErrors = [];
    page.on('pageerror', (error) => {
        consoleErrors.push(error.message);
    });
    page.on('console', (message) => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    });

    try {
        await testApplicationLoads(page, url);
        await testThemeToggle(page, url);
        await testCollapsibleSectionToggle(page, url);
        await testKeyboardAccessibility(page, url);
        await testClearsignedVerification(page, url);
        await testDetachedVerification(page, url);
        await testChecksumVerification(page, url);
        await testChecksumEscaping(page, url);
        await testInvalidInputRouting(page, url);
        await testInvalidInputsAndSignatureRejection(page, url);
        await testPasteKeyViaTextarea(page, url);
        await testStopButtonPreservesInputs(page, url);
        await testKnownKeyBanner(page, url);
        await testResetAndResponsiveLayout(page, url);

        const expectedErrorFragments = [
            'favicon',
            'Misformed armored text',
            'Signed digest did not match',
            'Stream pull: state.dataFile is null - aborting stream'
        ];
        const realErrors = consoleErrors.filter((message) =>
            !expectedErrorFragments.some((fragment) => message.includes(fragment))
        );
        await assert(realErrors.length === 0, 'Application runs without browser console errors', realErrors.join(' | '));
    } catch (error) {
        testsFailed++;
        console.log(colors.red + '  ✗ Fatal test failure' + colors.reset);
        console.log(colors.gray + `    ${error.stack || error.message}` + colors.reset);
    } finally {
        await browser.close();
        server.close();
    }

    console.log('\n' + colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + 'Test Summary' + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');
    console.log(`  Total Tests:  ${testsRun}`);
    console.log(colors.green + `  Passed:       ${testsPassed}` + colors.reset);
    console.log((testsFailed ? colors.red : '') + `  Failed:       ${testsFailed}` + colors.reset);

    process.exit(testsFailed === 0 ? 0 : 1);
}

runTests().catch((error) => {
    console.error(colors.red + 'Test runner crashed:' + colors.reset);
    console.error(error);
    process.exit(1);
});
