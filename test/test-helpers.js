#!/usr/bin/env node
/**
 * Test Helper Utilities
 *
 * Provides helper functions and test data generation for GPG signature verifier tests
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate test files with known SHA-256 hashes
 */
function generateTestFiles(outputDir) {
    const testFiles = [
        { name: 'test-file-1.txt', content: '', expectedHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
        { name: 'test-file-2.txt', content: '0', expectedHash: '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9' },
        { name: 'test-file-3.txt', content: '1', expectedHash: '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b' },
        { name: 'test-file-4.txt', content: 'Hello, World!', expectedHash: 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f' },
    ];

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const checksums = [];

    testFiles.forEach(file => {
        const filePath = path.join(outputDir, file.name);
        fs.writeFileSync(filePath, file.content);

        // Verify hash
        const hash = crypto.createHash('sha256').update(file.content).digest('hex');
        if (hash !== file.expectedHash) {
            console.warn(`Warning: Hash mismatch for ${file.name}`);
            console.warn(`  Expected: ${file.expectedHash}`);
            console.warn(`  Got:      ${hash}`);
        }

        checksums.push(`${file.expectedHash}  ${file.name}`);
    });

    // Write SHA256SUMS file
    const checksumsPath = path.join(outputDir, 'SHA256SUMS');
    fs.writeFileSync(checksumsPath, checksums.join('\n') + '\n');

    // Write CHECKSUM file (different format)
    const checksumPath = path.join(outputDir, 'CHECKSUM');
    const checksumContent = testFiles.map(file =>
        `${file.name}: ${file.expectedHash}`
    ).join('\n') + '\n';
    fs.writeFileSync(checksumPath, checksumContent);

    return {
        files: testFiles.map(f => f.name),
        checksumFile: checksumsPath,
        alternateChecksumFile: checksumPath
    };
}

/**
 * Generate a large test file for performance testing
 */
function generateLargeFile(outputDir, sizeInMB = 10) {
    const filePath = path.join(outputDir, `test-large-${sizeInMB}mb.bin`);
    const chunkSize = 1024 * 1024; // 1MB chunks
    const buffer = Buffer.alloc(chunkSize, 'x');

    const stream = fs.createWriteStream(filePath);

    for (let i = 0; i < sizeInMB; i++) {
        stream.write(buffer);
    }

    stream.end();

    return new Promise((resolve) => {
        stream.on('finish', () => {
            // Calculate hash
            const hash = crypto.createHash('sha256');
            const readStream = fs.createReadStream(filePath);

            readStream.on('data', chunk => hash.update(chunk));
            readStream.on('end', () => {
                const fileHash = hash.digest('hex');
                resolve({
                    path: filePath,
                    hash: fileHash,
                    size: sizeInMB * 1024 * 1024
                });
            });
        });
    });
}

/**
 * Create a real GPG test key pair (requires gpg command)
 */
async function generateGPGKeyPair(name = 'Test User', email = 'test@example.com') {
    const { execSync } = require('child_process');

    try {
        // Check if gpg is available
        execSync('gpg --version', { stdio: 'ignore' });

        // Generate key with batch mode
        const batchConfig = `
Key-Type: RSA
Key-Length: 2048
Subkey-Type: RSA
Subkey-Length: 2048
Name-Real: ${name}
Name-Email: ${email}
Expire-Date: 0
%no-protection
%commit
`;

        const configPath = '/tmp/gpg-batch-config';
        fs.writeFileSync(configPath, batchConfig);

        execSync(`gpg --batch --generate-key ${configPath}`, { stdio: 'ignore' });

        // Export public key
        const publicKey = execSync(`gpg --armor --export ${email}`).toString();

        // Clean up
        execSync(`gpg --batch --yes --delete-secret-and-public-key ${email}`, { stdio: 'ignore' });
        fs.unlinkSync(configPath);

        return { publicKey, email };

    } catch (error) {
        console.warn('GPG not available, using sample key instead');
        return {
            publicKey: getSamplePublicKey(),
            email: 'sample@example.com'
        };
    }
}

/**
 * Sample GPG public key for testing (when gpg command is not available)
 */
function getSamplePublicKey() {
    return `-----BEGIN PGP PUBLIC KEY BLOCK-----

mQINBGbxGJ0BEADLrH5T8F8VxQOKCL3dY4zqYW8gV7tJ4Y3zN1P5vN8xK9Q7fM2L
rN5W8nV7tJ9Y2zK8P5vM1xN6Q4fL2M7H5rT8F8VxQOKCL3dY4zqYW8gV7tJ4Y3z
N1P5vN8xK9Q7fM2LrN5W8nV7tJ9Y2zK8P5vM1xN6Q4fL2M7H5rT8F8VxQOKCL3d
Y4zqYW8gV7tJ4Y3zN1P5vN8xK9Q7fM2LrN5W8nV7tJ9Y2zK8P5vM1xN6Q4fL2M7
H5rT8F8VxQOKCL3dY4zqYW8gV7tJ4Y3zN1P5vN8xK9Q7fM2LrN5W8nV7tJ9Y2zK
8P5vM1xN6Q4fL2M7H5rT8F8VxQOKCL3dY4zqYW8gV7tJ4Y3zN1P5vN8xK9Q7fM2
LrN5W8nV7tJ9Y2zK8P5vM1xN6Q4fL2M7H5rT8F8VxQOKCL3dY4zqYW8gV7tJ4Y3
zN1P5vN8xK9Q7fM2LrN5W8nV7tJ9Y2zK8P5vM1xN6Q4fL2M7H5rT8F8VxQOKCL
3dY4zqYW8gV7tJ4Y3zN1P5vN8xK9Q7fM2LrN5W8nV7tJ9Y2zK8P5vM1xN6Q4fL
2M7H5rT8F8VxQOKCL3dY4zqYW8gV7tJ4Y3zN1P5vN8xK9Q7fM2LrN5W8nV7tJ9
Y2zK8P5vM1xN6Q4fL2M7H5rT8F8VxQOKCL3dY4zqYW8gV7tJ4Y3zN1P5vN8xK9
Q7fM2LrN5W8nV7tJ9Y2zK8P5vM1xN6Q4fL2M7H5rT8F8VxQOKCL3dY4zqYW8gV
7tJ4Y3zN1P5vN8xK9Q7fM2LrN5W8nV7tJ9Y2zK8P5vM1xN6Q4fL2M7QAREFA
BEAAQAL
=abcd
-----END PGP PUBLIC KEY BLOCK-----`;
}

/**
 * Sample clearsigned message
 */
function getSampleClearsignedMessage() {
    return `-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

This is a test message for verification.
It contains multiple lines.
And should verify successfully with the correct key.
-----BEGIN PGP SIGNATURE-----

iQIzBAEBCAAdFiEEexamplekeyidexamplekeyidexamplekeyidFiEEE
exampleexampleexampleexampleexampleexampleexampleexample
exampleexampleexampleexampleexampleexampleexampleexample
=abcd
-----END PGP SIGNATURE-----`;
}

/**
 * Calculate SHA-256 hash of a file
 */
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Wait for a specific amount of time
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function until it succeeds or max attempts reached
 */
async function retry(fn, maxAttempts = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxAttempts) {
                throw error;
            }
            await sleep(delayMs);
        }
    }
}

/**
 * Clean up test files
 */
function cleanupTestFiles(directory) {
    if (fs.existsSync(directory)) {
        const files = fs.readdirSync(directory);
        files.forEach(file => {
            const filePath = path.join(directory, file);
            if (fs.lstatSync(filePath).isDirectory()) {
                cleanupTestFiles(filePath);
                fs.rmdirSync(filePath);
            } else {
                fs.unlinkSync(filePath);
            }
        });
    }
}

/**
 * Create test data directory structure
 */
function setupTestEnvironment() {
    const testDir = path.join(__dirname, 'test-data');

    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }

    // Generate test files
    const testFiles = generateTestFiles(testDir);

    console.log('Test environment setup complete:');
    console.log(`  Test directory: ${testDir}`);
    console.log(`  Test files: ${testFiles.files.length}`);
    console.log(`  Checksum files: SHA256SUMS, CHECKSUM`);

    return {
        testDir,
        testFiles
    };
}

/**
 * Main setup function
 */
if (require.main === module) {
    console.log('Setting up test environment...\n');
    const env = setupTestEnvironment();
    console.log('\n✓ Test environment ready!');
    console.log(`\nTest files created in: ${env.testDir}`);
}

module.exports = {
    generateTestFiles,
    generateLargeFile,
    generateGPGKeyPair,
    getSamplePublicKey,
    getSampleClearsignedMessage,
    calculateFileHash,
    sleep,
    retry,
    cleanupTestFiles,
    setupTestEnvironment
};
