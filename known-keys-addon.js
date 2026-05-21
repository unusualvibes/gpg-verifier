window.KnownKeysAddon = (function() {
    'use strict';

    var bannerEl = null;

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function checkAndPrompt(keyID) {
        if (!window.KnownKeys) return null;
        return window.KnownKeys.lookup(keyID.toLowerCase());
    }

    function showBanner(match, onAccept, onDismiss) {
        hideBanner();

        var banner = document.createElement('div');
        banner.id = 'known-key-banner';
        banner.className = 'known-key-banner';
        banner.setAttribute('role', 'alert');
        banner.setAttribute('aria-live', 'polite');

        var shortFp = match.fingerprint
            ? escapeHTML(match.fingerprint.slice(0, 16)) + '&hellip;'
            : 'unknown';

        banner.innerHTML =
            '<div class="known-key-banner-body">' +
                '<span class="known-key-banner-icon" aria-hidden="true">&#x2139;</span>' +
                '<div class="known-key-banner-text">' +
                    '<strong>Known key detected</strong>' +
                    '<p>This file was signed with the <strong>' + escapeHTML(match.label) + '</strong>' +
                    ' (fingerprint: <code>' + shortFp + '</code>).' +
                    ' Always confirm the fingerprint through a trusted channel before trusting this key.</p>' +
                '</div>' +
            '</div>' +
            '<div class="known-key-banner-actions">' +
                '<button id="known-key-accept" class="known-key-btn known-key-btn-primary" type="button">Use this key</button>' +
                '<button id="known-key-dismiss" class="known-key-btn" type="button">No, I\'ll provide my own key</button>' +
            '</div>';

        // Expand the public key section if collapsed, then prepend banner
        var publicKeySection = document.querySelector('[data-section="public-key"]');
        if (publicKeySection && publicKeySection.classList.contains('collapsed')) {
            publicKeySection.classList.remove('collapsed');
            var header = publicKeySection.querySelector('.collapsible-header');
            if (header) header.setAttribute('aria-expanded', 'true');
        }

        var publicKeyContent = document.getElementById('public-key-content');
        if (publicKeyContent) {
            publicKeyContent.insertBefore(banner, publicKeyContent.firstChild);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }

        bannerEl = banner;

        document.getElementById('known-key-accept').addEventListener('click', function() {
            onAccept();
        });
        document.getElementById('known-key-dismiss').addEventListener('click', function() {
            hideBanner();
            onDismiss();
        });
    }

    function hideBanner() {
        if (bannerEl && bannerEl.parentNode) {
            bannerEl.parentNode.removeChild(bannerEl);
        }
        bannerEl = null;
    }

    return { checkAndPrompt: checkAndPrompt, showBanner: showBanner, hideBanner: hideBanner };
})();
