/**
 * Checksum Verification Addon for GPG Signature Verifier
 * Detects checksum files and allows verification of file integrity
 *
 * @version 2.0.0
 */

(function() {
    'use strict';

    // DOM Elements for checksum verification
    const checksumElements = {
        container: document.getElementById('checksum-container'),
        list: document.getElementById('checksum-list'),
        fileInput: document.getElementById('checksum-file'),
        fileInfo: document.getElementById('checksum-file-info'),
        result: document.getElementById('checksum-result'),
        verifyBtn: document.getElementById('checksum-verify-btn'),
        stopBtn: document.getElementById('checksum-stop-btn'),
        queue: document.getElementById('checksum-queue')
    };

    // Store parsed checksums
    let parsedChecksums = {};
    let verifiedContent = '';
    let verifiedFiles = new Set(); // Track which files have been successfully verified

    // Queue management
    let fileQueue = [];
    let isProcessingQueue = false;

    // State management for checksum verification
    const checksumState = {
        isVerifying: false,
        verificationAborted: false,
        currentFile: null
    };

    /**
     * Detects if content contains checksum lines
     * @param {string} content - Content to check
     * @returns {boolean} True if checksums detected
     */
    function containsChecksums(content) {
        // Match multiple checksum formats:
        // Format 1: hash  filename (standard)
        const standardPattern = /^([0-9a-f]{32,128})\s+([^\s].+)$/gm;
        if (standardPattern.test(content)) return true;

        // Format 2: SHA256 (filename) = hash (BSD/Fedora style)
        const bsdPattern = /^(?:SHA256|SHA512|SHA1|MD5)\s*\([^)]+\)\s*=\s*([0-9a-f]{32,128})/gim;
        if (bsdPattern.test(content)) return true;

        return false;
    }

    /**
     * Parses checksum file content
     * @param {string} content - Checksum file content
     * @returns {object} Parsed checksums { filename: hash }
     */
    function parseChecksums(content) {
        const checksums = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue; // Skip empty lines and comments

            // Try multiple formats:

            // Format 1: Standard format (hash  filename) or (hash *filename for binary)
            let match = trimmed.match(/^([0-9a-f]{32,128})\s+[\*\s]?(.+)$/i);
            if (match) {
                const hash = match[1].toLowerCase();
                let filename = match[2].trim();
                // Remove path components, keep just filename
                filename = filename.split(/[\/\\]/).pop();
                checksums[filename] = hash;
                continue;
            }

            // Format 2: BSD/Fedora format (SHA256 (filename) = hash)
            match = trimmed.match(/^(?:SHA256|SHA512|SHA1|MD5)\s*\(([^)]+)\)\s*=\s*([0-9a-f]{32,128})/i);
            if (match) {
                let filename = match[1].trim();
                const hash = match[2].toLowerCase();
                // Remove path components, keep just filename
                filename = filename.split(/[\/\\]/).pop();
                checksums[filename] = hash;
                continue;
            }

            // Format 3: hash = filename format
            match = trimmed.match(/^([0-9a-f]{32,128})\s*=\s*(.+)$/i);
            if (match) {
                const hash = match[1].toLowerCase();
                let filename = match[2].trim();
                filename = filename.split(/[\/\\]/).pop();
                checksums[filename] = hash;
            }
        }

        return checksums;
    }

    /**
     * Determines hash algorithm from hash length
     * @param {string} hash - Hash string
     * @returns {string} Algorithm name
     */
    function getHashAlgorithm(hash) {
        switch (hash.length) {
            case 32: return 'MD5';
            case 40: return 'SHA-1';
            case 64: return 'SHA-256';
            case 128: return 'SHA-512';
            default: return 'Unknown';
        }
    }

    /**
     * Gets reference to local checksum progress bar elements
     */
    function getProgressElements() {
        return {
            container: document.getElementById('checksum-progress-container'),
            fill: document.getElementById('checksum-progress-fill'),
            text: document.getElementById('checksum-progress-text')
        };
    }

    /**
     * Shows progress using local checksum progress bar
     */
    function showProgress(percent, message) {
        const progress = getProgressElements();
        if (progress.container && progress.fill && progress.text) {
            progress.container.style.display = 'block';
            progress.fill.style.width = `${percent}%`;
            if (progress.fill.parentElement) {
                progress.fill.parentElement.setAttribute('aria-valuenow', percent);
            }
            progress.text.textContent = message;
        }
    }

    /**
     * Hides progress bar
     */
    function hideProgress() {
        const progress = getProgressElements();
        if (progress.container && progress.fill && progress.text) {
            progress.container.style.display = 'none';
            progress.fill.style.width = '0%';
            if (progress.fill.parentElement) {
                progress.fill.parentElement.setAttribute('aria-valuenow', 0);
            }
            progress.text.textContent = '';
        }
    }

    /**
     * Calculates SHA-256 hash of a file using maximum performance approach
     * Uses WebAssembly when available for near-native sha256sum performance
     * @param {File} file - File to hash
     * @param {Function} progressCallback - Optional callback for progress updates (percent, bytes)
     * @returns {Promise<string>} Hex hash string
     */
    async function calculateFileHash(file, progressCallback) {
        const startTime = performance.now();
        console.log(`Starting hash calculation for ${file.name} (${formatFileSize(file.size)})`);

        // Check what's available
        console.log('Available APIs:');
        console.log(`  - hashwasm: ${typeof hashwasm !== 'undefined' ? 'YES' : 'NO'}`);
        console.log(`  - hashwasm.createSHA256: ${typeof hashwasm !== 'undefined' && hashwasm.createSHA256 ? 'YES' : 'NO'}`);
        console.log(`  - File.stream(): ${file.stream && typeof file.stream === 'function' ? 'YES' : 'NO'}`);
        console.log(`  - WebAssembly: ${typeof WebAssembly !== 'undefined' ? 'YES' : 'NO'}`);

        let result;
        let method;

        // Try WebAssembly implementation first (fastest - near-native performance)
        if (typeof hashwasm !== 'undefined' && hashwasm.createSHA256) {
            console.log('🚀 Using WebAssembly SHA-256 (near-native performance!)');
            method = 'WebAssembly';
            result = await calculateHashWASM(file, progressCallback);
        }
        // Try to use native ReadableStream from File API (fast)
        else if (file.stream && typeof file.stream === 'function') {
            console.log('⚡ Using native File.stream() API with js-sha256');
            method = 'File.stream() + js-sha256';
            result = await calculateHashWithFileStream(file, progressCallback);
        }
        // Fallback to optimized chunked reading
        else {
            const chunkSize = 256 * 1024 * 1024; // 256MB chunks for maximum throughput
            const chunks = Math.ceil(file.size / chunkSize);
            console.log(`📦 Using optimized chunked reading: ${chunks} chunks of ${formatFileSize(chunkSize)}`);
            method = 'Chunked reading + js-sha256';
            result = await calculateHashStreaming(file, chunkSize, chunks, progressCallback);
        }

        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        const throughput = (file.size / (1024 * 1024) / (endTime - startTime) * 1000).toFixed(2);

        console.log(`✅ Hash complete in ${duration}s using ${method}`);
        console.log(`   Throughput: ${throughput} MB/s`);
        console.log(`   Hash: ${result}`);

        return result;
    }

    /**
     * Ultra-fast WebAssembly SHA-256 hashing
     * This achieves near-native sha256sum performance (2-5 seconds for multi-GB files)
     */
    async function calculateHashWASM(file, progressCallback) {
        try {
            // Create WASM hasher instance
            const hasher = await hashwasm.createSHA256();

            // Use native file stream for optimal I/O
            if (file.stream && typeof file.stream === 'function') {
                const stream = file.stream();
                const reader = stream.getReader();

                let processedBytes = 0;
                let lastProgressUpdate = 0;
                const progressInterval = 100 * 1024 * 1024; // Update every 100MB (less UI overhead)

                try {
                    // Hot loop - no checks, minimal overhead for maximum throughput
                    while (true) {
                        const { done, value } = await reader.read();

                        if (done) {
                            break;
                        }

                        // Update WASM hash with this chunk (no overhead)
                        hasher.update(value);
                        processedBytes += value.length;

                        // Only update progress every 250MB to minimize overhead
                        if (processedBytes - lastProgressUpdate >= 250 * 1024 * 1024) {
                            // Quick abort check only during progress updates
                            if (checksumState.verificationAborted) {
                                reader.releaseLock();
                                throw new Error('Checksum calculation stopped by user');
                            }

                            const percent = Math.min(99, Math.round((processedBytes / file.size) * 100));
                            if (progressCallback) {
                                progressCallback(percent, processedBytes);
                            }
                            lastProgressUpdate = processedBytes;
                        }
                    }

                    // Final progress update
                    if (progressCallback) {
                        progressCallback(100, processedBytes);
                    }

                    // Finalize and get hash
                    const hashHex = hasher.digest('hex');
                    console.log(`WASM hash complete: ${hashHex} (${formatFileSize(processedBytes)} processed)`);
                    return hashHex;

                } catch (error) {
                    reader.releaseLock();
                    throw error;
                }
            } else {
                // Fallback: chunk-based reading with WASM
                const chunkSize = 256 * 1024 * 1024;
                const chunks = Math.ceil(file.size / chunkSize);
                let processedBytes = 0;

                for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
                    if (checksumState.verificationAborted) {
                        throw new Error('Checksum calculation stopped by user');
                    }

                    const start = chunkIndex * chunkSize;
                    const end = Math.min(start + chunkSize, file.size);
                    const blob = file.slice(start, end);
                    const arrayBuffer = await blob.arrayBuffer();

                    hasher.update(new Uint8Array(arrayBuffer));
                    processedBytes = end;

                    const percent = Math.min(99, Math.round((processedBytes / file.size) * 100));
                    if (progressCallback) {
                        progressCallback(percent, processedBytes);
                    }
                }

                if (progressCallback) {
                    progressCallback(100, processedBytes);
                }

                const hashHex = hasher.digest('hex');
                console.log(`WASM hash complete: ${hashHex} (${formatFileSize(processedBytes)} processed)`);
                return hashHex;
            }
        } catch (error) {
            console.error('WASM hashing failed, falling back:', error);
            // Fall back to js-sha256 if WASM fails
            if (file.stream && typeof file.stream === 'function') {
                return await calculateHashWithFileStream(file, progressCallback);
            } else {
                const chunkSize = 256 * 1024 * 1024;
                const chunks = Math.ceil(file.size / chunkSize);
                return await calculateHashStreaming(file, chunkSize, chunks, progressCallback);
            }
        }
    }

    /**
     * Ultra-fast hashing using native File.stream() API
     * This approach is closest to native sha256sum performance
     */
    async function calculateHashWithFileStream(file, progressCallback) {
        if (typeof sha256 === 'undefined') {
            throw new Error('SHA-256 library not loaded. Please refresh the page.');
        }

        const hash = sha256.create();
        const stream = file.stream();
        const reader = stream.getReader();

        let processedBytes = 0;
        let lastProgressUpdate = 0;
        const progressInterval = 100 * 1024 * 1024; // Update every 100MB (less UI overhead)

        try {
            while (true) {
                // Check if verification was aborted
                if (checksumState.verificationAborted) {
                    reader.releaseLock();
                    throw new Error('Checksum calculation stopped by user');
                }

                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                // Update hash with this chunk (native stream chunks are optimized by browser)
                hash.update(value);
                processedBytes += value.length;

                // Update progress periodically
                if (processedBytes - lastProgressUpdate >= progressInterval) {
                    const percent = Math.min(99, Math.round((processedBytes / file.size) * 100));
                    if (progressCallback) {
                        progressCallback(percent, processedBytes);
                    }
                    lastProgressUpdate = processedBytes;
                }
            }

            // Final progress update
            if (progressCallback) {
                progressCallback(100, processedBytes);
            }

            const hashHex = hash.hex();
            console.log(`Hash calculation complete: ${hashHex} (${formatFileSize(processedBytes)} processed)`);
            return hashHex;

        } catch (error) {
            reader.releaseLock();
            throw error;
        }
    }


    /**
     * Optimized streaming hash using js-sha256 library
     * Uses large chunks and minimal overhead for maximum throughput
     */
    async function calculateHashStreaming(file, chunkSize, chunks, progressCallback) {
        if (typeof sha256 === 'undefined') {
            throw new Error('SHA-256 library not loaded. Please refresh the page.');
        }

        const hash = sha256.create();
        let processedBytes = 0;

        // Process chunks as fast as possible
        for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
            // Check if verification was aborted
            if (checksumState.verificationAborted) {
                throw new Error('Checksum calculation stopped by user');
            }

            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const blob = file.slice(start, end);

            // Read chunk directly with arrayBuffer (fast, single allocation)
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Update hash with this chunk
            hash.update(uint8Array);

            processedBytes = end;

            // Update progress
            const percent = Math.min(99, Math.round((processedBytes / file.size) * 100));
            if (progressCallback) {
                progressCallback(percent, processedBytes);
            }
        }

        // Final progress
        if (progressCallback) {
            progressCallback(100, processedBytes);
        }

        const hashHex = hash.hex();
        console.log(`Hash calculation complete: ${hashHex} (${formatFileSize(processedBytes)} processed)`);
        return hashHex;
    }

    /**
     * Displays checksum list
     * @param {object} checksums - Parsed checksums
     */
    function displayChecksumList(checksums) {
        const count = Object.keys(checksums).length;
        const algorithm = count > 0 ? getHashAlgorithm(Object.values(checksums)[0]) : 'Unknown';
        const verifiedCount = verifiedFiles.size;

        let html = `
            <div class="checksum-info">
                <p><strong>Found ${count} checksum(s) in this file:</strong></p>
                <p class="checksum-algorithm">Algorithm: ${algorithm}</p>
                ${verifiedCount > 0 ? `<p class="checksum-verified-count">✓ ${verifiedCount} of ${count} verified</p>` : ''}
                <ul class="checksum-items">
        `;

        for (const [filename, hash] of Object.entries(checksums)) {
            const isVerified = verifiedFiles.has(filename);
            const verifiedClass = isVerified ? ' verified' : '';
            const verifiedIcon = isVerified ? '<span class="checksum-verified-icon">✓</span> ' : '';

            html += `
                <li class="checksum-item${verifiedClass}">
                    ${verifiedIcon}<span class="checksum-filename">${filename}</span>
                    <code class="checksum-hash">${hash}</code>
                </li>
            `;
        }

        html += `
                </ul>
            </div>
        `;

        checksumElements.list.innerHTML = html;
    }

    /**
     * Stops ongoing checksum verification
     */
    function stopChecksumVerification() {
        if (!checksumState.isVerifying) return;

        console.log('Stopping checksum verification...');
        checksumState.verificationAborted = true;

        // Disable button to prevent multiple clicks
        if (checksumElements.stopBtn) {
            checksumElements.stopBtn.disabled = true;
            checksumElements.stopBtn.textContent = '⏹ Stopping...';
        }
    }

    /**
     * Updates the queue display
     */
    function updateQueueDisplay() {
        if (fileQueue.length === 0) {
            checksumElements.queue.style.display = 'none';
            return;
        }

        const completed = fileQueue.filter(f => f.status === 'completed' || f.status === 'error').length;
        const total = fileQueue.length;

        let html = `
            <div class="checksum-queue-header">
                Verification Queue (${completed}/${total} completed)
            </div>
        `;

        fileQueue.forEach((item, index) => {
            const statusIcon = {
                'pending': '⏳',
                'processing': '🔄',
                'completed': '✅',
                'error': '❌'
            }[item.status] || '⏳';

            html += `
                <div class="checksum-queue-item ${item.status}" id="queue-item-${index}">
                    <span class="checksum-queue-status">${statusIcon}</span>
                    <span class="checksum-queue-filename">${item.file.name}</span>
                    <span class="checksum-queue-size">${formatFileSize(item.file.size)}</span>
                </div>
            `;
        });

        checksumElements.queue.innerHTML = html;
        checksumElements.queue.style.display = 'block';
    }

    /**
     * Handles file upload for checksum verification (supports multiple files)
     */
    async function handleChecksumFileUpload(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        // Check if checksums are loaded
        if (Object.keys(parsedChecksums).length === 0) {
            console.error('No checksums loaded - cannot verify file');
            checksumElements.result.className = 'checksum-result checksum-error';
            checksumElements.result.innerHTML = `
                <div class="checksum-result-icon">⚠</div>
                <div class="checksum-result-title">NO CHECKSUMS LOADED</div>
                <div class="checksum-result-details">
                    <p>No checksum file has been verified yet.</p>
                    <p>Please verify a GPG-signed checksum file first (e.g., SHA256SUMS or SHA256SUMS.gpg) before uploading files to verify.</p>
                </div>
            `;
            checksumElements.result.style.display = 'block';
            return;
        }

        // Check which files are not in the checksum list
        const filesNotInList = files.filter(f => !parsedChecksums.hasOwnProperty(f.name));

        if (filesNotInList.length > 0 && filesNotInList.length === files.length) {
            // ALL files not in list - show warning
            console.log(`${filesNotInList.length} file(s) not found in checksum list`);

            const fileListText = Object.keys(parsedChecksums).map(f => `  • ${f}`).join('\n');
            const filesNotInListText = filesNotInList.map(f => `  • ${f.name}`).join('\n');
            const userConfirmed = confirm(
                `⚠️ WARNING: Filename Mismatch\n\n` +
                `${filesNotInList.length} file(s) are NOT in the verified checksum list:\n${filesNotInListText}\n\n` +
                `This could mean:\n` +
                `  • The filename(s) have been changed\n` +
                `  • You selected the wrong files\n` +
                `  • These are not the files you intended to verify\n\n` +
                `Files in the checksum list:\n${fileListText}\n\n` +
                `Do you want to continue anyway?\n\n` +
                `(The tool will still attempt to match by hash if the files are valid)`
            );

            if (!userConfirmed) {
                console.log('User cancelled verification due to filename mismatch');
                checksumElements.fileInput.value = ''; // Clear the file selection
                return;
            }

            console.log('User confirmed to continue despite filename mismatch');
        }

        // Add files to queue
        files.forEach(file => {
            fileQueue.push({
                file: file,
                status: 'pending',
                result: null
            });
        });

        checksumElements.fileInfo.textContent = `Queued ${files.length} file(s) for verification`;
        updateQueueDisplay();

        // Start processing queue if not already processing
        if (!isProcessingQueue) {
            processQueue();
        }
    }

    /**
     * Processes the file queue sequentially
     */
    async function processQueue() {
        if (isProcessingQueue) return;
        isProcessingQueue = true;

        while (fileQueue.length > 0) {
            // Find next pending file
            const nextIndex = fileQueue.findIndex(f => f.status === 'pending');
            if (nextIndex === -1) break; // No more pending files

            const queueItem = fileQueue[nextIndex];
            queueItem.status = 'processing';
            updateQueueDisplay();

            try {
                await verifyFileChecksum(queueItem.file, nextIndex);
                queueItem.status = 'completed';
            } catch (error) {
                console.error(`Error verifying ${queueItem.file.name}:`, error);
                queueItem.status = 'error';
                queueItem.result = error.message;
            }

            updateQueueDisplay();
        }

        isProcessingQueue = false;
        checksumElements.fileInfo.textContent = 'All files verified!';

        // Clear queue after completion
        setTimeout(() => {
            fileQueue = [];
            updateQueueDisplay();
            checksumElements.fileInfo.textContent = '';
        }, 3000);
    }

    /**
     * Verifies a single file's checksum
     */
    async function verifyFileChecksum(file, queueIndex) {

        // Store file for potential Stop button usage
        checksumState.currentFile = file;

        // Update file info with queue position if in queue mode
        if (fileQueue.length > 1) {
            const completed = fileQueue.filter(f => f.status === 'completed' || f.status === 'error').length;
            checksumElements.fileInfo.textContent = `Verifying: ${file.name} (${completed + 1}/${fileQueue.length})`;
        } else {
            checksumElements.fileInfo.textContent = `Verifying: ${file.name} (${formatFileSize(file.size)})`;
        }
        checksumElements.result.style.display = 'none';

        // Set verification state
        checksumState.isVerifying = true;
        checksumState.verificationAborted = false;

        // Show Stop button if available
        if (checksumElements.stopBtn) {
            checksumElements.stopBtn.style.display = 'inline-block';
            checksumElements.stopBtn.disabled = false;
            checksumElements.stopBtn.textContent = '⏹ Stop';
        }

        // Disable file input during verification
        if (checksumElements.fileInput) {
            checksumElements.fileInput.disabled = true;
        }

        try {
            const algorithm = getHashAlgorithm(Object.values(parsedChecksums)[0]);

            // Show initial progress
            showProgress(0, `Calculating ${algorithm} checksum...`);

            // Progress callback to update the UI
            const progressCallback = (percent, processedBytes) => {
                const percentText = `${percent}%`;
                const bytesText = `${formatFileSize(processedBytes)} / ${formatFileSize(file.size)}`;
                showProgress(percent, `Calculating ${algorithm}: ${bytesText} (${percentText})`);
            };

            const calculatedHash = await calculateFileHash(file, progressCallback);

            // Check against all checksums to find a match
            let matchedFilename = null;
            let expectedHash = null;

            // Try exact filename match first
            if (parsedChecksums[file.name]) {
                matchedFilename = file.name;
                expectedHash = parsedChecksums[file.name];
            } else {
                // Try to find by hash
                for (const [filename, hash] of Object.entries(parsedChecksums)) {
                    if (hash === calculatedHash) {
                        matchedFilename = filename;
                        expectedHash = hash;
                        break;
                    }
                }
            }

            // Display result
            if (matchedFilename && expectedHash === calculatedHash) {
                // Success! Mark file as verified
                verifiedFiles.add(matchedFilename);

                // Update the checksum list to show the verified file
                displayChecksumList(parsedChecksums);

                checksumElements.result.className = 'checksum-result checksum-success';
                checksumElements.result.innerHTML = `
                    <div class="checksum-result-icon">✓</div>
                    <div class="checksum-result-title">CHECKSUM VERIFIED</div>
                    <div class="checksum-result-details">
                        <p><strong>File integrity confirmed!</strong></p>
                        <dl class="checksum-result-info">
                            <dt>Expected filename:</dt>
                            <dd>${matchedFilename}</dd>

                            <dt>Algorithm:</dt>
                            <dd>${getHashAlgorithm(expectedHash)}</dd>

                            <dt>Checksum:</dt>
                            <dd><code>${calculatedHash}</code></dd>
                        </dl>
                        <p class="checksum-result-message">
                            ✅ The file has not been corrupted or tampered with.
                        </p>
                    </div>
                `;
            } else if (expectedHash && expectedHash !== calculatedHash) {
                // Hash mismatch!
                checksumElements.result.className = 'checksum-result checksum-error';
                checksumElements.result.innerHTML = `
                    <div class="checksum-result-icon">✗</div>
                    <div class="checksum-result-title">CHECKSUM MISMATCH</div>
                    <div class="checksum-result-details">
                        <p><strong>⚠️ Warning: File integrity check failed!</strong></p>
                        <dl class="checksum-result-info">
                            <dt>Expected checksum:</dt>
                            <dd><code>${expectedHash}</code></dd>

                            <dt>Actual checksum:</dt>
                            <dd><code>${calculatedHash}</code></dd>
                        </dl>
                        <div class="checksum-warning">
                            <p>⚠️ <strong>Do not use this file!</strong> This may indicate:</p>
                            <ul>
                                <li>The file was corrupted during download</li>
                                <li>The file has been tampered with</li>
                                <li>You're verifying the wrong file</li>
                            </ul>
                            <p>Re-download the file from a trusted source and verify again.</p>
                        </div>
                    </div>
                `;
            } else {
                // Filename not found in checksum list - treat as error
                checksumElements.result.className = 'checksum-result checksum-error';
                checksumElements.result.innerHTML = `
                    <div class="checksum-result-icon">✗</div>
                    <div class="checksum-result-title">FILENAME MISMATCH</div>
                    <div class="checksum-result-details">
                        <p><strong>⚠️ Warning: The filename does not match!</strong></p>
                        <p>The file "<strong>${file.name}</strong>" is not listed in the verified checksum file.</p>
                        <div class="checksum-warning">
                            <p><strong>This is a problem because:</strong></p>
                            <ul>
                                <li>You may be verifying the wrong file</li>
                                <li>The filename may have been changed (potential tampering)</li>
                                <li>The checksum file may not cover this file</li>
                            </ul>
                            <p><strong>What to do:</strong></p>
                            <ul>
                                <li>Check that you selected the correct file</li>
                                <li>Verify the filename matches exactly (case-sensitive)</li>
                                <li>Ensure you have the right checksum file for this download</li>
                            </ul>
                        </div>
                        <details class="checksum-details">
                            <summary>Show technical details</summary>
                            <p><strong>Calculated ${getHashAlgorithm(Object.values(parsedChecksums)[0])}:</strong></p>
                            <code class="checksum-hash">${calculatedHash}</code>
                            <p class="checksum-hint">
                                <strong>Available files in this checksum list:</strong>
                            </p>
                            <ul>
                                ${Object.keys(parsedChecksums).map(f => `<li><code>${f}</code></li>`).join('')}
                            </ul>
                        </details>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Checksum verification error:', error);

            // Don't show error if verification was deliberately stopped
            if (checksumState.verificationAborted) {
                console.log('Checksum verification stopped by user - not showing error');
                hideProgress();
                checksumElements.result.style.display = 'none';
            } else {
                checksumElements.result.className = 'checksum-result checksum-error';
                checksumElements.result.innerHTML = `
                    <div class="checksum-result-icon">⚠</div>
                    <div class="checksum-result-title">ERROR</div>
                    <div class="checksum-result-details">
                        Failed to calculate checksum: ${error.message}
                    </div>
                `;
                checksumElements.result.style.display = 'block';
            }
        } finally {
            // Check if aborted before resetting
            const wasAborted = checksumState.verificationAborted;

            // Reset state
            checksumState.isVerifying = false;
            checksumState.verificationAborted = false;
            checksumState.currentFile = null;

            // Re-enable file input
            if (checksumElements.fileInput) {
                checksumElements.fileInput.disabled = false;
            }

            // Hide Stop button
            if (checksumElements.stopBtn) {
                checksumElements.stopBtn.style.display = 'none';
                checksumElements.stopBtn.disabled = false;
            }

            // Hide progress after delay if not aborted (aborted already hides it)
            if (!wasAborted) {
                setTimeout(hideProgress, 2000);
            }
        }
    }

    /**
     * Formats file size in human-readable form
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Shows checksum verification section
     * @param {string} content - Verified content to check for checksums
     */
    function showChecksumSection(content) {
        console.log('ChecksumVerifier.showChecksumSection called with content:', content ? `${content.length} chars` : 'null/empty');
        console.log('Content preview:', content ? content.substring(0, 300) : 'N/A');

        const detected = containsChecksums(content);
        console.log('Checksums detected:', detected);

        if (!detected) {
            console.log('No checksums detected, hiding container');
            checksumElements.container.style.display = 'none';
            return;
        }

        // Only clear verified files if the checksum content has changed
        if (verifiedContent !== content) {
            console.log('Checksum content changed - clearing verified files');
            verifiedFiles.clear();
        } else {
            console.log('Same checksum content - preserving verified files');
        }

        verifiedContent = content;
        parsedChecksums = parseChecksums(content);
        console.log('Parsed checksums:', parsedChecksums);

        if (Object.keys(parsedChecksums).length === 0) {
            console.log('No checksums parsed, hiding container');
            checksumElements.container.style.display = 'none';
            return;
        }

        displayChecksumList(parsedChecksums);
        checksumElements.container.style.display = 'block';
        console.log('Checksum section displayed with', Object.keys(parsedChecksums).length, 'checksums');

        // Scroll into view
        checksumElements.container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Hides checksum verification section
     */
    function hideChecksumSection() {
        checksumElements.container.style.display = 'none';
        parsedChecksums = {};
        verifiedFiles.clear();
        verifiedContent = '';
        checksumElements.fileInput.value = '';
        checksumElements.fileInfo.textContent = '';
        checksumElements.result.style.display = 'none';
    }

    /**
     * Initialize checksum addon - clear inputs on page load
     */
    function initializeChecksumAddon() {
        // Clear all checksum-related inputs on page load (prevents browser caching)
        checksumElements.container.style.display = 'none';
        parsedChecksums = {};
        verifiedFiles.clear();
        verifiedContent = '';
        checksumState.isVerifying = false;
        checksumState.verificationAborted = false;
        checksumState.currentFile = null;

        if (checksumElements.fileInput) {
            checksumElements.fileInput.value = '';
            checksumElements.fileInput.disabled = false;
        }
        checksumElements.fileInfo.textContent = '';
        checksumElements.result.style.display = 'none';

        // Hide Stop button initially
        if (checksumElements.stopBtn) {
            checksumElements.stopBtn.style.display = 'none';
        }

        // Initialize event listeners
        if (checksumElements.fileInput) {
            checksumElements.fileInput.addEventListener('change', handleChecksumFileUpload);
        }
        if (checksumElements.stopBtn) {
            checksumElements.stopBtn.addEventListener('click', stopChecksumVerification);
        }

        console.log('Checksum Verification Addon initialized');
    }

    // Export functions for use by main app
    window.ChecksumVerifier = {
        showChecksumSection,
        hideChecksumSection,
        containsChecksums,
        stopVerification: stopChecksumVerification
    };

    // Initialize on load
    initializeChecksumAddon();

})();
