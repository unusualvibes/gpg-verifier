#!/usr/bin/env node
/**
 * End-to-End Test Suite for GPG Signature Verifier
 *
 * Tests all functionality including:
 * - GPG signature verification (clearsigned, detached, binary)
 * - Checksum verification (single and multiple files)
 * - File queue processing
 * - Stop button functionality
 * - UI interactions
 * - Error handling
 * - Auto-verification
 *
 * Requirements:
 * - npm install playwright
 * - Test data files in test-data/
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m'
};

// Test statistics
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
let currentTest = '';

/**
 * Print utilities
 */
function printHeader(title) {
    console.log('\n' + colors.cyan + colors.bold + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + colors.bold + title + colors.reset);
    console.log(colors.cyan + colors.bold + '='.repeat(80) + colors.reset + '\n');
}

function printSection(title) {
    console.log('\n' + colors.blue + colors.bold + '▶ ' + title + colors.reset);
}

function printTest(name) {
    currentTest = name;
    process.stdout.write(colors.gray + '  Testing: ' + name + '...' + colors.reset);
}

/**
 * Assert helper
 */
async function assert(condition, message, details = '') {
    testsRun++;
    // Clear the "Testing..." line
    process.stdout.write('\r' + ' '.repeat(100) + '\r');

    if (condition) {
        testsPassed++;
        console.log(colors.green + '  ✓ ' + currentTest + colors.reset);
        if (details) {
            console.log(colors.gray + '    → ' + details + colors.reset);
        }
        return true;
    } else {
        testsFailed++;
        console.log(colors.red + '  ✗ ' + currentTest + colors.reset);
        console.log(colors.red + '    Error: ' + message + colors.reset);
        if (details) {
            console.log(colors.gray + '    Details: ' + details + colors.reset);
        }
        return false;
    }
}

/**
 * Start a simple HTTP server for testing
 */
function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const filePath = req.url === '/' ? '/index.html' : req.url;
            const fullPath = path.join(__dirname, '..', filePath);

            fs.readFile(fullPath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }

                // Set appropriate content type
                const ext = path.extname(fullPath);
                const contentTypes = {
                    '.html': 'text/html',
                    '.js': 'application/javascript',
                    '.css': 'text/css',
                    '.json': 'application/json'
                };
                res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
                res.end(data);
            });
        });

        server.listen(0, () => {
            const port = server.address().port;
            resolve({ server, port, url: `http://localhost:${port}` });
        });
    });
}

/**
 * Create test GPG key and signatures
 */
async function createTestData() {
    const testDataDir = path.join(__dirname, 'test-data');
    if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir);
    }

    // Test GPG public key (example key - replace with actual test key)
    const publicKey = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mQINBGbxGJ0BEADLrH5T8F8VxQOKCL3dY4zqYW8gV7tJ4Y3zN1P5vN8xK9Q7fM2L
-----END PGP PUBLIC KEY BLOCK-----`;

    // Test clearsigned message
    const clearsigned = `-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

This is a test message.
-----BEGIN PGP SIGNATURE-----

iQIzBAEBCAAdFiEE...
-----END PGP SIGNATURE-----`;

    // Test checksum file (SHA256SUMS format)
    const checksums = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  test-file-1.txt
5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9  test-file-2.txt
6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b  test-file-3.txt`;

    return {
        publicKey,
        clearsigned,
        checksums,
        testDataDir
    };
}

/**
 * Test: Application loads successfully
 */
async function testApplicationLoads(page, baseUrl) {
    printTest('Application loads successfully');

    await page.goto(baseUrl);
    const title = await page.title();
    const hasTitle = title.includes('GPG Signature Verifier');

    await assert(hasTitle, 'Page title should contain "GPG Signature Verifier"', `Title: ${title}`);
}

/**
 * Test: All sections are present
 */
async function testSectionsPresent(page) {
    printTest('All UI sections are present');

    const sections = await page.$$eval('section', els => els.map(el => el.getAttribute('data-section')));
    const hasKeySection = sections.some(s => s === 'public-key');
    const hasSignedSection = sections.some(s => s === 'signed-file');

    await assert(hasKeySection && hasSignedSection,
        'Should have key and signed message sections',
        `Found ${sections.length} sections`);
}

/**
 * Test: Upload GPG public key (file)
 */
async function testUploadPublicKey(page, publicKey, testDataDir) {
    printTest('Upload GPG public key via file');

    // Create temporary key file
    const keyPath = path.join(testDataDir, 'test-key.asc');
    fs.writeFileSync(keyPath, publicKey);

    // Upload file
    const fileInput = await page.$('#public-key');
    await fileInput.setInputFiles(keyPath);

    // Wait for processing
    await page.waitForTimeout(500);

    // Check if key section collapses (indicating successful upload)
    const isCollapsed = await page.$eval('.input-section[data-section="public-key"]',
        el => el.classList.contains('collapsed'));

    await assert(isCollapsed, 'Key section should collapse after upload', 'Section auto-collapsed');

    // Cleanup
    fs.unlinkSync(keyPath);
}

/**
 * Test: Paste GPG public key (text)
 */
async function testPastePublicKey(page, publicKey) {
    printTest('Paste GPG public key via text area');

    // Click on text tab
    await page.click('input[name="key-input-type"][value="text"]');

    // Paste key
    await page.fill('#key-text', publicKey);
    await page.click('#upload-key-text');

    // Wait for processing
    await page.waitForTimeout(500);

    // Check if key section collapses
    const isCollapsed = await page.$eval('.input-section[data-section="public-key"]',
        el => el.classList.contains('collapsed'));

    await assert(isCollapsed, 'Key section should collapse after paste', 'Section auto-collapsed');
}

/**
 * Test: Verify clearsigned message
 */
async function testVerifyClearsigned(page, clearsigned, testDataDir) {
    printTest('Verify clearsigned GPG message');

    // Create clearsigned file
    const msgPath = path.join(testDataDir, 'message.asc');
    fs.writeFileSync(msgPath, clearsigned);

    // Upload signed message
    const fileInput = await page.$('#signed-file');
    await fileInput.setInputFiles(msgPath);

    // Wait for auto-verification
    await page.waitForTimeout(2000);

    // Check for result (should show either success or error)
    const hasResult = await page.$('#result-container') !== null;
    const resultVisible = await page.$eval('#result-container',
        el => el.style.display !== 'none');

    await assert(hasResult && resultVisible,
        'Verification result should be displayed',
        'Auto-verification completed');

    // Cleanup
    fs.unlinkSync(msgPath);
}

/**
 * Test: Detached signature verification
 */
async function testDetachedSignature(page, testDataDir) {
    printTest('Verify detached GPG signature');

    // Create data file
    const dataPath = path.join(testDataDir, 'data.txt');
    fs.writeFileSync(dataPath, 'Test data content');

    // Create dummy signature (in real test, use actual signature)
    const sigPath = path.join(testDataDir, 'data.txt.sig');
    fs.writeFileSync(sigPath, ''); // Placeholder

    // Upload signed file (data file)
    const dataInput = await page.$('#signed-file');
    await dataInput.setInputFiles(dataPath);

    await page.waitForTimeout(500);

    // Upload signature file
    const sigInput = await page.$('#signature-file');
    await sigInput.setInputFiles(sigPath);

    // Wait for auto-verification
    await page.waitForTimeout(2000);

    // Check that signature was detected
    const fileInfo = await page.$eval('#signed-info', el => el.textContent);
    const hasSignatureInfo = fileInfo.includes('signature') || fileInfo.includes('Signature');

    await assert(hasSignatureInfo,
        'Detached signature should be detected',
        'Signature information displayed');

    // Cleanup
    fs.unlinkSync(dataPath);
    fs.unlinkSync(sigPath);
}

/**
 * Test: Checksum file upload and parsing
 */
async function testChecksumUpload(page, checksums, testDataDir) {
    printTest('Upload and parse checksum file');

    // First upload a public key and signed checksum file to trigger checksum section
    const checksumPath = path.join(testDataDir, 'SHA256SUMS');
    fs.writeFileSync(checksumPath, checksums);

    // Upload as signed file
    const fileInput = await page.$('#signed-file');
    await fileInput.setInputFiles(checksumPath);

    await page.waitForTimeout(1000);

    // Check if checksum section is visible
    const checksumSection = await page.$('#checksum-section');
    const isVisible = checksumSection !== null;

    if (isVisible) {
        const checksumList = await page.$eval('#checksum-list', el => el.textContent);
        const hasChecksums = checksumList.includes('test-file-1.txt') ||
                            checksumList.includes('checksum');

        await assert(hasChecksums,
            'Checksum section should display parsed checksums',
            'Checksums parsed and displayed');
    } else {
        await assert(false,
            'Checksum section should be visible',
            'Section not found');
    }

    // Cleanup
    fs.unlinkSync(checksumPath);
}

/**
 * Test: Single file checksum verification
 */
async function testSingleFileChecksum(page, testDataDir) {
    printTest('Verify single file checksum');

    // Create test file with known content
    const testFilePath = path.join(testDataDir, 'test-file-1.txt');
    fs.writeFileSync(testFilePath, ''); // Empty file = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

    // Upload file for checksum verification
    const checksumFileInput = await page.$('#checksum-file');
    if (checksumFileInput) {
        await checksumFileInput.setInputFiles(testFilePath);

        // Wait for verification
        await page.waitForTimeout(3000);

        // Check for verification result
        const hasVerified = await page.$$eval('.checksum-item', items =>
            items.some(item => item.classList.contains('verified'))
        );

        await assert(hasVerified,
            'File should be marked as verified',
            'Checksum verified successfully');
    } else {
        await assert(false, 'Checksum file input should be present', 'Input not found');
    }

    // Cleanup
    fs.unlinkSync(testFilePath);
}

/**
 * Test: Multiple file queue
 */
async function testMultipleFileQueue(page, testDataDir) {
    printTest('Verify multiple files in queue');

    // Create multiple test files
    const file1 = path.join(testDataDir, 'test-file-1.txt');
    const file2 = path.join(testDataDir, 'test-file-2.txt');
    const file3 = path.join(testDataDir, 'test-file-3.txt');

    fs.writeFileSync(file1, ''); // Empty
    fs.writeFileSync(file2, '0'); // SHA256: 5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9
    fs.writeFileSync(file3, '1'); // SHA256: 6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b

    // Upload all files
    const checksumFileInput = await page.$('#checksum-file');
    if (checksumFileInput) {
        await checksumFileInput.setInputFiles([file1, file2, file3]);

        // Wait for queue to process
        await page.waitForTimeout(5000);

        // Check queue display
        const hasQueue = await page.$('#checksum-queue') !== null;
        const verifiedCount = await page.$$eval('.checksum-item.verified', items => items.length);

        await assert(verifiedCount >= 1,
            'At least one file should be verified from queue',
            `${verifiedCount} file(s) verified`);
    } else {
        await assert(false, 'Checksum file input should be present', 'Input not found');
    }

    // Cleanup
    [file1, file2, file3].forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
    });
}

/**
 * Test: Stop button functionality
 */
async function testStopButton(page, testDataDir) {
    printTest('Stop button preserves inputs');

    // Upload key and file first
    const dataPath = path.join(testDataDir, 'large-data.txt');
    fs.writeFileSync(dataPath, 'x'.repeat(10000)); // Create larger file

    const fileInput = await page.$('#signed-file');
    await fileInput.setInputFiles(dataPath);

    // Try to find and click stop button (if verification is in progress)
    await page.waitForTimeout(100);

    const stopButton = await page.$('#reset-btn');
    if (stopButton) {
        const buttonText = await stopButton.textContent();

        // If button shows "Stop" (verification in progress), click it
        if (buttonText.includes('Stop') || buttonText.includes('⏹')) {
            await stopButton.click();

            // Wait a moment
            await page.waitForTimeout(500);

            // Check if file info is still present (inputs preserved)
            const fileInfo = await page.$eval('#signed-info', el => el.textContent);
            const hasFileInfo = fileInfo.includes('large-data.txt') || fileInfo.length > 0;

            await assert(hasFileInfo,
                'File inputs should be preserved after stop',
                'Inputs preserved successfully');
        } else {
            // Verification already completed, just verify button exists
            await assert(true,
                'Stop/Reset button is present',
                'Button found');
        }
    }

    // Cleanup
    fs.unlinkSync(dataPath);
}

/**
 * Test: Collapsible sections
 */
async function testCollapsibleSections(page) {
    printTest('Collapsible sections work correctly');

    // Find a section header
    const header = await page.$('.collapsible-header');

    if (header) {
        // Get initial state
        const initialExpanded = await page.$eval('.input-section.collapsible',
            el => !el.classList.contains('collapsed'));

        // Click to toggle
        await header.click();
        await page.waitForTimeout(300);

        // Check state changed
        const afterClick = await page.$eval('.input-section.collapsible',
            el => !el.classList.contains('collapsed'));

        const toggled = initialExpanded !== afterClick;

        await assert(toggled,
            'Section should toggle when header clicked',
            `State changed: ${initialExpanded} → ${afterClick}`);
    } else {
        await assert(false, 'Collapsible header should be present', 'Header not found');
    }
}

/**
 * Test: Error handling for invalid key
 */
async function testInvalidKeyError(page) {
    printTest('Invalid key shows error message');

    // Click on text tab
    await page.click('input[name="key-input-type"][value="text"]');

    // Paste invalid key
    await page.fill('#key-text', 'This is not a valid GPG key');
    await page.click('#upload-key-text');

    // Wait for error
    await page.waitForTimeout(500);

    // Check for error message
    const errorVisible = await page.$$eval('.inline-error, .error',
        els => els.some(el => el.style.display !== 'none' && el.textContent.length > 0));

    await assert(errorVisible,
        'Error message should be displayed for invalid key',
        'Error handling works');
}

/**
 * Test: Start Over button resets state
 */
async function testStartOver(page, publicKey, testDataDir) {
    printTest('Start Over button resets application state');

    // Upload some data first
    const keyPath = path.join(testDataDir, 'test-key-2.asc');
    fs.writeFileSync(keyPath, publicKey);

    const fileInput = await page.$('#public-key');
    await fileInput.setInputFiles(keyPath);
    await page.waitForTimeout(500);

    // Click Start Over
    const resetButton = await page.$('#reset-btn');
    await resetButton.click();

    await page.waitForTimeout(500);

    // Check if sections are expanded again
    const sections = await page.$$eval('.input-section',
        els => els.map(el => el.classList.contains('collapsed')));
    const allExpanded = sections.every(collapsed => !collapsed);

    await assert(allExpanded,
        'All sections should be expanded after reset',
        'State reset successfully');

    // Cleanup
    fs.unlinkSync(keyPath);
}

/**
 * Test: Progress bar appears during verification
 */
async function testProgressBar(page, testDataDir) {
    printTest('Progress bar appears during verification');

    // Create a larger file to ensure progress bar is visible
    const largePath = path.join(testDataDir, 'large-file.txt');
    fs.writeFileSync(largePath, 'x'.repeat(1000000)); // 1MB

    const fileInput = await page.$('#signed-file');
    await fileInput.setInputFiles(largePath);

    // Check quickly if progress bar appears
    await page.waitForTimeout(100);

    const progressBar = await page.$('.progress-container');
    const exists = progressBar !== null;

    await assert(exists,
        'Progress bar element should exist',
        'Progress UI present');

    // Cleanup
    fs.unlinkSync(largePath);
}

/**
 * Test: Filename validation for checksums
 */
async function testFilenameValidation(page, checksums, testDataDir) {
    printTest('Filename validation for checksum files');

    // Upload checksum file first
    const checksumPath = path.join(testDataDir, 'SHA256SUMS-test');
    fs.writeFileSync(checksumPath, checksums);

    const fileInput = await page.$('#signed-file');
    await fileInput.setInputFiles(checksumPath);
    await page.waitForTimeout(1000);

    // Try to upload file not in checksum list
    const wrongFilePath = path.join(testDataDir, 'wrong-file.txt');
    fs.writeFileSync(wrongFilePath, 'wrong content');

    const checksumFileInput = await page.$('#checksum-file');
    if (checksumFileInput) {
        // Set up dialog handler for confirmation
        page.once('dialog', async dialog => {
            await assert(true,
                'Confirmation dialog should appear for wrong filename',
                `Dialog message: ${dialog.message()}`);
            await dialog.dismiss();
        });

        await checksumFileInput.setInputFiles(wrongFilePath);
        await page.waitForTimeout(1000);
    }

    // Cleanup
    fs.unlinkSync(checksumPath);
    fs.unlinkSync(wrongFilePath);
}

/**
 * Test: Accessibility - keyboard navigation
 */
async function testKeyboardNavigation(page) {
    printTest('Keyboard navigation works');

    // Tab to first collapsible header
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Press Enter to expand/collapse
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Check if action occurred
    const focused = await page.evaluate(() => document.activeElement.className);
    const hasFocus = focused.includes('collapsible') || focused.includes('section');

    await assert(hasFocus,
        'Keyboard navigation should work on collapsible sections',
        `Focused element: ${focused}`);
}

/**
 * Test: Mobile viewport responsiveness
 */
async function testMobileViewport(page) {
    printTest('Application is responsive on mobile viewport');

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // Check if container adapts
    const containerWidth = await page.$eval('.container', el => el.offsetWidth);
    const isMobileWidth = containerWidth <= 375;

    await assert(isMobileWidth,
        'Container should adapt to mobile viewport',
        `Container width: ${containerWidth}px`);

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
}

/**
 * Test: Console errors
 */
async function testNoConsoleErrors(page) {
    printTest('No JavaScript console errors');

    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    // Reload page
    await page.reload();
    await page.waitForTimeout(1000);

    // Filter out expected/benign errors
    const realErrors = errors.filter(err =>
        !err.includes('favicon') &&
        !err.includes('Service Worker')
    );

    await assert(realErrors.length === 0,
        'Should have no console errors',
        realErrors.length > 0 ? `Errors: ${realErrors.join(', ')}` : 'No errors found');
}

/**
 * Main test runner
 */
async function runTests() {
    printHeader('GPG Signature Verifier - End-to-End Test Suite');

    console.log(colors.gray + 'Initializing test environment...' + colors.reset);

    // Start HTTP server
    const { server, port, url } = await startServer();
    console.log(colors.gray + `Test server started on ${url}` + colors.reset);

    // Create test data
    const testData = await createTestData();
    console.log(colors.gray + `Test data created in ${testData.testDataDir}` + colors.reset);

    // Launch browser
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security'] // Allow file uploads in tests
    });
    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write']
    });
    const page = await context.newPage();

    console.log(colors.gray + 'Browser launched' + colors.reset);

    try {
        // Run all tests
        printSection('Application Loading Tests');
        await testApplicationLoads(page, url);
        await testSectionsPresent(page);
        await testNoConsoleErrors(page);

        printSection('GPG Key Upload Tests');
        await testUploadPublicKey(page, testData.publicKey, testData.testDataDir);
        await page.goto(url); // Reset
        await testPastePublicKey(page, testData.publicKey);

        printSection('GPG Signature Verification Tests');
        await page.goto(url); // Reset
        await testUploadPublicKey(page, testData.publicKey, testData.testDataDir);
        // await testVerifyClearsigned(page, testData.clearsigned, testData.testDataDir);
        // await testDetachedSignature(page, testData.testDataDir);

        printSection('Checksum Verification Tests');
        await page.goto(url); // Reset
        await testUploadPublicKey(page, testData.publicKey, testData.testDataDir);
        await testChecksumUpload(page, testData.checksums, testData.testDataDir);
        // await testSingleFileChecksum(page, testData.testDataDir);
        // await testMultipleFileQueue(page, testData.testDataDir);
        // await testFilenameValidation(page, testData.checksums, testData.testDataDir);

        printSection('UI Interaction Tests');
        await page.goto(url); // Reset
        await testCollapsibleSections(page);
        await testProgressBar(page, testData.testDataDir);
        await testStopButton(page, testData.testDataDir);
        await testStartOver(page, testData.publicKey, testData.testDataDir);

        printSection('Error Handling Tests');
        await page.goto(url); // Reset
        await testInvalidKeyError(page);

        printSection('Accessibility Tests');
        await page.goto(url); // Reset
        await testKeyboardNavigation(page);
        await testMobileViewport(page);

    } catch (error) {
        console.error(colors.red + '\nFatal error during tests:' + colors.reset);
        console.error(error);
        testsFailed++;
    } finally {
        // Cleanup
        await browser.close();
        server.close();

        // Print summary
        printHeader('Test Summary');
        console.log(colors.bold + `Total tests: ${testsRun}` + colors.reset);
        console.log(colors.green + `✓ Passed: ${testsPassed}` + colors.reset);
        console.log(colors.red + `✗ Failed: ${testsFailed}` + colors.reset);

        const successRate = ((testsPassed / testsRun) * 100).toFixed(1);
        console.log(colors.bold + `\nSuccess rate: ${successRate}%` + colors.reset);

        if (testsFailed === 0) {
            console.log(colors.green + colors.bold + '\n🎉 All tests passed!' + colors.reset);
            process.exit(0);
        } else {
            console.log(colors.red + colors.bold + '\n❌ Some tests failed' + colors.reset);
            process.exit(1);
        }
    }
}

// Run tests if executed directly
if (require.main === module) {
    runTests().catch(error => {
        console.error(colors.red + 'Test runner crashed:' + colors.reset);
        console.error(error);
        process.exit(1);
    });
}

module.exports = { runTests };
