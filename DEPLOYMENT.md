# Deployment Guide

This guide explains how to deploy and use GPG Verifier.

## Local Usage (Simplest)

### Option 1: Direct File Access

1. Download all files to a folder
2. Double-click `index.html`
3. Your default browser will open the app

**Note**: Some browsers restrict local file access. If you get errors, use Option 2.

### Option 2: Local Web Server (Recommended)

Start a simple web server in the application directory:

#### Python 3
```bash
python3 -m http.server 8000
```

#### Python 2
```bash
python -m SimpleHTTPServer 8000
```

#### Node.js
```bash
npx http-server -p 8000
```

#### PHP
```bash
php -S localhost:8000
```

#### Ruby
```bash
ruby -run -ehttpd . -p8000
```

Then open: http://localhost:8000

## Self-Hosting for Maximum Security

For production use or maximum security, self-host the OpenPGP.js dependency.

### Step 1: Download OpenPGP.js

```bash
# Download the library
wget https://unpkg.com/openpgp@5.11.1/dist/openpgp.min.js

# Verify the download (recommended)
sha256sum openpgp.min.js
```

### Step 2: Update index.html

Edit `index.html` and change line 108 from:
```html
<script src="https://unpkg.com/openpgp@5.11.1/dist/openpgp.min.js"
        crossorigin="anonymous"></script>
```

To:
```html
<script src="openpgp.min.js"></script>
```

### Step 3: Update CSP (Optional)

In `index.html` line 6, change:
```html
content="default-src 'none'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none';"
```

To:
```html
content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none';"
```

This removes the CDN from allowed sources.

## Web Hosting

Deploy to a web server or hosting platform.

### Static Hosting (GitHub Pages, Netlify, Vercel, etc.)

This app is perfect for static hosting since it's purely client-side.

#### GitHub Pages

1. Create a new repository
2. Upload all files
3. Go to Settings → Pages
4. Select branch and root folder
5. Save

Your app will be at: `https://yourusername.github.io/repo-name/`

#### Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd /path/to/gpg-verifier
netlify deploy --prod
```

Or use their web interface:
1. Drag and drop the folder to Netlify
2. Done!

#### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd /path/to/gpg-verifier
vercel --prod
```

### Traditional Web Server

#### Apache

1. Copy files to web root:
   ```bash
   sudo cp -r /path/to/online-gpg /var/www/html/gpg-verify
   ```

2. Set permissions:
   ```bash
   sudo chown -R www-data:www-data /var/www/html/gpg-verify
   sudo chmod -R 755 /var/www/html/gpg-verify
   ```

3. Access at: `http://yourserver/gpg-verify/`

#### Nginx

1. Copy files:
   ```bash
   sudo cp -r /path/to/online-gpg /usr/share/nginx/html/gpg-verify
   ```

2. Configure (add to nginx.conf):
   ```nginx
   location /gpg-verify {
       alias /usr/share/nginx/html/gpg-verify;
       index index.html;
   }
   ```

3. Restart Nginx:
   ```bash
   sudo systemctl restart nginx
   ```

## HTTPS Configuration (Important!)

Always use HTTPS in production for security.

### Let's Encrypt (Free SSL)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-apache

# Get certificate
sudo certbot --apache -d yourdomain.com

# Auto-renewal is configured automatically
```

### Cloudflare (Free SSL)

1. Sign up at cloudflare.com
2. Add your domain
3. Change nameservers as instructed
4. Enable "Always Use HTTPS" in SSL/TLS settings
5. Done! Free SSL with CDN benefits

## Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM nginx:alpine

# Copy application files
COPY . /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t gpg-verifier .
docker run -d -p 8080:80 gpg-verifier
```

Access at: http://localhost:8080

## Air-Gapped Deployment

For maximum security, deploy on a system with no network access.

### Preparation (on online computer)

1. Download all files
2. Download OpenPGP.js:
   ```bash
   wget https://unpkg.com/openpgp@5.11.1/dist/openpgp.min.js
   ```
3. Verify hash (check OpenPGP.js website for official hash)
4. Update `index.html` to use local `openpgp.min.js`
5. Copy all files to USB drive

### Deployment (on air-gapped computer)

1. Copy files from USB to computer
2. Open `index.html` in browser
3. Use normally (completely offline)

## Security Headers (Production)

For web hosting, add security headers.

### Apache (.htaccess)

Create `.htaccess`:
```apache
<IfModule mod_headers.c>
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "DENY"
    Header set X-XSS-Protection "1; mode=block"
    Header set Referrer-Policy "no-referrer"
    Header set Permissions-Policy "geolocation=(), microphone=(), camera=()"
</IfModule>
```

### Nginx

Add to location block:
```nginx
add_header X-Content-Type-Options "nosniff";
add_header X-Frame-Options "DENY";
add_header X-XSS-Protection "1; mode=block";
add_header Referrer-Policy "no-referrer";
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()";
```

### Cloudflare Workers

For advanced users, deploy as a Cloudflare Worker for edge computing and DDoS protection.

## Subdirectory Deployment

If deploying to a subdirectory (e.g., `example.com/tools/gpg/`):

No changes needed! The app uses relative paths and will work in any directory.

## Custom Domain

### GitHub Pages Custom Domain

1. Add a `CNAME` file with your domain:
   ```bash
   echo "gpg.yourdomain.com" > CNAME
   ```

2. Configure DNS:
   - Add CNAME record: `gpg` → `yourusername.github.io`

3. Enable HTTPS in GitHub Pages settings

### Netlify Custom Domain

1. Go to Domain Settings
2. Add custom domain
3. Configure DNS as instructed
4. SSL is automatic

## Monitoring and Analytics (Optional)

The app includes NO tracking by default (privacy-first design).

If you want to add privacy-respecting analytics:

### Plausible (Privacy-friendly)

Add to `index.html` before `</head>`:
```html
<script defer data-domain="yourdomain.com" src="https://plausible.io/js/script.js"></script>
```

### Self-Hosted Matomo

```html
<!-- Matomo -->
<script>
  var _paq = window._paq = window._paq || [];
  _paq.push(['trackPageView']);
  // ... Matomo code
</script>
```

**Important**: Update CSP if adding analytics!

## Performance Optimization

### Enable Compression

#### Apache
```apache
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/css application/javascript
</IfModule>
```

#### Nginx
```nginx
gzip on;
gzip_types text/html text/css application/javascript;
```

### Browser Caching

#### Apache
```apache
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/html "access plus 1 hour"
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
</IfModule>
```

## Updating

To update the application:

1. **Backup current version**
   ```bash
   cp -r /path/to/online-gpg /path/to/online-gpg.backup
   ```

2. **Download new version**
3. **Test locally first**
4. **Review CHANGELOG for breaking changes**
5. **Deploy new version**
6. **Test in production**

## Monitoring

### Check if App is Working

Create a simple health check:

```bash
#!/bin/bash
# health-check.sh

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/gpg-verify/)

if [ "$RESPONSE" -eq 200 ]; then
    echo "OK: App is running"
    exit 0
else
    echo "ERROR: App returned $RESPONSE"
    exit 1
fi
```

Run periodically with cron:
```cron
*/5 * * * * /path/to/health-check.sh
```

## Troubleshooting Deployment

### "Page not found" errors
- Check file paths are correct
- Verify web server has permission to read files
- Check web server configuration

### "Content Security Policy" errors
- Verify CSP header matches your setup
- If using CDN, ensure it's allowed in CSP
- Check browser console for specific CSP violations

### "Failed to load OpenPGP.js"
- Check internet connection (if using CDN)
- Verify openpgp.min.js is in correct location (if self-hosted)
- Check browser console for specific error

### Large files fail to process
- Increase PHP memory limit (if using PHP server)
- Browser may have memory limitations
- Try using a different browser

## Production Checklist

Before going live:

- [ ] HTTPS enabled
- [ ] Security headers configured
- [ ] CSP properly configured
- [ ] Self-hosting OpenPGP.js (recommended)
- [ ] SRI hash added (if using CDN)
- [ ] Compression enabled
- [ ] Caching configured
- [ ] Tested on multiple browsers
- [ ] Tested with large files
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Privacy policy added (if required)

## Questions?

See:
- **README.md** - General usage and security
- **SECURITY.md** - Detailed security information

---

**Remember**: This is a client-side app. Deployment is simple because there's no backend, database, or server-side processing required!
