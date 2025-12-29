/**
 * GPG Signature Verifier
 * Client-side GPG signature verification using OpenPGP.js
 * All processing happens in the browser - no server-side communication
 *
 * @version 7.7.1
 * @license MIT
 */

(function() {
    'use strict';

    // ============================================================================
    // CONSTANTS
    // ============================================================================

    const SIGNATURE_TYPES = {
        CLEARSIGNED: 'clearsigned',
        INLINE: 'inline'
    };

    const FEEDBACK_TYPES = {
        SUCCESS: 'success',
        ERROR: 'error',
        LOADING: 'loading'
    };

    const PGP_MARKERS = {
        SIGNED_MESSAGE: '-----BEGIN PGP SIGNED MESSAGE-----',
        MESSAGE: '-----BEGIN PGP MESSAGE-----',
        SIGNATURE: '-----BEGIN PGP SIGNATURE-----',
        PUBLIC_KEY: 'BEGIN PGP'
    };

    const PROGRESS_STAGES = {
        INIT: { percent: 10, text: 'Reading public key...' },
        FILE_READ: { percent: 30, text: 'Reading signed file...' },
        PARSE: { percent: 50, text: 'Parsing signed message...' },
        VERIFY: { percent: 70, text: 'Verifying signature...' },
        CHECK: { percent: 90, text: 'Checking verification result...' },
        COMPLETE: { percent: 100, text: 'Complete!' }
    };

    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================

    const state = {
        publicKey: null,
        publicKeyObjects: null, // Store parsed key objects for multi-key support
        signedFile: null,
        signedText: null, // Store pasted signed text
        detachedSignature: null, // Store detached signature file
        dataFile: null, // Store data file for detached signature
        isVerifying: false,
        verificationAborted: false // Track if verification was aborted by user
    };

    // ============================================================================
    // DOM REFERENCES
    // ============================================================================

    const elements = {
        // Public Key Inputs
        keyFileInput: document.getElementById('public-key'),
        keyTextArea: document.getElementById('key-text'),
        keyInfo: document.getElementById('key-info'),
        clearKeyBtn: document.getElementById('clear-key'),

        // Signed File Inputs
        signedFileInput: document.getElementById('signed-file'),
        signedTextArea: document.getElementById('signed-text'),
        signedInfo: document.getElementById('signed-info'),
        clearSignedBtn: document.getElementById('clear-signed'),

        // Dynamic Detached Data File Input
        detachedDataWrapper: document.getElementById('detached-data-wrapper'),
        detachedDataFileInput: document.getElementById('detached-data-file'),
        detachedDataInfo: document.getElementById('detached-data-info'),

        // Action & Results
        verifyBtn: document.getElementById('verify-btn'),
        resetBtn: document.getElementById('reset-btn'),
        resultContainer: document.getElementById('result-container'),
        result: document.getElementById('result'),

        // Progress
        progressContainer: document.getElementById('progress-container'),
        progressFill: document.getElementById('progress-fill'),
        progressText: document.getElementById('progress-text'),

        // Collapsible Sections
        publicKeySection: document.querySelector('[data-section="public-key"]'),
        signedFileSection: document.querySelector('[data-section="signed-file"]'),
        publicKeySummary: document.querySelector('[data-section="public-key"] .collapsed-summary'),
        signedFileSummary: document.querySelector('[data-section="signed-file"] .collapsed-summary'),

        // Inline Errors
        keySectionError: document.getElementById('key-section-error'),
        signedSectionError: document.getElementById('signed-section-error')
    };

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Formats bytes to human-readable file size
     * @param {number} bytes - The number of bytes
     * @returns {string} Formatted size string
     */
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    /**
     * Formats a date to human-readable format
     * @param {Date} date - The date to format
     * @returns {string} Formatted date string
     */
    function formatDate(date) {
        if (!date) return 'Unknown';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Gets detailed summary for a GPG key
     * @param {object} keyObject - OpenPGP.js key object
     * @returns {string} Formatted summary with name, email, and creation date
     */
    function getKeySummary(keyObject) {
        try {
            const user = keyObject.users && keyObject.users[0];
            const userID = user ? user.userID : null;

            let name = 'Unknown';
            let email = '';

            if (userID) {
                name = userID.name || 'Unknown';
                email = userID.email || '';
            }

            const creationDate = keyObject.getCreationTime();
            const dateStr = formatDate(creationDate);
            const keyID = keyObject.getKeyID().toHex();

            // Format: "Name <email> (Created: YYYY-MM-DD, ID: xxxxx)"
            let summary = name;
            if (email) {
                summary += ` <${email}>`;
            }
            summary += ` (Created: ${dateStr}, ID: ${keyID})`;

            return summary;
        } catch (error) {
            console.warn('Error getting key summary:', error);
            return `Key ID: ${keyObject.getKeyID().toHex()}`;
        }
    }

    /**
     * Gets detailed summary for a detached signature
     * @param {object} signature - OpenPGP.js signature object
     * @returns {Promise<object>} Object with summary text and matchesKey boolean
     */
    async function getSignatureSummary(signature) {
        try {
            // Get signature packets
            const packets = signature.packets;
            let sigPacket = null;

            // Find the signature packet
            for (const packet of packets) {
                if (packet.constructor.tag === 2) { // Signature packet
                    sigPacket = packet;
                    break;
                }
            }

            if (!sigPacket) {
                return { summary: 'Unknown signature', matchesKey: false };
            }

            const signerKeyID = sigPacket.issuerKeyID?.toHex() || 'unknown';
            const creationDate = sigPacket.created;
            const dateStr = formatDate(creationDate);

            // Check if signature matches any loaded public key
            let matchesKey = false;
            let signerName = null;

            if (state.publicKeyObjects && state.publicKeyObjects.length > 0) {
                for (const key of state.publicKeyObjects) {
                    const keyID = key.getKeyID().toHex();
                    if (keyID === signerKeyID) {
                        matchesKey = true;
                        const user = key.users && key.users[0];
                        const userID = user ? user.userID : null;
                        if (userID) {
                            signerName = userID.name || null;
                        }
                        break;
                    }
                }
            }

            let summary = `Signature by ${signerName || 'Key ID: ' + signerKeyID} (Signed: ${dateStr})`;

            return { summary, matchesKey };
        } catch (error) {
            console.warn('Error getting signature summary:', error);
            return { summary: 'Detached signature', matchesKey: false };
        }
    }

    /**
     * Reads a file as text using FileReader API
     * @param {File} file - The file to read
     * @returns {Promise<string>} Promise resolving to file content
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Reads a file as binary using FileReader API
     * @param {File} file - The file to read
     * @returns {Promise<Uint8Array>} Promise resolving to binary content
     */
    function readFileAsBinary(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(new Uint8Array(e.target.result));
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Detects the signature type from file content
     * @param {string} content - The file content
     * @returns {string|null} The signature type or null if not detected
     */
    function detectSignatureType(content) {
        if (content.includes(PGP_MARKERS.SIGNED_MESSAGE)) {
            return SIGNATURE_TYPES.CLEARSIGNED;
        }
        if (content.includes(PGP_MARKERS.MESSAGE)) {
            return SIGNATURE_TYPES.INLINE;
        }
        return null;
    }

    /**
     * Formats key information for display
     * @param {object} pubKey - OpenPGP.js public key object
     * @param {string} signatureType - Type of signature (clearsigned/inline/detached)
     * @returns {object} Formatted key information
     */
    function formatKeyInfo(pubKey, signatureType) {
        const userID = pubKey.users[0]?.userID?.userID || 'Unknown';
        const fingerprint = pubKey.getFingerprint().toUpperCase();
        const created = pubKey.getCreationTime().toISOString().split('T')[0];

        let typeLabel;
        if (signatureType === 'detached') {
            typeLabel = 'Detached Signature';
        } else if (signatureType === SIGNATURE_TYPES.CLEARSIGNED) {
            typeLabel = 'Clearsigned';
        } else {
            typeLabel = 'Inline Signed';
        }

        return {
            userID,
            fingerprint,
            created,
            signatureType: typeLabel
        };
    }

    // ============================================================================
    // UI FUNCTIONS
    // ============================================================================

    /**
     * Shows file information in UI
     * @param {HTMLElement} element - The element to update
     * @param {string} name - File name
     * @param {number|string} size - File size (number or formatted string)
     */
    function showFileInfo(element, name, size) {
        const sizeStr = typeof size === 'number' ? formatBytes(size) : size;
        element.innerHTML = `✓ ${name} (${sizeStr})`;
        element.classList.add('show');
    }

    /**
     * Hides file information
     * @param {HTMLElement} element - The element to hide
     */
    function hideFileInfo(element) {
        element.classList.remove('show');
        element.innerHTML = '';
    }

    /**
     * Shows progress bar with percentage and message
     * @param {number} percent - Progress percentage (0-100)
     * @param {string} message - Progress message
     */
    function showProgress(percent, message) {
        elements.progressContainer.style.display = 'block';
        elements.progressFill.style.width = `${percent}%`;
        elements.progressFill.parentElement.setAttribute('aria-valuenow', percent);
        elements.progressText.textContent = message;
    }

    /**
     * Hides progress bar
     */
    function hideProgress() {
        elements.progressContainer.style.display = 'none';
        elements.progressFill.style.width = '0%';
        elements.progressFill.parentElement.setAttribute('aria-valuenow', 0);
        elements.progressText.textContent = '';
    }

    /**
     * Shows success result
     * @param {object} keyInfo - Verified key information
     */
    function showSuccess(keyInfo, verifiedData = null) {
        elements.result.className = 'result success';
        elements.result.innerHTML = `
            <div class="result-icon">✓</div>
            <div class="result-title">SIGNATURE VALID</div>
            <div class="result-details">
                <strong>Verified Details:</strong>
                <dl class="result-info">
                    <dt>Signature Type:</dt>
                    <dd>${keyInfo.signatureType}</dd>

                    <dt>Signer:</dt>
                    <dd>${keyInfo.userID}</dd>

                    <dt>Fingerprint:</dt>
                    <dd><code>${keyInfo.fingerprint}</code></dd>

                    <dt>Key Created:</dt>
                    <dd>${keyInfo.created}</dd>
                </dl>
            </div>
            <div class="result-message">
                The file's signature is cryptographically valid and was signed by this key.
            </div>
        `;
        elements.resultContainer.style.display = 'block';

        // Check for checksums in verified data
        if (verifiedData && window.ChecksumVerifier) {
            window.ChecksumVerifier.showChecksumSection(verifiedData);
        }
    }

    /**
     * Shows invalid signature result
     * @param {string} errorMessage - Error message
     */
    function showInvalid(errorMessage) {
        elements.result.className = 'result error';
        elements.result.innerHTML = `
            <div class="result-icon">✗</div>
            <div class="result-title">SIGNATURE INVALID</div>
            <div class="result-details">
                <p>The signature could not be verified. This may mean:</p>
                <ul>
                    <li>The file has been modified or corrupted</li>
                    <li>The signature doesn't match this file</li>
                    <li>The wrong public key was provided</li>
                </ul>
                ${errorMessage ? `<div class="error-detail">Error: ${errorMessage}</div>` : ''}
            </div>
        `;
        elements.resultContainer.style.display = 'block';
    }

    /**
     * Shows error result
     * @param {string} message - Error message
     */
    function showError(message) {
        elements.result.className = 'result error';
        elements.result.innerHTML = `
            <div class="result-icon">⚠</div>
            <div class="result-title">ERROR</div>
            <div class="result-details">
                ${message}
            </div>
        `;
        elements.resultContainer.style.display = 'block';
        hideProgress();
    }

    /**
     * Shows an inline error in a specific section
     * @param {HTMLElement} errorElement - The error div element
     * @param {string} title - Error title
     * @param {string} message - Error message
     */
    function showInlineError(errorElement, title, message) {
        if (!errorElement) return;

        errorElement.innerHTML = `
            <strong>⚠ ${title}</strong>
            ${message}
        `;
        errorElement.style.display = 'block';

        // Scroll to the error
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Hides an inline error
     * @param {HTMLElement} errorElement - The error div element
     */
    function hideInlineError(errorElement) {
        if (!errorElement) return;

        errorElement.style.display = 'none';
        errorElement.innerHTML = '';
    }

    /**
     * Hides all inline errors
     */
    function hideAllInlineErrors() {
        hideInlineError(elements.keySectionError);
        hideInlineError(elements.signedSectionError);
    }

    /**
     * Updates verify button state based on inputs
     */
    function updateVerifyButton() {
        // Verify button has been removed - verification now happens automatically
        // This function is kept for compatibility but does nothing
    }

    /**
     * Automatically triggers verification after section collapse if ready
     */
    function autoVerify() {
        const hasPublicKey = state.publicKey;
        const hasSignedData = state.signedFile || state.signedText;
        const hasDetachedData = state.detachedSignature && state.dataFile;
        const hasAnyData = hasSignedData || hasDetachedData;

        // Only auto-verify if we have everything needed and not already verifying
        if (hasPublicKey && hasAnyData && !state.isVerifying) {
            console.log('Auto-verifying signature...');
            // Wait for collapse animation to complete (0.5s) plus small buffer
            setTimeout(() => {
                verifySignature();
            }, 600);
        }
    }

    // ============================================================================
    // COLLAPSIBLE SECTION HANDLERS
    // ============================================================================

    /**
     * Toggles a collapsible section between expanded and collapsed states
     * @param {HTMLElement} section - The section element to toggle
     */
    function toggleSection(section) {
        const isCollapsed = section.classList.contains('collapsed');
        const header = section.querySelector('.collapsible-header');

        if (isCollapsed) {
            // Expand
            section.classList.remove('collapsed');
            header.setAttribute('aria-expanded', 'true');
        } else {
            // Collapse
            section.classList.add('collapsed');
            header.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * Collapses a section and updates its summary
     * @param {HTMLElement} section - The section element to collapse
     * @param {string} summary - The summary text to display when collapsed
     */
    function collapseSection(section, summary) {
        const summaryElement = section.querySelector('.collapsed-summary');
        const header = section.querySelector('.collapsible-header');

        if (summaryElement) {
            summaryElement.textContent = summary;
        }

        section.classList.add('collapsed');
        header.setAttribute('aria-expanded', 'false');
    }

    /**
     * Handles collapsible header click/keyboard interaction
     * @param {Event} event - Click or keyboard event
     */
    function handleCollapsibleHeaderClick(event) {
        const header = event.currentTarget;
        const section = header.closest('.collapsible');

        if (section) {
            toggleSection(section);
        }
    }

    /**
     * Handles keyboard navigation for collapsible headers
     * @param {KeyboardEvent} event - Keyboard event
     */
    function handleCollapsibleHeaderKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleCollapsibleHeaderClick(event);
        }
    }

    // ============================================================================
    // PUBLIC KEY HANDLERS
    // ============================================================================

    /**
     * Handles public key file upload
     * @param {Event} event - File input change event
     */
    async function handleKeyFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // Try to detect format by reading first few bytes
            const firstBytes = await file.slice(0, 100).arrayBuffer();
            const firstBytesArray = new Uint8Array(firstBytes);

            // Check if it looks like binary GPG (starts with 0x99 or other binary markers)
            const isBinary = firstBytesArray[0] === 0x99 || firstBytesArray[0] === 0x95 ||
                            (firstBytesArray[0] < 0x20 && firstBytesArray[0] !== 0x09 && firstBytesArray[0] !== 0x0A && firstBytesArray[0] !== 0x0D);

            if (isBinary) {
                // Read as binary
                console.log('Detected binary GPG key format');
                const binary = await readFileAsBinary(file);

                try {
                    // Try reading as multiple keys first (some key files contain multiple keys)
                    let armored;
                    let keyObjects;

                    try {
                        const keys = await openpgp.readKeys({ binaryKeys: binary });
                        if (keys.length === 0) {
                            throw new Error('No valid keys found in file');
                        }
                        // Store the key objects for verification
                        keyObjects = keys;
                        // Combine all keys into one armored block for display
                        armored = keys.map(k => k.armor()).join('\n');
                        const keyIds = keys.map(k => k.getKeyID().toHex()).join(', ');
                        console.log(`Successfully loaded ${keys.length} binary GPG key(s)`);
                        console.log('Key IDs:', keyIds);

                        // Show file info with key IDs
                        const infoText = `${file.name} (converted from binary, ${keys.length} key(s))\nKey IDs: ${keyIds}`;
                        elements.keyInfo.textContent = `✓ ${infoText}`;
                        elements.keyInfo.classList.add('show');
                    } catch (multiKeyError) {
                        // If that fails, try single key
                        const key = await openpgp.readKey({ binaryKey: binary });
                        keyObjects = [key];
                        armored = key.armor();
                        const keyId = key.getKeyID().toHex();
                        console.log('Successfully loaded binary GPG key');
                        console.log('Key ID:', keyId);

                        // Show file info with key ID
                        const infoText = `${file.name} (converted from binary)\nKey ID: ${keyId}`;
                        elements.keyInfo.textContent = `✓ ${infoText}`;
                        elements.keyInfo.classList.add('show');
                    }

                    state.publicKey = armored;
                    state.publicKeyObjects = keyObjects; // Store for verification
                    elements.keyTextArea.value = '';
                    elements.clearKeyBtn.style.display = 'block';

                    // Clear old verification results when new key is loaded
                    elements.resultContainer.style.display = 'none';

                    updateVerifyButton();

                    // Auto-collapse section after successful load with detailed key info
                    const summaryText = keyObjects.length === 1
                        ? getKeySummary(keyObjects[0])
                        : `Loaded ${keyObjects.length} keys: ${keyObjects.map(k => getKeySummary(k)).join(' | ')}`;
                    collapseSection(elements.publicKeySection, summaryText);

                    // Re-check detached signature if one was already loaded
                    await recheckDetachedSignature();

                    // Auto-verify if we have all required data
                    autoVerify();
                } catch (parseError) {
                    console.error('Binary parse error:', parseError);
                    throw new Error(`Invalid binary GPG key: ${parseError.message}`);
                }
            } else {
                // Read as ASCII-armored text
                console.log('Detected ASCII-armored key format');
                const text = await readFileAsText(file);

                if (text.includes(PGP_MARKERS.PUBLIC_KEY)) {
                    // Parse and store key objects
                    let infoText = file.name;
                    try {
                        const keys = await openpgp.readKeys({ armoredKeys: text });
                        state.publicKeyObjects = keys;
                        const keyIds = keys.map(k => k.getKeyID().toHex()).join(', ');
                        console.log(`Successfully loaded ${keys.length} ASCII-armored GPG key(s)`);
                        console.log('Key IDs:', keyIds);

                        // Add key IDs to display
                        infoText = `${file.name} (${keys.length} key(s))\nKey IDs: ${keyIds}`;
                    } catch (parseError) {
                        // Fallback: just store the text
                        state.publicKeyObjects = null;
                        console.warn('Could not parse key objects, will parse during verification');
                    }

                    state.publicKey = text;
                    elements.keyTextArea.value = '';
                    elements.keyInfo.textContent = `✓ ${infoText}`;
                    elements.keyInfo.classList.add('show');
                    elements.clearKeyBtn.style.display = 'block';

                    // Clear old verification results when new key is loaded
                    elements.resultContainer.style.display = 'none';

                    updateVerifyButton();
                    console.log('Successfully loaded ASCII-armored GPG key');

                    // Auto-collapse section after successful load with detailed key info
                    if (state.publicKeyObjects && state.publicKeyObjects.length > 0) {
                        const summaryText = state.publicKeyObjects.length === 1
                            ? getKeySummary(state.publicKeyObjects[0])
                            : `Loaded ${state.publicKeyObjects.length} keys: ${state.publicKeyObjects.map(k => getKeySummary(k)).join(' | ')}`;
                        collapseSection(elements.publicKeySection, summaryText);

                        // Re-check detached signature if one was already loaded
                        await recheckDetachedSignature();

                        // Auto-verify if we have all required data
                        autoVerify();
                    }
                } else {
                    throw new Error('File does not contain a PGP public key block. Expected ASCII-armored format with "-----BEGIN PGP PUBLIC KEY BLOCK-----"');
                }
            }
        } catch (error) {
            console.error('Key upload error:', error);
            showError(`Error reading public key file: ${error.message}`);
        }
    }

    /**
     * Handles public key text paste
     * @param {Event} event - Textarea input event
     */
    async function handleKeyTextPaste(event) {
        const text = event.target.value.trim();

        // Hide any existing inline errors
        hideInlineError(elements.keySectionError);

        if (text) {
            // Check if user accidentally pasted a signed message or signature
            if (text.includes(PGP_MARKERS.SIGNED_MESSAGE) ||
                (text.includes(PGP_MARKERS.SIGNATURE) && !text.includes(PGP_MARKERS.PUBLIC_KEY))) {
                showInlineError(
                    elements.keySectionError,
                    'Wrong Section!',
                    'It looks like you pasted a SIGNED MESSAGE or SIGNATURE into the Public Key section.<br><br>' +
                    'Please paste the signed message in the <strong>"Signed File"</strong> section below (Step 2).<br><br>' +
                    'This section is for the PUBLIC KEY only.'
                );
                elements.keyTextArea.value = '';
                return;
            }

            state.publicKey = text;
            elements.keyFileInput.value = '';

            // Try to parse and store key objects
            let infoText = `Pasted key (${text.length} characters)`;
            if (text.includes(PGP_MARKERS.PUBLIC_KEY)) {
                try {
                    const keys = await openpgp.readKeys({ armoredKeys: text });
                    state.publicKeyObjects = keys;
                    const keyIds = keys.map(k => k.getKeyID().toHex()).join(', ');
                    console.log(`Parsed ${keys.length} pasted key(s)`);
                    console.log('Key IDs:', keyIds);

                    // Add key IDs to display
                    infoText = `Pasted ${keys.length} key(s)\nKey IDs: ${keyIds}`;
                } catch (parseError) {
                    state.publicKeyObjects = null;
                    console.warn('Could not parse pasted key objects:', parseError);
                }
            }

            elements.keyInfo.textContent = `✓ ${infoText}`;
            elements.keyInfo.classList.add('show');
            elements.clearKeyBtn.style.display = 'block';

            // Clear old verification results when new key is pasted
            elements.resultContainer.style.display = 'none';

            // Auto-collapse section after successful load with detailed key info
            if (state.publicKeyObjects && state.publicKeyObjects.length > 0) {
                const summaryText = state.publicKeyObjects.length === 1
                    ? getKeySummary(state.publicKeyObjects[0])
                    : `Pasted ${state.publicKeyObjects.length} keys: ${state.publicKeyObjects.map(k => getKeySummary(k)).join(' | ')}`;
                collapseSection(elements.publicKeySection, summaryText);

                // Re-check detached signature if one was already loaded
                await recheckDetachedSignature();

                // Auto-verify if we have all required data
                autoVerify();
            }
        } else {
            state.publicKey = null;
            state.publicKeyObjects = null;
            hideFileInfo(elements.keyInfo);
            elements.clearKeyBtn.style.display = 'none';
        }

        updateVerifyButton();
    }

    /**
     * Re-checks detached signature against loaded key and updates display
     */
    async function recheckDetachedSignature() {
        // Only proceed if we have a detached signature loaded
        if (!state.detachedSignature) return;

        try {
            console.log('Re-checking detached signature against newly loaded key...');

            // Detect signature format
            const sigFirstBytes = await state.detachedSignature.slice(0, 10).arrayBuffer();
            const sigFirstBytesArray = new Uint8Array(sigFirstBytes);
            const isBinarySignature = sigFirstBytesArray[0] === 0x89 ||
                                     sigFirstBytesArray[0] === 0x88 ||
                                     (sigFirstBytesArray[0] & 0x80) === 0x80;

            // Parse signature
            let signature;
            if (isBinarySignature) {
                const sigBinary = await readFileAsBinary(state.detachedSignature);
                signature = await openpgp.readSignature({ binarySignature: sigBinary });
            } else {
                const sigText = await readFileAsText(state.detachedSignature);
                signature = await openpgp.readSignature({ armoredSignature: sigText });
            }

            // Get updated summary with key match status
            const { summary, matchesKey } = await getSignatureSummary(signature);
            const statusText = matchesKey ? '✓ Matches loaded key' : '⚠ Key not yet loaded';
            const signatureFormat = isBinarySignature ? 'binary detached signature' : 'detached signature';

            // Update the display
            showFileInfo(elements.signedInfo, `${state.detachedSignature.name} (${signatureFormat})`, `${summary}<br>${statusText}`);
            console.log(`Detached signature re-checked: ${summary}, matches key: ${matchesKey}`);
        } catch (error) {
            console.warn('Could not re-check detached signature:', error);
        }
    }

    /**
     * Clears public key inputs
     */
    function clearPublicKey() {
        state.publicKey = null;
        state.publicKeyObjects = null;
        elements.keyFileInput.value = '';
        elements.keyTextArea.value = '';
        hideFileInfo(elements.keyInfo);
        hideInlineError(elements.keySectionError);
        elements.clearKeyBtn.style.display = 'none';
        elements.resultContainer.style.display = 'none';
        updateVerifyButton();
    }

    // ============================================================================
    // SIGNED FILE HANDLERS
    // ============================================================================

    /**
     * Handles signed file upload
     * @param {Event} event - File input change event
     */
    async function handleSignedFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Hide any existing inline errors
        hideInlineError(elements.signedSectionError);

        try {
            // Read first few bytes to detect format
            const firstBytes = await file.slice(0, 100).arrayBuffer();
            const firstBytesArray = new Uint8Array(firstBytes);

            // Check if it's a binary GPG signature
            // Binary GPG signatures start with 0x89 (detached signature packet)
            const isBinarySignature = firstBytesArray[0] === 0x89 ||
                                     firstBytesArray[0] === 0x88 ||
                                     (firstBytesArray[0] & 0x80) === 0x80; // Any GPG packet tag

            // Try to read as text for ASCII-armored detection
            let preview = '';
            let isTextReadable = true;
            try {
                preview = await file.slice(0, 2000).text();
            } catch (e) {
                isTextReadable = false;
            }

            // Check if it's a public key (ASCII-armored only)
            if (isTextReadable && preview.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')) {
                showInlineError(
                    elements.signedSectionError,
                    'Wrong Section!',
                    'It looks like you uploaded a PUBLIC KEY file to the Signed File section.<br><br>' +
                    'Please upload the public key in the <strong>"GPG Public Key"</strong> section above (Step 1).<br><br>' +
                    'This section is for the SIGNED FILE or SIGNED MESSAGE.'
                );
                elements.signedFileInput.value = '';
                return;
            }

            // Check if it's a detached signature (ASCII-armored or binary)
            const isAsciiDetachedSignature = isTextReadable &&
                                            preview.includes('-----BEGIN PGP SIGNATURE-----') &&
                                            !preview.includes('-----BEGIN PGP SIGNED MESSAGE-----') &&
                                            !preview.includes('-----BEGIN PGP MESSAGE-----');

            const isDetachedSignature = isAsciiDetachedSignature || isBinarySignature;

            if (isDetachedSignature) {
                // This is a detached signature - store it and prompt for data file
                state.detachedSignature = file;
                state.signedFile = null;
                state.signedText = null;
                state.dataFile = null;
                elements.signedTextArea.value = '';
                elements.detachedDataFileInput.value = '';

                const signatureFormat = isBinarySignature ? 'binary detached signature' : 'detached signature';

                // Parse the signature to get details and check if it matches loaded key
                try {
                    let signature;
                    if (isBinarySignature) {
                        const sigBinary = await readFileAsBinary(file);
                        signature = await openpgp.readSignature({ binarySignature: sigBinary });
                    } else {
                        const sigText = await readFileAsText(file);
                        signature = await openpgp.readSignature({ armoredSignature: sigText });
                    }

                    const { summary, matchesKey } = await getSignatureSummary(signature);
                    const statusText = matchesKey ? '✓ Matches loaded key' : '⚠ Key not yet loaded';

                    showFileInfo(elements.signedInfo, `${file.name} (${signatureFormat})`, `${summary}<br>${statusText}`);
                    console.log(`Detached signature: ${summary}, matches key: ${matchesKey}`);
                } catch (parseError) {
                    console.warn('Could not parse signature for preview:', parseError);
                    showFileInfo(elements.signedInfo, `${file.name} (${signatureFormat})`, formatBytes(file.size));
                }

                elements.clearSignedBtn.style.display = 'block';

                // Show the data file input
                elements.detachedDataWrapper.style.display = 'block';
                hideFileInfo(elements.detachedDataInfo);

                updateVerifyButton();
                console.log(`Detected ${signatureFormat}, prompting for data file`);
            } else {
                // Check if this is a valid signed file (clearsigned or inline signed)
                const hasValidSignature = preview.includes('-----BEGIN PGP SIGNED MESSAGE-----') ||
                                         preview.includes('-----BEGIN PGP MESSAGE-----');

                if (!hasValidSignature && !isBinarySignature) {
                    showInlineError(
                        elements.signedSectionError,
                        'Invalid File Format',
                        'This file does not appear to contain a GPG signature.<br><br>' +
                        'Expected formats:<br>' +
                        '• <strong>Clearsigned:</strong> <code>-----BEGIN PGP SIGNED MESSAGE-----</code><br>' +
                        '• <strong>Inline signed:</strong> <code>-----BEGIN PGP MESSAGE-----</code><br>' +
                        '• <strong>Detached signature:</strong> <code>-----BEGIN PGP SIGNATURE-----</code> or binary <code>.sig</code> file'
                    );
                    elements.signedFileInput.value = '';
                    return;
                }

                // This is a regular signed file or inline signed message
                state.signedFile = file;
                state.signedText = null;
                state.detachedSignature = null;
                state.dataFile = null;
                elements.signedTextArea.value = '';
                elements.detachedDataFileInput.value = '';

                // Hide the data file input
                elements.detachedDataWrapper.style.display = 'none';
                hideFileInfo(elements.detachedDataInfo);

                // Clear old verification results when new file is uploaded
                elements.resultContainer.style.display = 'none';

                showFileInfo(elements.signedInfo, file.name, file.size);
                elements.clearSignedBtn.style.display = 'block';
                updateVerifyButton();

                // Auto-collapse section after successful load
                const summaryText = `Signed file: ${file.name} (${formatBytes(file.size)})`;
                collapseSection(elements.signedFileSection, summaryText);

                // Auto-verify if we have all required data
                autoVerify();
            }
        } catch (error) {
            console.error('Error checking signed file:', error);
            // If we can't read the file, just proceed normally
            state.signedFile = file;
            showFileInfo(elements.signedInfo, file.name, file.size);
            elements.clearSignedBtn.style.display = 'block';
            updateVerifyButton();
        }
    }

    /**
     * Handles signed text paste
     * @param {Event} event - Textarea input event
     */
    function handleSignedTextPaste(event) {
        const text = event.target.value.trim();

        // Hide any existing inline errors
        hideInlineError(elements.signedSectionError);

        if (text) {
            // Check if user accidentally pasted a public key
            if (text.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')) {
                showInlineError(
                    elements.signedSectionError,
                    'Wrong Section!',
                    'It looks like you pasted a PUBLIC KEY into the Signed File section.<br><br>' +
                    'Please paste the public key in the <strong>"GPG Public Key"</strong> section above (Step 1).<br><br>' +
                    'This section is for the SIGNED FILE or SIGNED MESSAGE.'
                );
                elements.signedTextArea.value = '';
                return;
            }

            // Check if this is a valid signed message
            const hasValidSignature = text.includes('-----BEGIN PGP SIGNED MESSAGE-----') ||
                                     text.includes('-----BEGIN PGP MESSAGE-----');

            if (!hasValidSignature) {
                showInlineError(
                    elements.signedSectionError,
                    'Invalid Format',
                    'This text does not appear to contain a GPG signature.<br><br>' +
                    'Expected formats:<br>' +
                    '• <strong>Clearsigned:</strong> <code>-----BEGIN PGP SIGNED MESSAGE-----</code><br>' +
                    '• <strong>Inline signed:</strong> <code>-----BEGIN PGP MESSAGE-----</code><br><br>' +
                    'For detached signatures, use the file upload instead.'
                );
                elements.signedTextArea.value = '';
                return;
            }

            state.signedText = text;
            state.signedFile = null;
            state.detachedSignature = null;
            state.dataFile = null;
            elements.signedFileInput.value = ''; // Clear file input if text is pasted
            elements.detachedDataFileInput.value = ''; // Clear detached data input
            elements.detachedDataWrapper.style.display = 'none'; // Hide detached data section
            hideFileInfo(elements.detachedDataInfo);

            // Clear old verification results when new text is pasted
            elements.resultContainer.style.display = 'none';

            showFileInfo(elements.signedInfo, 'Pasted signed text', `${text.length} characters`);
            elements.clearSignedBtn.style.display = 'block';

            // Auto-collapse section after successful load
            const summaryText = `Pasted signed text (${text.length} characters)`;
            collapseSection(elements.signedFileSection, summaryText);

            // Auto-verify if we have all required data
            autoVerify();
        } else {
            state.signedText = null;
            hideFileInfo(elements.signedInfo);
            elements.clearSignedBtn.style.display = 'none';
        }

        updateVerifyButton();
    }

    /**
     * Handles data file upload (for detached signatures)
     * @param {Event} event - File input change event
     */
    async function handleDetachedDataFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        state.dataFile = file;

        // Update the info display
        if (state.detachedSignature && state.dataFile) {
            const sigSize = formatBytes(state.detachedSignature.size);
            const dataSize = formatBytes(state.dataFile.size);
            showFileInfo(
                elements.detachedDataInfo,
                `${file.name} (${formatBytes(file.size)})`,
                `Ready to verify with ${state.detachedSignature.name}`
            );

            updateVerifyButton();

            // Clear old verification results when both files are loaded
            elements.resultContainer.style.display = 'none';

            // Auto-collapse section with detailed signature info
            try {
                // Re-parse the signature to get current details
                const isBinarySignature = state.detachedSignature.name.endsWith('.sig');
                let signature;

                if (isBinarySignature) {
                    const sigBinary = await readFileAsBinary(state.detachedSignature);
                    signature = await openpgp.readSignature({ binarySignature: sigBinary });
                } else {
                    const sigText = await readFileAsText(state.detachedSignature);
                    signature = await openpgp.readSignature({ armoredSignature: sigText });
                }

                const { summary, matchesKey } = await getSignatureSummary(signature);
                const summaryText = `${summary} + ${state.dataFile.name}`;
                collapseSection(elements.signedFileSection, summaryText);

                console.log('Both detached signature and data file loaded');
            } catch (error) {
                console.warn('Could not parse signature for summary:', error);
                const summaryText = `${state.detachedSignature.name} + ${state.dataFile.name}`;
                collapseSection(elements.signedFileSection, summaryText);
            }

            // Auto-verify if we have all required data
            autoVerify();
        } else {
            updateVerifyButton();
        }
    }

    /**
     * Clears signed file input
     */
    function clearSignedFile() {
        state.signedFile = null;
        state.signedText = null;
        state.detachedSignature = null;
        state.dataFile = null;
        elements.signedFileInput.value = '';
        elements.signedTextArea.value = '';
        elements.detachedDataFileInput.value = '';
        hideFileInfo(elements.signedInfo);
        hideFileInfo(elements.detachedDataInfo);
        elements.detachedDataWrapper.style.display = 'none';
        hideInlineError(elements.signedSectionError);
        elements.clearSignedBtn.style.display = 'none';
        elements.resultContainer.style.display = 'none';
        updateVerifyButton();
    }

    /**
     * Stops ongoing verification without clearing inputs
     */
    function stopVerification() {
        if (!state.isVerifying) return;

        console.log('Stopping verification...');

        // Set abort flag - verification loop will check this and exit gracefully
        state.verificationAborted = true;
        // DON'T set isVerifying to false here - let the finally block do it
        // This prevents resetAll() from clearing inputs if clicked again before verification exits

        // Disable the button to prevent multiple clicks during abort
        elements.resetBtn.disabled = true;
        elements.resetBtn.textContent = '⏹ Stopping...';

        console.log('Verification will stop at next checkpoint - inputs preserved');
    }

    /**
     * Resets all fields and returns to initial state
     * @param {boolean} force - If true, skip confirmation even during verification
     */
    function resetAll(force = false) {
        // If verification is running, stop it instead of resetting
        if (state.isVerifying && !force) {
            stopVerification();
            return;
        }

        // Don't reset if button is disabled (prevents clearing during abort)
        if (elements.resetBtn.disabled && !force) {
            console.log('Reset blocked - button is disabled');
            return;
        }

        console.log('Resetting all fields to initial state');

        // Clear all state and inputs
        clearPublicKey();
        clearSignedFile();

        // Hide results and checksum section
        elements.resultContainer.style.display = 'none';
        if (window.ChecksumVerifier) {
            window.ChecksumVerifier.hideChecksumSection();
        }

        // Expand sections back to initial state
        elements.publicKeySection.classList.remove('collapsed');
        elements.publicKeySection.querySelector('.collapsible-header').setAttribute('aria-expanded', 'true');
        elements.signedFileSection.classList.remove('collapsed');
        elements.signedFileSection.querySelector('.collapsible-header').setAttribute('aria-expanded', 'true');

        // Reset verification state
        state.isVerifying = false;
        if (elements.verifyBtn) {
            elements.verifyBtn.disabled = false;
        }
        hideProgress();

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });

        console.log('All fields reset successfully');
    }

    // ============================================================================
    // VERIFICATION LOGIC
    // ============================================================================

    /**
     * Main verification function
     * Verifies the GPG signature of the signed file using the public key
     */
    async function verifySignature() {
        // Always clear old results first, even if validation fails
        elements.resultContainer.style.display = 'none';
        hideProgress();
        hideAllInlineErrors();

        const hasSignedData = state.signedFile || state.signedText;
        const hasDetachedData = state.detachedSignature && state.dataFile;
        const hasAnyData = hasSignedData || hasDetachedData;

        if (!state.publicKey || !hasAnyData || state.isVerifying) {
            console.log('Verification blocked:', {
                hasPublicKey: !!state.publicKey,
                hasSignedData,
                hasDetachedData,
                isVerifying: state.isVerifying
            });
            return;
        }

        state.isVerifying = true;
        state.verificationAborted = false;
        if (elements.verifyBtn) {
            elements.verifyBtn.disabled = true;
        }

        // Change reset button to "Stop" button
        elements.resetBtn.textContent = '⏹ Stop';
        elements.resetBtn.classList.add('stop-btn');
        elements.resetBtn.disabled = false;

        try {
            // Stage 1: Get public key(s) for verification
            showProgress(PROGRESS_STAGES.INIT.percent, PROGRESS_STAGES.INIT.text);

            let verificationKeys;

            // Use stored key objects if available (for multi-key support)
            if (state.publicKeyObjects && state.publicKeyObjects.length > 0) {
                verificationKeys = state.publicKeyObjects;
                console.log(`Using ${verificationKeys.length} pre-loaded key(s) for verification`);
                console.log('Available Key IDs:', verificationKeys.map(k => k.getKeyID().toHex()).join(', '));
            } else {
                // Parse from armored text
                try {
                    verificationKeys = await openpgp.readKeys({ armoredKeys: state.publicKey });
                    if (verificationKeys.length === 0) {
                        throw new Error('No valid keys found');
                    }
                    console.log(`Parsed ${verificationKeys.length} key(s) for verification`);
                } catch (multiError) {
                    // Fallback to single key
                    const singleKey = await openpgp.readKey({ armoredKey: state.publicKey });
                    verificationKeys = [singleKey];
                    console.log('Loaded 1 key for verification');
                }
            }

            // Stage 2: Determine verification mode and prepare data
            let verificationResult;
            let signatureType;
            let verifiedDataContent = null; // Store verified content for checksum detection
            let message; // Declare message at function scope so it's accessible later

            // Stream monitoring variables (accessible throughout function)
            let pullCallCount = 0;
            let chunkCount = 0;
            let dataFileSize = 0; // Track file size for progress reporting

            if (state.detachedSignature && state.dataFile) {
                // DETACHED SIGNATURE MODE
                console.log('Using detached signature mode');

                showProgress(PROGRESS_STAGES.FILE_READ.percent, 'Reading signature and data files...');

                // Detect if signature is binary or ASCII-armored
                const sigFirstBytes = await state.detachedSignature.slice(0, 10).arrayBuffer();
                const sigFirstBytesArray = new Uint8Array(sigFirstBytes);
                const isBinarySignature = sigFirstBytesArray[0] === 0x89 ||
                                         sigFirstBytesArray[0] === 0x88 ||
                                         (sigFirstBytesArray[0] & 0x80) === 0x80;

                // Read signature file (binary or ASCII-armored)
                let signature;
                if (isBinarySignature) {
                    console.log('Reading binary signature file');
                    const sigBinary = await readFileAsBinary(state.detachedSignature);
                    signature = await openpgp.readSignature({ binarySignature: sigBinary });
                } else {
                    console.log('Reading ASCII-armored signature file');
                    const sigText = await readFileAsText(state.detachedSignature);
                    signature = await openpgp.readSignature({ armoredSignature: sigText });
                }

                // Read data file - try as text first (for checksum files), fall back to binary stream (for ISOs)
                let isTextFile = false;

                // For small files, try text mode first
                if (state.dataFile.size < 1000000) {
                    try {
                        // Try to read as text first (for checksum files like SHA256SUMS)
                        const dataText = await readFileAsText(state.dataFile);

                        // Check if it looks like text (no null bytes in first 1000 chars)
                        const sampleLength = Math.min(dataText.length, 1000);
                        const hasNullBytes = dataText.substring(0, sampleLength).includes('\0');

                        if (!hasNullBytes) {
                            // Likely a text file (checksum file)
                            console.log('Data file appears to be text, using text mode');
                            message = await openpgp.createMessage({ text: dataText });
                            verifiedDataContent = dataText; // Store for checksum detection
                            isTextFile = true;
                        }
                    } catch (e) {
                        console.log('Text read failed, falling back to binary');
                    }
                }

                // Binary file - use streaming (OpenPGP.js v6.3.0 with PR #1762 fix)
                if (!isTextFile) {
                    dataFileSize = state.dataFile.size; // Store in outer scope for progress reporting
                    console.log(`Streaming data file for verification (${formatBytes(dataFileSize)})`);

                    // Using 64KB chunks - standard stream chunk size
                    const chunkSize = 64 * 1024; // 64KB
                    let offset = 0;
                    let processedBytes = 0;

                    const totalChunks = Math.ceil(dataFileSize / chunkSize);
                    console.log(`File requires ~${totalChunks} chunks of ${formatBytes(chunkSize)} each`);

                    const stream = new ReadableStream({
                        async pull(controller) {
                            pullCallCount++;

                            // Check if verification was aborted before accessing state
                            if (state.verificationAborted) {
                                console.log('Stream pull aborted - closing stream');
                                controller.close();
                                return;
                            }

                            if (offset >= dataFileSize) {
                                console.log(`Stream complete: ${chunkCount} chunks (${formatBytes(processedBytes)})`);
                                controller.close();
                                return;
                            }

                            // Safety check: ensure dataFile still exists before accessing
                            if (!state.dataFile) {
                                console.error('Stream pull: state.dataFile is null - aborting stream');
                                controller.close();
                                return;
                            }

                            const end = Math.min(offset + chunkSize, dataFileSize);
                            const blob = state.dataFile.slice(offset, end);
                            const buffer = await blob.arrayBuffer();
                            const view = new Uint8Array(buffer);

                            controller.enqueue(view);

                            chunkCount++;
                            processedBytes += view.byteLength;
                            offset = end;

                            // Log progress every 1000 chunks (~64MB with 64KB chunks)
                            if (chunkCount % 1000 === 0) {
                                console.log(`Stream chunk ${chunkCount}: ${formatBytes(processedBytes)} / ${formatBytes(dataFileSize)} (${Math.round((processedBytes/dataFileSize)*100)}%)`);
                                // Don't update progress bar here - it will be updated when verificationResult.data is consumed
                            }
                        },

                        cancel(reason) {
                            console.log('Stream cancelled:', reason);
                        }
                    }, new CountQueuingStrategy({ highWaterMark: 1 })); // NO buffering - pull on demand

                    console.log('Creating message from on-demand pull stream...');
                    showProgress(10, 'Preparing stream...');
                    message = await openpgp.createMessage({ binary: stream });
                    console.log(`Message created (${chunkCount} chunks consumed during creation)`);
                    verifiedDataContent = null;
                }

                signatureType = 'detached';

                // Verify signature - must consume the returned data stream (PR #1762 fix)
                console.log('Starting signature verification...');
                showProgress(10, 'Initializing verification...');

                let consumedBytes = 0;
                let lastProgressUpdate = 0;

                // Monitor progress
                const heartbeatInterval = setInterval(() => {
                    console.log(`Verification progress: ${formatBytes(consumedBytes)} verified`);
                }, 10000);

                try {
                    verificationResult = await openpgp.verify({
                        message: message,
                        signature: signature,
                        verificationKeys: verificationKeys
                    });
                    console.log('verify() returned');
                    console.log('verificationResult properties:', Object.keys(verificationResult));

                    // PR #1762: The fix ensures verificationResult.data contains the input stream
                    // We MUST consume this stream to trigger the actual verification
                    if (verificationResult.data) {
                        console.log('Consuming verificationResult.data stream to trigger verification...');

                        // Check if it's a ReadableStream
                        if (typeof verificationResult.data.getReader === 'function') {
                            console.log('verificationResult.data is a ReadableStream');
                            const reader = verificationResult.data.getReader();

                            while (true) {
                                // Check if verification was aborted
                                if (state.verificationAborted) {
                                    console.log('Verification aborted by user - exiting gracefully');
                                    return; // Exit gracefully without throwing error
                                }

                                const { done, value } = await reader.read();
                                if (done) {
                                    console.log(`Verification stream consumed: ${formatBytes(consumedBytes)} total`);
                                    showProgress(95, 'Finalizing verification...');
                                    break;
                                }
                                if (value) {
                                    consumedBytes += value.length;

                                    // Update progress every 50MB to avoid too many updates
                                    if (consumedBytes - lastProgressUpdate >= 50 * 1024 * 1024) {
                                        const percentComplete = Math.min(90, Math.round((consumedBytes / dataFileSize) * 90));
                                        const percentText = Math.round((consumedBytes / dataFileSize) * 100);
                                        showProgress(percentComplete, `Verifying signature: ${formatBytes(consumedBytes)} / ${formatBytes(dataFileSize)} (${percentText}%)`);
                                        console.log(`Verified ${formatBytes(consumedBytes)} / ${formatBytes(dataFileSize)} (${percentText}%)`);
                                        lastProgressUpdate = consumedBytes;
                                    }
                                }
                            }
                        } else if (verificationResult.data instanceof Uint8Array) {
                            console.log(`verificationResult.data is Uint8Array: ${formatBytes(verificationResult.data.length)}`);
                            consumedBytes = verificationResult.data.length;
                            showProgress(90, 'Finalizing verification...');
                        } else {
                            console.warn('verificationResult.data type unknown:', typeof verificationResult.data);
                        }
                    } else {
                        console.warn('No verificationResult.data property!');
                    }

                    // Now check signature validity after consuming the stream
                    console.log('Checking signature validity...');
                    showProgress(97, 'Checking signature...');
                    const signatures = await verificationResult.signatures;
                    const isValid = await signatures[0].verified;

                    clearInterval(heartbeatInterval);
                    console.log(`Verification complete! Valid: ${isValid}`);
                    console.log(`Total data verified: ${formatBytes(consumedBytes)}`);
                } catch (error) {
                    clearInterval(heartbeatInterval);
                    console.error('Verification failed:', error);
                    throw error;
                }

            } else {
                // INLINE/CLEARSIGNED MODE
                // Stage 2: Get signed text (from file or textarea)
                let signedText;
                if (state.signedText) {
                    // Use pasted text
                    showProgress(PROGRESS_STAGES.FILE_READ.percent, `${PROGRESS_STAGES.FILE_READ.text} (${state.signedText.length} characters)`);
                    signedText = state.signedText;
                    console.log('Using pasted signed text');
                } else {
                    // Read from file
                    const fileSize = formatBytes(state.signedFile.size);
                    showProgress(PROGRESS_STAGES.FILE_READ.percent, `${PROGRESS_STAGES.FILE_READ.text} (${fileSize})`);
                    signedText = await readFileAsText(state.signedFile);
                    console.log('Read signed text from file');
                }

                // Stage 3: Parse message
                showProgress(PROGRESS_STAGES.PARSE.percent, PROGRESS_STAGES.PARSE.text);
                signatureType = detectSignatureType(signedText);

                if (!signatureType) {
                    throw new Error(
                        'File does not appear to contain a GPG signature.\n\n' +
                        'Looking for clearsigned (-----BEGIN PGP SIGNED MESSAGE-----) or ' +
                        'inline signed (-----BEGIN PGP MESSAGE-----) format.'
                    );
                }

                message = await parseSignedMessage(signedText, signatureType);

                // Stage 4: Verify signature
                showProgress(PROGRESS_STAGES.VERIFY.percent, PROGRESS_STAGES.VERIFY.text);
                verificationResult = await openpgp.verify({
                    message: message,
                    verificationKeys: verificationKeys
                });
            }

            // Stage 5: Check result
            showProgress(PROGRESS_STAGES.CHECK.percent, PROGRESS_STAGES.CHECK.text);
            const { verified } = verificationResult.signatures[0];

            // Stage 6: Complete
            showProgress(PROGRESS_STAGES.COMPLETE.percent, PROGRESS_STAGES.COMPLETE.text);

            try {
                await verified;

                // Find which key was used for signing
                const { keyID } = verificationResult.signatures[0];
                const signingKey = verificationKeys.find(k => {
                    return k.getKeyIDs().some(id => id.equals(keyID));
                }) || verificationKeys[0];

                const keyInfo = formatKeyInfo(signingKey, signatureType);

                // Extract verified data for checksum detection
                let verifiedData = verifiedDataContent; // Use detached signature data if available

                // Only try to extract from message for clearsigned/inline signed (not detached binary files)
                // Skip extraction for detached signatures to avoid 2GB memory limit with large ISOs
                if (!verifiedData && signatureType !== 'detached') {
                    try {
                        if (signatureType === SIGNATURE_TYPES.CLEARSIGNED && message.getText) {
                            verifiedData = message.getText();
                            console.log('Extracted clearsigned text:', verifiedData ? verifiedData.substring(0, 200) : 'null');
                        } else if (message.getLiteralData) {
                            const literalData = await message.getLiteralData();
                            verifiedData = new TextDecoder().decode(literalData);
                            console.log('Extracted literal data:', verifiedData ? verifiedData.substring(0, 200) : 'null');
                        }
                    } catch (e) {
                        console.log('Could not extract verified data for checksum detection:', e.message);
                    }
                }

                console.log('Passing verified data to showSuccess:', verifiedData ? `${verifiedData.length} chars` : 'null');
                showSuccess(keyInfo, verifiedData);
            } catch (error) {
                // Don't show invalid signature if verification was aborted
                if (!state.verificationAborted) {
                    showInvalid(error.message);
                }
            }

        } catch (error) {
            console.error('Verification error:', error);
            console.error('Error stack:', error.stack);

            // Don't show error if verification was deliberately stopped by user
            if (state.verificationAborted) {
                console.log('Verification stopped by user - not showing error');
                hideProgress();
                // Hide any old results but keep inputs
                elements.resultContainer.style.display = 'none';
            } else {
                // Check if error has custom HTML message (e.g., file too large error)
                if (error.htmlMessage) {
                    showError(error.htmlMessage);
                } else {
                    showError(`Error verifying signed message: ${error.message || 'An error occurred during verification'}`);
                }
            }
        } finally {
            // Check abort status before resetting
            const wasAborted = state.verificationAborted;

            state.isVerifying = false;
            state.verificationAborted = false; // Reset abort flag
            state.abortController = null;
            if (elements.verifyBtn) {
                elements.verifyBtn.disabled = false;
            }

            // Restore reset button to original state
            elements.resetBtn.textContent = '🔄 Start Over';
            elements.resetBtn.classList.remove('stop-btn');
            elements.resetBtn.disabled = false;

            // Only auto-hide progress if not aborted (aborted already hides it in catch)
            if (!wasAborted) {
                setTimeout(hideProgress, 2000);
            }
        }
    }

    /**
     * Parses signed message based on signature type
     * @param {string} text - The signed message text
     * @param {string} type - Signature type (clearsigned/inline)
     * @returns {Promise<object>} Parsed OpenPGP.js message object
     */
    async function parseSignedMessage(text, type) {
        if (type === SIGNATURE_TYPES.CLEARSIGNED) {
            return await openpgp.readCleartextMessage({
                cleartextMessage: text
            });
        } else {
            return await openpgp.readMessage({
                armoredMessage: text
            });
        }
    }

    // ============================================================================
    // EVENT LISTENERS
    // ============================================================================

    function initializeEventListeners() {
        // Collapsible Section Events
        const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', handleCollapsibleHeaderClick);
            header.addEventListener('keydown', handleCollapsibleHeaderKeydown);
        });

        // Public Key Events
        elements.keyFileInput.addEventListener('change', handleKeyFileUpload);
        elements.keyTextArea.addEventListener('input', handleKeyTextPaste);
        elements.clearKeyBtn.addEventListener('click', clearPublicKey);

        // Signed File Events
        elements.signedFileInput.addEventListener('change', handleSignedFileUpload);
        elements.signedTextArea.addEventListener('input', handleSignedTextPaste);
        elements.clearSignedBtn.addEventListener('click', clearSignedFile);

        // Detached Data File Event (dynamic input)
        elements.detachedDataFileInput.addEventListener('change', handleDetachedDataFileUpload);

        // Verification Events
        if (elements.verifyBtn) {
            elements.verifyBtn.addEventListener('click', verifySignature);
        }
        elements.resetBtn.addEventListener('click', resetAll);
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    function initialize() {
        // Check if OpenPGP.js loaded successfully
        if (typeof openpgp === 'undefined') {
            showError(
                'OpenPGP.js library failed to load.\n\n' +
                'Please check your internet connection and refresh the page.\n\n' +
                'For offline use, download and self-host the OpenPGP.js library (see README.md).'
            );
            return;
        }

        // Clear all inputs and state on page load (prevents browser caching issues)
        clearPublicKey();
        clearSignedFile();
        elements.resultContainer.style.display = 'none';
        if (window.ChecksumVerifier) {
            window.ChecksumVerifier.hideChecksumSection();
        }

        // Initialize event listeners
        initializeEventListeners();

        // Log initialization
        console.log('GPG Signature Verifier initialized');
        console.log('OpenPGP.js version:', openpgp.config.versionString);
        console.log('All operations are client-side only');
    }

    // Start the application
    initialize();

})();
