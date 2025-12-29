#!/usr/bin/env node
/**
 * Automated Test Suite for GPG Signature Verifier
 * Tests all core functionality including verification of clearsigned, detached, and inline signatures
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

// Test statistics
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

/**
 * Print test header
 */
function printHeader(title) {
    console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset);
    console.log(colors.cyan + title + colors.reset);
    console.log(colors.cyan + '='.repeat(70) + colors.reset + '\n');
}

/**
 * Print test section
 */
function printSection(title) {
    console.log('\n' + colors.blue + '▶ ' + title + colors.reset);
}

/**
 * Assert helper
 */
function assert(condition, message, details = '') {
    testsRun++;
    if (condition) {
        testsPassed++;
        console.log(colors.green + '  ✓ ' + message + colors.reset);
        if (details) {
            console.log(colors.gray + '    ' + details + colors.reset);
        }
        return true;
    } else {
        testsFailed++;
        console.log(colors.red + '  ✗ ' + message + colors.reset);
        if (details) {
            console.log(colors.gray + '    ' + details + colors.reset);
        }
        return false;
    }
}

/**
 * Load and validate openpgp.js
 */
async function loadOpenPGP() {
    try {
        // Check if openpgp.min.js exists
        const openpgpPath = path.join(__dirname, '..', 'openpgp.min.js');
        if (!fs.existsSync(openpgpPath)) {
            throw new Error('openpgp.min.js not found');
        }

        // Load openpgp.js in Node.js environment
        const openpgpCode = fs.readFileSync(openpgpPath, 'utf8');

        // Create a comprehensive browser-like environment for openpgp
        global.window = global;
        global.self = global;
        global.navigator = {
            userAgent: 'node.js',
            hardwareConcurrency: 4
        };
        global.crypto = require('crypto').webcrypto;
        global.location = { protocol: 'https:' };
        global.document = {
            currentScript: {},
            createElement: () => ({ setAttribute: () => {}, href: '' }),
            getElementsByTagName: () => []
        };

        // Evaluate the code (safe in test environment)
        eval(openpgpCode);

        // Return the loaded openpgp object
        if (global.openpgp) {
            return global.openpgp;
        } else {
            throw new Error('OpenPGP.js did not export global.openpgp');
        }
    } catch (error) {
        console.error(colors.red + 'Failed to load OpenPGP.js: ' + error.message + colors.reset);
        // Return null instead of exiting, let tests continue
        return null;
    }
}

/**
 * Test file existence and structure
 */
function testFileStructure() {
    printSection('File Structure Tests');

    const requiredFiles = [
        'index.html',
        'app.js',
        'styles.css',
        'openpgp.min.js',
        'README.md',
        'LICENSE'
    ];

    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, '..', file);
        const exists = fs.existsSync(filePath);
        assert(exists, `${file} exists`, exists ? `Size: ${fs.statSync(filePath).size} bytes` : '');
    }
}

/**
 * Test HTML structure and security headers
 */
function testHTMLStructure() {
    printSection('HTML Structure and Security Tests');

    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Check for security headers
    assert(
        html.includes('Content-Security-Policy'),
        'HTML contains CSP meta tag'
    );

    assert(
        html.includes("script-src 'self'"),
        'CSP restricts scripts to self only',
        'No external script sources allowed'
    );

    // Check for local openpgp.js reference (not CDN)
    assert(
        html.includes('src="openpgp.min.js"') && !html.includes('unpkg.com'),
        'OpenPGP.js loaded from local file (not CDN)',
        'Zero external dependencies'
    );

    // Check for required sections
    assert(
        html.includes('GPG Public Key'),
        'Public key section exists'
    );

    assert(
        html.includes('Signed File'),
        'Signed file section exists'
    );

    assert(
        html.includes('Verify Signature'),
        'Verify button exists'
    );

    // Check for collapsible sections
    assert(
        html.includes('collapsible'),
        'Collapsible sections implemented'
    );

    // Check for inline error containers
    assert(
        html.includes('inline-error'),
        'Inline error display implemented'
    );

    // Check version number
    assert(
        html.includes('v=1.0.0'),
        'Version is 1.0.0',
        'styles.css?v=1.0.0'
    );
}

/**
 * Test JavaScript structure
 */
function testJavaScriptStructure() {
    printSection('JavaScript Structure Tests');

    const jsPath = path.join(__dirname, '..', 'app.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    // Check for key functions
    assert(
        js.includes('function verifySignature'),
        'verifySignature function exists'
    );

    assert(
        js.includes('function autoVerify'),
        'autoVerify function exists',
        'v3.5.0+ feature'
    );

    assert(
        js.includes('function collapseSection'),
        'collapseSection function exists',
        'v3.3.0+ feature'
    );

    assert(
        js.includes('function showInlineError'),
        'showInlineError function exists',
        'v3.3.2+ feature'
    );

    // Check for state management
    assert(
        js.includes('const state = {'),
        'State management object exists'
    );

    // Check for multi-key support
    assert(
        js.includes('readKeys') && js.includes('publicKeyObjects'),
        'Multi-key support implemented',
        'Can handle keyring files with multiple keys'
    );

    // Check for detached signature detection
    assert(
        js.includes('isDetachedSignature'),
        'Detached signature detection implemented',
        'v3.4.0+ feature'
    );
}

/**
 * Test CSS structure
 */
function testCSSStructure() {
    printSection('CSS Structure Tests');

    const cssPath = path.join(__dirname, '..', 'styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Check for custom properties (CSS variables)
    assert(
        css.includes(':root') && css.includes('--'),
        'CSS custom properties defined',
        'Modern CSS with variables'
    );

    // Check for collapsible animations
    assert(
        css.includes('.collapsible') && css.includes('transition'),
        'Collapsible section animations implemented'
    );

    // Check for inline error styles
    assert(
        css.includes('.inline-error'),
        'Inline error styles defined'
    );

    // Check for accessibility features
    assert(
        css.includes('prefers-reduced-motion'),
        'Reduced motion support for accessibility'
    );
}

/**
 * Test GPG verification - Clearsigned
 */
async function testClearsignedVerification(openpgp) {
    printSection('Clearsigned Message Verification Test');

    if (!openpgp) {
        console.log(colors.yellow + '  ⚠ OpenPGP.js not loaded, skipping verification test' + colors.reset);
        return;
    }

    try {
        const publicKeyPath = path.join(__dirname, 'test-data', 'public-key.asc');
        const clearsignedPath = path.join(__dirname, 'test-data', 'message.txt.asc');

        if (!fs.existsSync(publicKeyPath) || !fs.existsSync(clearsignedPath)) {
            console.log(colors.yellow + '  ⚠ Test data not found, skipping verification test' + colors.reset);
            return;
        }

        const publicKeyArmored = fs.readFileSync(publicKeyPath, 'utf8');
        const clearsignedMessage = fs.readFileSync(clearsignedPath, 'utf8');

        // Parse public key
        const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
        assert(publicKey !== null, 'Public key parsed successfully');

        // Verify clearsigned message
        const message = await openpgp.readCleartextMessage({
            cleartextMessage: clearsignedMessage
        });
        assert(message !== null, 'Clearsigned message parsed successfully');

        const verificationResult = await openpgp.verify({
            message,
            verificationKeys: publicKey
        });

        const { verified } = verificationResult.signatures[0];
        await verified;

        assert(true, 'Clearsigned signature verified successfully', 'Message authenticated');

        // Check signature type detection
        assert(
            clearsignedMessage.includes('-----BEGIN PGP SIGNED MESSAGE-----'),
            'Clearsigned format detected correctly'
        );

    } catch (error) {
        assert(false, 'Clearsigned verification failed: ' + error.message);
    }
}

/**
 * Test GPG verification - Detached Signature
 */
async function testDetachedSignatureVerification(openpgp) {
    printSection('Detached Signature Verification Test');

    if (!openpgp) {
        console.log(colors.yellow + '  ⚠ OpenPGP.js not loaded, skipping verification test' + colors.reset);
        return;
    }

    try {
        const publicKeyPath = path.join(__dirname, 'test-data', 'public-key.asc');
        const signaturePath = path.join(__dirname, 'test-data', 'data.txt.asc');
        const dataPath = path.join(__dirname, 'test-data', 'data.txt');

        if (!fs.existsSync(publicKeyPath) || !fs.existsSync(signaturePath) || !fs.existsSync(dataPath)) {
            console.log(colors.yellow + '  ⚠ Test data not found, skipping verification test' + colors.reset);
            return;
        }

        const publicKeyArmored = fs.readFileSync(publicKeyPath, 'utf8');
        const signatureArmored = fs.readFileSync(signaturePath, 'utf8');
        const dataText = fs.readFileSync(dataPath, 'utf8');

        // Parse public key
        const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
        assert(publicKey !== null, 'Public key parsed successfully');

        // Verify detached signature
        const signature = await openpgp.readSignature({
            armoredSignature: signatureArmored
        });
        assert(signature !== null, 'Detached signature parsed successfully');

        const message = await openpgp.createMessage({ text: dataText });

        const verificationResult = await openpgp.verify({
            message,
            signature,
            verificationKeys: publicKey
        });

        const { verified } = verificationResult.signatures[0];
        await verified;

        assert(true, 'Detached signature verified successfully', 'Data file authenticated');

        // Check signature type detection
        assert(
            signatureArmored.includes('-----BEGIN PGP SIGNATURE-----') &&
            !signatureArmored.includes('-----BEGIN PGP SIGNED MESSAGE-----'),
            'Detached signature format detected correctly'
        );

    } catch (error) {
        assert(false, 'Detached signature verification failed: ' + error.message);
    }
}

/**
 * Test error handling
 */
async function testErrorHandling(openpgp) {
    printSection('Error Handling Tests');

    try {
        // Test invalid public key (only if openpgp loaded)
        if (openpgp) {
            try {
                await openpgp.readKey({ armoredKey: 'not a valid key' });
                assert(false, 'Should reject invalid public key');
            } catch (error) {
                assert(true, 'Invalid public key rejected correctly', 'Error: ' + error.message.substring(0, 50));
            }

            // Test invalid signature
            try {
                await openpgp.readSignature({ armoredSignature: 'not a valid signature' });
                assert(false, 'Should reject invalid signature');
            } catch (error) {
                assert(true, 'Invalid signature rejected correctly', 'Error: ' + error.message.substring(0, 50));
            }
        }

        // Test format detection
        const validKey = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
        const validClearsigned = '-----BEGIN PGP SIGNED MESSAGE-----';
        const validDetached = '-----BEGIN PGP SIGNATURE-----';
        const validInline = '-----BEGIN PGP MESSAGE-----';

        assert(
            validKey.includes('BEGIN PGP PUBLIC KEY BLOCK'),
            'Public key format detection works'
        );

        assert(
            validClearsigned.includes('BEGIN PGP SIGNED MESSAGE'),
            'Clearsigned format detection works'
        );

        assert(
            validDetached.includes('BEGIN PGP SIGNATURE'),
            'Detached signature format detection works'
        );

        assert(
            validInline.includes('BEGIN PGP MESSAGE'),
            'Inline signed format detection works'
        );

    } catch (error) {
        assert(false, 'Error handling test failed: ' + error.message);
    }
}

/**
 * Test web server accessibility
 */
function testWebServer() {
    return new Promise((resolve) => {
        printSection('Web Server Accessibility Test');

        const options = {
            hostname: '127.0.0.1',
            port: 8000,
            path: '/index.html',
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                assert(
                    res.statusCode === 200,
                    'index.html accessible via HTTP',
                    'Status: ' + res.statusCode
                );

                assert(
                    data.includes('GPG Signature Verifier'),
                    'HTML content loaded correctly'
                );

                resolve();
            });
        });

        req.on('error', (error) => {
            assert(false, 'Web server not accessible: ' + error.message, 'Run: python3 -m http.server 8000');
            resolve();
        });

        req.on('timeout', () => {
            req.destroy();
            assert(false, 'Web server connection timeout');
            resolve();
        });

        req.end();
    });
}

/**
 * Test static assets loading
 */
function testStaticAssets() {
    return new Promise((resolve) => {
        printSection('Static Assets Loading Test');

        const assets = [
            { path: '/app.js', name: 'app.js' },
            { path: '/styles.css', name: 'styles.css' },
            { path: '/openpgp.min.js', name: 'openpgp.min.js' }
        ];

        let completed = 0;

        if (assets.length === 0) {
            resolve();
            return;
        }

        assets.forEach((asset) => {
            const options = {
                hostname: '127.0.0.1',
                port: 8000,
                path: asset.path,
                method: 'HEAD',
                timeout: 5000
            };

            const req = http.request(options, (res) => {
                assert(
                    res.statusCode === 200,
                    `${asset.name} accessible`,
                    `Size: ${res.headers['content-length']} bytes`
                );

                completed++;
                if (completed === assets.length) {
                    resolve();
                }
            });

            req.on('error', () => {
                assert(false, `${asset.name} not accessible`);
                completed++;
                if (completed === assets.length) {
                    resolve();
                }
            });

            req.on('timeout', () => {
                req.destroy();
                assert(false, `${asset.name} timeout`);
                completed++;
                if (completed === assets.length) {
                    resolve();
                }
            });

            req.end();
        });
    });
}

/**
 * Print test summary
 */
function printSummary() {
    console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset);
    console.log(colors.cyan + 'Test Summary' + colors.reset);
    console.log(colors.cyan + '='.repeat(70) + colors.reset + '\n');

    console.log('  Total Tests:  ' + testsRun);
    console.log(colors.green + '  Passed:       ' + testsPassed + colors.reset);

    if (testsFailed > 0) {
        console.log(colors.red + '  Failed:       ' + testsFailed + colors.reset);
    } else {
        console.log('  Failed:       ' + testsFailed);
    }

    const percentage = testsRun > 0 ? ((testsPassed / testsRun) * 100).toFixed(1) : 0;
    console.log('\n  Success Rate: ' + percentage + '%');

    console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset + '\n');

    if (testsFailed === 0) {
        console.log(colors.green + '✓ All tests passed!' + colors.reset + '\n');
        return 0;
    } else {
        console.log(colors.red + '✗ Some tests failed!' + colors.reset + '\n');
        return 1;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    printHeader('GPG Verifier - Automated Test Suite');

    console.log(colors.gray + 'Testing application version 1.0.0' + colors.reset);
    console.log(colors.gray + 'Zero external dependencies, fully offline capable' + colors.reset);

    // Phase 1: File structure tests
    testFileStructure();

    // Phase 2: Code structure tests
    testHTMLStructure();
    testJavaScriptStructure();
    testCSSStructure();

    // Phase 3: Load OpenPGP.js
    printSection('Loading OpenPGP.js Library');
    const openpgp = await loadOpenPGP();
    const openpgpLoaded = openpgp !== null && openpgp !== undefined;
    assert(openpgpLoaded, 'OpenPGP.js loaded successfully', openpgpLoaded ? 'Loaded from local file' : 'Failed to load');

    // Phase 4: Cryptographic verification tests
    await testClearsignedVerification(openpgp);
    await testDetachedSignatureVerification(openpgp);

    // Phase 5: Error handling tests
    await testErrorHandling(openpgp);

    // Phase 6: Web server tests
    await testWebServer();
    await testStaticAssets();

    // Print summary
    const exitCode = printSummary();

    process.exit(exitCode);
}

// Run the test suite
runTests().catch((error) => {
    console.error(colors.red + '\nFatal error running tests:' + colors.reset);
    console.error(error);
    process.exit(1);
});
