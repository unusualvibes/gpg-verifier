#!/usr/bin/env node
/**
 * Structural test suite for GPG Verifier
 *
 * Keeps fast checks local to Node.js and leaves browser behavior to Playwright.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');

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
    console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset);
    console.log(colors.cyan + title + colors.reset);
    console.log(colors.cyan + '='.repeat(70) + colors.reset + '\n');
}

function printSection(title) {
    console.log('\n' + colors.blue + '▶ ' + title + colors.reset);
}

function assert(condition, message, details = '') {
    testsRun++;
    if (condition) {
        testsPassed++;
        console.log(colors.green + '  ✓ ' + message + colors.reset);
        if (details) {
            console.log(colors.gray + '    ' + details + colors.reset);
        }
        return;
    }

    testsFailed++;
    console.log(colors.red + '  ✗ ' + message + colors.reset);
    if (details) {
        console.log(colors.gray + '    ' + details + colors.reset);
    }
}

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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
                    '.css': 'text/css; charset=utf-8'
                };

                res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain; charset=utf-8' });
                res.end(data);
            });
        });

        server.listen(0, () => {
            resolve({ server, port: server.address().port });
        });
    });
}

function request({ port, path: requestPath, method = 'GET' }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: requestPath,
            method
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => resolve({ statusCode: res.statusCode, body, headers: res.headers }));
        });

        req.on('error', reject);
        req.end();
    });
}

function testFileStructure() {
    printSection('File Structure');

    const requiredFiles = [
        'index.html',
        'app.js',
        'checksum-addon.js',
        'styles.css',
        'openpgp.min.js',
        'sha256.min.js',
        'hash-wasm-sha256.min.js',
        'test/e2e-tests.js'
    ];

    for (const file of requiredFiles) {
        const fullPath = path.join(ROOT, file);
        assert(fs.existsSync(fullPath), `${file} exists`, fs.existsSync(fullPath) ? `${fs.statSync(fullPath).size} bytes` : '');
    }
}

function testHTMLStructure() {
    printSection('HTML Structure');

    const html = readProjectFile('index.html');

    assert(html.includes('Content-Security-Policy'), 'HTML contains CSP meta tag');
    assert(html.includes("default-src 'none'"), 'CSP defaults to deny');
    assert(html.includes("script-src 'self' 'wasm-unsafe-eval'"), 'CSP only allows local scripts plus wasm eval');
    assert(html.includes('id="app-status"'), 'Persistent status panel exists');
    assert(html.includes('id="theme-toggle"'), 'Theme toggle exists');
    assert(html.includes('Verification starts automatically'), 'Header copy matches auto-verification flow');
    assert(html.includes('The verifier starts automatically'), 'Footer instructions match auto-verification flow');
    assert(html.includes('id="checksum-container"'), 'Checksum container exists');
}

function testJavaScriptStructure() {
    printSection('JavaScript Structure');

    const appJs = readProjectFile('app.js');
    const checksumJs = readProjectFile('checksum-addon.js');

    assert(appJs.includes('function escapeHTML'), 'Main app escapes untrusted HTML');
    assert(appJs.includes('function updateStatus'), 'Main app has explicit status updates');
    assert(appJs.includes('function setTheme'), 'Main app applies a persisted theme');
    assert(appJs.includes("localStorage.getItem('gpg-verifier-theme')"), 'Main app loads saved theme preference');
    assert(appJs.includes('await signatureEntry.verified'), 'Main app verifies every returned signature');
    assert(!appJs.includes('error.htmlMessage'), 'Main app no longer renders raw htmlMessage content');

    assert(checksumJs.includes('const SHA256_HEX_LENGTH = 64;'), 'Checksum module is explicit about SHA-256 support');
    assert(checksumJs.includes('function escapeHTML'), 'Checksum module escapes untrusted HTML');
    assert(checksumJs.includes('filename: hash format'), 'Checksum parser supports filename-colon format');
    assert(!checksumJs.includes('SHA512|SHA1|MD5'), 'Checksum parser no longer advertises unsupported algorithms');
}

function testCSSStructure() {
    printSection('CSS Structure');

    const stylesCss = readProjectFile('styles.css');

    assert(/--[a-z0-9-]+\s*:/.test(stylesCss), 'Stylesheet defines CSS custom properties');
    assert(stylesCss.includes('.collapsible-content') && stylesCss.includes('transition:'), 'Collapsible content includes transition styling');
    assert(stylesCss.includes('.inline-error {') && stylesCss.includes('border-left: 4px solid var(--color-error);'), 'Inline error styles are defined');
    assert(stylesCss.includes('@media (prefers-reduced-motion: reduce)'), 'Reduced motion media query exists');
}

function testCoreFunctionExistence() {
    printSection('Core Function Existence');

    const appJs = readProjectFile('app.js');

    assert(appJs.includes('async function verifySignature()'), 'Main app exposes verifySignature implementation');
    assert(appJs.includes('function collapseSection(section, summary)'), 'Main app exposes collapseSection helper');
    assert(appJs.includes('function showInlineError(errorElement, title, message)'), 'Main app exposes showInlineError helper');
    assert(appJs.includes('const state = {'), 'Main app defines central state object');
}

function testInlineSignedFormatDetection() {
    printSection('Inline Signed Format');

    const appJs = readProjectFile('app.js');

    assert(appJs.includes("MESSAGE: '-----BEGIN PGP MESSAGE-----'"), 'PGP inline signed marker is defined');
    assert(appJs.includes('if (content.includes(PGP_MARKERS.MESSAGE))'), 'Inline signed format is detectable in signature type detection');
    assert(appJs.includes('signatureType: typeLabel') && appJs.includes("typeLabel = 'Inline Signed';"), 'Inline signed type is surfaced in verification results');
}

async function testServer() {
    printSection('Local Server');

    const { server, port } = await startServer();

    try {
        const indexResponse = await request({ port, path: '/index.html' });
        assert(indexResponse.statusCode === 200, 'index.html is served over HTTP', `status ${indexResponse.statusCode}`);
        assert(indexResponse.body.includes('GPG Verifier'), 'Served HTML contains application title');

        for (const assetPath of ['/app.js', '/checksum-addon.js', '/styles.css', '/openpgp.min.js']) {
            const response = await request({ port, path: assetPath, method: 'HEAD' });
            assert(response.statusCode === 200, `${assetPath} responds to HEAD`, `status ${response.statusCode}`);
        }
    } finally {
        server.close();
    }
}

function printSummary() {
    console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset);
    console.log(colors.cyan + 'Test Summary' + colors.reset);
    console.log(colors.cyan + '='.repeat(70) + colors.reset + '\n');

    console.log(`  Total Tests:  ${testsRun}`);
    console.log(colors.green + `  Passed:       ${testsPassed}` + colors.reset);
    console.log((testsFailed ? colors.red : '') + `  Failed:       ${testsFailed}` + colors.reset);
    console.log(`\n  Success Rate: ${testsRun === 0 ? '0.0' : ((testsPassed / testsRun) * 100).toFixed(1)}%`);

    console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset + '\n');
    return testsFailed === 0 ? 0 : 1;
}

async function runTests() {
    printHeader('GPG Verifier - Structural Test Suite');

    testFileStructure();
    testHTMLStructure();
    testJavaScriptStructure();
    testCSSStructure();
    testCoreFunctionExistence();
    testInlineSignedFormatDetection();
    await testServer();

    process.exit(printSummary());
}

runTests().catch((error) => {
    console.error(colors.red + 'Fatal error running tests:' + colors.reset);
    console.error(error);
    process.exit(1);
});
