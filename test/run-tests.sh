#!/bin/bash
#
# Test Runner for GPG Verifier
# Runs automated tests and provides clear output
#

set -e

echo "======================================================================"
echo "GPG Verifier - Test Runner"
echo "======================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠ Node.js not found. Please install Node.js to run tests.${NC}"
    exit 1
fi

echo "Running structural tests..."
echo ""
node test/test.js

echo ""
echo "Running end-to-end tests..."
echo ""
node test/e2e-tests.js

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
else
    echo -e "${YELLOW}One or more test suites failed.${NC}"
fi

echo ""
echo "To test the application in a browser:"
echo "  1. Ensure web server is running: python3 -m http.server 8000"
echo "  2. Open: http://localhost:8000"
echo "  3. Use test data in: ./test/test-data/"
echo ""

exit 0
