#!/bin/bash
#
# Package Creator for GPG Verifier
# Creates a distributable offline package with all dependencies
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PACKAGE_NAME="gpg-verifier-offline"
VERSION="1.0.0"
OUTPUT_FILE="${PACKAGE_NAME}-v${VERSION}.zip"

echo ""
echo -e "${BLUE}=====================================================================${NC}"
echo -e "${BLUE}GPG Verifier - Package Creator${NC}"
echo -e "${BLUE}=====================================================================${NC}"
echo ""
echo -e "Creating distributable package: ${GREEN}${OUTPUT_FILE}${NC}"
echo ""

# Check if zip is available
if ! command -v zip &> /dev/null; then
    echo -e "${RED}Error: 'zip' command not found${NC}"
    echo "Please install zip:"
    echo "  Ubuntu/Debian: sudo apt-get install zip"
    echo "  macOS: brew install zip"
    exit 1
fi

# Create temporary directory
TEMP_DIR=$(mktemp -d)
PACKAGE_DIR="${TEMP_DIR}/${PACKAGE_NAME}"

echo -e "${YELLOW}→${NC} Creating package directory..."
mkdir -p "${PACKAGE_DIR}"

# Core application files
echo -e "${YELLOW}→${NC} Copying core files..."
FILES_TO_COPY=(
    "index.html"
    "app.js"
    "styles.css"
    "checksum-addon.js"
    "openpgp.min.js"
    "hash-wasm-sha256.min.js"
    "sha256.min.js"
    "README.md"
    "LICENSE"
    "SECURITY.md"
    "QUICKSTART.md"
    "EXAMPLES.md"
    "TESTING.md"
)

for file in "${FILES_TO_COPY[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "${PACKAGE_DIR}/"
        echo -e "  ${GREEN}✓${NC} $file"
    else
        echo -e "  ${YELLOW}⚠${NC} $file (not found, skipping)"
    fi
done

# Create a INSTALL.txt file with quick start instructions
echo -e "${YELLOW}→${NC} Creating installation instructions..."
cat > "${PACKAGE_DIR}/INSTALL.txt" <<'EOF'
GPG Verifier - Offline Package
=========================================

Quick Start:
1. Extract this ZIP file to any location
2. Open index.html in a modern web browser
3. Start verifying GPG signatures!

No installation required. No internet connection needed.

System Requirements:
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+)
- JavaScript enabled

Usage:
1. Upload or paste a GPG public key
2. Upload the signed file or paste signed text
3. Click "Verify Signature"

For detailed documentation, see README.md

Security Features:
✓ 100% client-side processing
✓ Zero external dependencies (all included)
✓ Works completely offline
✓ No data leaves your computer
✓ Open source and auditable

Air-Gapped Usage:
This package is perfect for air-gapped systems:
1. Transfer this folder to a USB drive
2. Copy to the air-gapped computer
3. Open index.html in a browser
4. Verify signatures without internet access

For questions or issues:
https://github.com/anthropics/gpg-verifier

Version: 1.0.0
License: MIT
EOF

echo -e "  ${GREEN}✓${NC} INSTALL.txt created"

# Create checksums for verification
echo -e "${YELLOW}→${NC} Generating checksums..."
cd "${PACKAGE_DIR}"
sha256sum index.html app.js styles.css checksum-addon.js openpgp.min.js hash-wasm-sha256.min.js sha256.min.js > SHA256SUMS.txt
cd - > /dev/null
echo -e "  ${GREEN}✓${NC} SHA256SUMS.txt created"

# Create the ZIP package
echo -e "${YELLOW}→${NC} Creating ZIP archive..."
cd "${TEMP_DIR}"
zip -q -r "${OUTPUT_FILE}" "${PACKAGE_NAME}"
cd - > /dev/null

# Move to current directory
mv "${TEMP_DIR}/${OUTPUT_FILE}" .

# Get file size
FILE_SIZE=$(du -h "${OUTPUT_FILE}" | cut -f1)

# Cleanup
rm -rf "${TEMP_DIR}"

echo ""
echo -e "${GREEN}=====================================================================${NC}"
echo -e "${GREEN}Package created successfully!${NC}"
echo -e "${GREEN}=====================================================================${NC}"
echo ""
echo -e "Output file: ${GREEN}${OUTPUT_FILE}${NC}"
echo -e "File size:   ${GREEN}${FILE_SIZE}${NC}"
echo ""
echo "Contents:"
echo "  • index.html - Main application"
echo "  • app.js - Application logic"
echo "  • styles.css - Styling"
echo "  • checksum-addon.js - Checksum verification functionality"
echo "  • openpgp.min.js - OpenPGP.js library (v6.3.0)"
echo "  • hash-wasm-sha256.min.js - WebAssembly SHA-256 (high performance)"
echo "  • sha256.min.js - JavaScript SHA-256 (fallback)"
echo "  • README.md - Full documentation"
echo "  • SECURITY.md - Security information"
echo "  • QUICKSTART.md - Quick start guide"
echo "  • EXAMPLES.md - Usage examples"
echo "  • TESTING.md - Testing guide"
echo "  • LICENSE - MIT License"
echo "  • INSTALL.txt - Installation instructions"
echo "  • SHA256SUMS.txt - Checksums for verification"
echo ""
echo "Distribution:"
echo "  1. Share ${OUTPUT_FILE} with users"
echo "  2. Users extract and open index.html"
echo "  3. No installation or internet required"
echo ""
echo "Verify integrity:"
echo "  sha256sum ${OUTPUT_FILE}"
echo ""

# Generate SHA256 for the package itself
PACKAGE_SHA256=$(sha256sum "${OUTPUT_FILE}" | cut -d' ' -f1)
echo -e "Package SHA256: ${BLUE}${PACKAGE_SHA256}${NC}"
echo ""
echo -e "${GREEN}✓ Done!${NC}"
echo ""
