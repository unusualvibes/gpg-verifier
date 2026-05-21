#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const colors = {
    reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
    blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m'
};

let testsRun = 0, testsPassed = 0, testsFailed = 0;

function assert(condition, message, details = '') {
    testsRun++;
    if (condition) {
        testsPassed++;
        console.log(colors.green + '  ✓ ' + message + colors.reset);
        if (details) console.log(colors.gray + '    ' + details + colors.reset);
    } else {
        testsFailed++;
        console.log(colors.red + '  ✗ ' + message + colors.reset);
        if (details) console.log(colors.gray + '    ' + details + colors.reset);
    }
}

async function runTests() {
    console.log(colors.cyan + '='.repeat(60) + colors.reset);
    console.log(colors.cyan + 'fetch-keys.js Unit Tests' + colors.reset);
    console.log(colors.cyan + '='.repeat(60) + colors.reset + '\n');

    // The module must exist before these tests pass
    let mod;
    try {
        mod = require('../scripts/fetch-keys');
    } catch (e) {
        console.log(colors.red + '  ✗ scripts/fetch-keys.js must exist and export functions' + colors.reset);
        console.log(colors.gray + '    ' + e.message + colors.reset);
        process.exit(1);
    }

    const { buildDb, writeOutput } = mod;

    // --- writeOutput tests (no network needed) ---
    console.log(colors.blue + '▶ writeOutput' + colors.reset);

    const sampleDb = {
        'abcdef1234567890': {
            distro: 'TestDistro',
            label: 'TestDistro Release Key',
            fingerprint: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            armoredKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nfakekey\n-----END PGP PUBLIC KEY BLOCK-----'
        }
    };

    const output = writeOutput(sampleDb, '2026-05-21T00:00:00Z');

    assert(output.includes('window.KnownKeys'), 'writeOutput assigns window.KnownKeys');
    assert(output.includes('Auto-generated'), 'writeOutput includes auto-generated comment');
    assert(output.includes('Keys: 1'), 'writeOutput includes key count');
    assert(output.includes('2026-05-21T00:00:00Z'), 'writeOutput includes timestamp');
    assert(output.includes('abcdef1234567890'), 'writeOutput includes key ID');
    assert(output.includes('TestDistro'), 'writeOutput includes distro name');
    assert(output.includes('lookup'), 'writeOutput includes lookup function');

    // Verify the output is valid JS that sets window.KnownKeys
    const sandbox = {};
    try {
        const fn = new Function('window', output);
        fn(sandbox);
        assert(typeof sandbox.KnownKeys === 'object', 'writeOutput produces valid JS that sets window.KnownKeys');
        assert(typeof sandbox.KnownKeys.lookup === 'function', 'KnownKeys.lookup is a function');
        const found = sandbox.KnownKeys.lookup('ABCDEF1234567890');
        assert(found === null, 'lookup is case-insensitive (uppercase miss returns null — must lowercase)');
        const foundLower = sandbox.KnownKeys.lookup('abcdef1234567890');
        assert(foundLower !== null, 'lookup finds key by lowercase ID');
        assert(foundLower.distro === 'TestDistro', 'lookup returns full entry');
    } catch (e) {
        assert(false, 'writeOutput JS is executable', e.message);
    }

    // --- buildDb tests (mocked fetch) ---
    console.log('\n' + colors.blue + '▶ buildDb with mocked fetch' + colors.reset);

    // Read real test key for a realistic mock response
    const testKeyArmored = fs.readFileSync(path.join(__dirname, 'test-data/public-key.asc'), 'utf8');

    // Mock global fetch
    const originalFetch = globalThis.fetch;

    // Test: url strategy success
    globalThis.fetch = async (url) => {
        return {
            ok: true,
            arrayBuffer: async () => Buffer.from(testKeyArmored).buffer
        };
    };

    const urlSources = [{
        distro: 'MockDistro', label: 'Mock Release Key',
        strategy: 'url', url: 'https://example.com/key.asc'
    }];

    try {
        const { db, summary } = await buildDb(urlSources);
        assert(Object.keys(db).length === 1, 'url strategy: produces one db entry');
        const entry = Object.values(db)[0];
        assert(entry.distro === 'MockDistro', 'url strategy: entry has correct distro');
        assert(typeof entry.armoredKey === 'string', 'url strategy: entry has armoredKey');
        assert(entry.armoredKey.includes('BEGIN PGP'), 'url strategy: armoredKey is PGP armored');
        assert(typeof entry.fingerprint === 'string' && entry.fingerprint.length === 40, 'url strategy: entry has 40-char fingerprint');
        assert(summary.filter(s => !s.error).length === 1, 'url strategy: summary has one success');
    } catch (e) {
        assert(false, 'url strategy: buildDb succeeds', e.message);
    }

    // Test: keyserver strategy success
    globalThis.fetch = async (url) => {
        assert(url.includes('keys.openpgp.org'), 'keyserver strategy: queries keys.openpgp.org');
        assert(url.includes('TESTFINGERPRINT123'), 'keyserver strategy: includes fingerprint in URL');
        return {
            ok: true,
            arrayBuffer: async () => Buffer.from(testKeyArmored).buffer
        };
    };

    const keyserverSources = [{
        distro: 'MockKS', label: 'Mock KS Key',
        strategy: 'keyserver', keyserver: 'keys.openpgp.org',
        fingerprint: 'TEST FINGERPRINT 123'
    }];

    try {
        const { db } = await buildDb(keyserverSources);
        assert(Object.keys(db).length === 1, 'keyserver strategy: produces one db entry');
    } catch (e) {
        assert(false, 'keyserver strategy: buildDb succeeds', e.message);
    }

    // Test: fetch failure is skipped, exits non-zero via summary
    globalThis.fetch = async () => ({ ok: false, status: 404 });

    const failSources = [
        { distro: 'Good', label: 'OK', strategy: 'url', url: 'https://example.com/ok.asc' },
        { distro: 'Bad', label: 'Missing', strategy: 'url', url: 'https://example.com/missing.asc' }
    ];

    // Both will fail with mocked 404
    try {
        const { db, summary } = await buildDb(failSources);
        assert(Object.keys(db).length === 0, 'fetch failure: failed entries are skipped');
        assert(summary.filter(s => s.error).length === 2, 'fetch failure: failures recorded in summary');
    } catch (e) {
        assert(false, 'fetch failure: buildDb handles failures gracefully', e.message);
    }

    // Test: unknown strategy is treated as failure
    const unknownStrategySources = [{
        distro: 'Bad', label: 'Bad Strategy',
        strategy: 'ftp', url: 'ftp://example.com/key.asc'
    }];

    globalThis.fetch = originalFetch; // restore

    try {
        const { db, summary } = await buildDb(unknownStrategySources);
        assert(Object.keys(db).length === 0, 'unknown strategy: entry is skipped');
        assert(summary[0].error !== undefined, 'unknown strategy: error recorded in summary');
    } catch (e) {
        assert(false, 'unknown strategy: buildDb handles gracefully', e.message);
    }

    // Summary
    console.log('\n' + colors.cyan + '='.repeat(60) + colors.reset);
    console.log(`  Total: ${testsRun}  Passed: ${testsPassed}  Failed: ${testsFailed}`);
    process.exit(testsFailed === 0 ? 0 : 1);
}

runTests().catch(err => {
    console.error(colors.red + 'Test runner crashed: ' + err.message + colors.reset);
    process.exit(1);
});
