# GitHub Pages Deployment Guide

This guide explains how to deploy GPG Verifier to GitHub Pages for free, public hosting.

## Quick Setup (Automated)

This repository is already configured for GitHub Pages deployment with GitHub Actions.

### One-Time Setup

1. **Fork or clone this repository to your GitHub account**

2. **Enable GitHub Pages in repository settings:**
   - Go to your repository on GitHub
   - Click **Settings** → **Pages**
   - Under **Source**, select **GitHub Actions**
   - Click **Save**

3. **Push to main branch:**
   ```bash
   git push origin main
   ```

4. **Access your site:**
   - Your site will be live at: `https://[username].github.io/[repository-name]/`
   - Example: `https://yourusername.github.io/gpg-verifier/`
   - The first deployment takes 1-2 minutes

That's it! Your GPG Verifier is now publicly accessible.

## How It Works

### Automatic Deployment

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:

1. **Triggers on every push to main branch**
2. **Uploads the entire repository as a static site**
3. **Deploys to GitHub Pages**
4. **Makes the site available at your GitHub Pages URL**

### Files Included in Deployment

The workflow deploys ALL files in the repository, including:
- ✅ `index.html` - Main application
- ✅ `app.js`, `styles.css`, `checksum-addon.js` - Application code
- ✅ `openpgp.min.js`, `hash-wasm-sha256.min.js`, `sha256.min.js` - Libraries
- ✅ `gpg-verifier-offline-v1.0.0.zip` - Downloadable offline package
- ✅ All documentation (README.md, SECURITY.md, etc.)
- ✅ Test suite (accessible but not linked)

### .nojekyll File

The `.nojekyll` file prevents GitHub Pages from processing the site with Jekyll, ensuring:
- Files starting with `_` are included
- No Jekyll build step (faster deployment)
- Exact file structure is preserved

## Manual Deployment (Alternative)

If you prefer manual control, you can deploy from the `gh-pages` branch:

1. **Create gh-pages branch:**
   ```bash
   git checkout --orphan gh-pages
   git rm -rf .
   git checkout main -- index.html app.js styles.css checksum-addon.js openpgp.min.js hash-wasm-sha256.min.js sha256.min.js gpg-verifier-offline-v1.0.0.zip .nojekyll
   git commit -m "Deploy to GitHub Pages"
   git push origin gh-pages
   ```

2. **Configure GitHub Pages:**
   - Go to **Settings** → **Pages**
   - Under **Source**, select **Deploy from a branch**
   - Select branch: `gh-pages` and folder: `/ (root)`
   - Click **Save**

## Custom Domain (Optional)

To use a custom domain:

1. **Add CNAME file:**
   ```bash
   echo "your-domain.com" > CNAME
   git add CNAME
   git commit -m "Add custom domain"
   git push origin main
   ```

2. **Configure DNS:**
   - Add a `CNAME` record pointing to `[username].github.io`
   - Or add `A` records pointing to GitHub's IPs:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```

3. **Update GitHub Settings:**
   - Go to **Settings** → **Pages**
   - Enter your custom domain under **Custom domain**
   - Enable **Enforce HTTPS**

## Verifying Deployment

After deployment:

1. **Check GitHub Actions:**
   - Go to **Actions** tab
   - Verify the workflow completed successfully (green checkmark)

2. **Visit your site:**
   - Navigate to `https://[username].github.io/[repository-name]/`
   - GPG Verifier should load immediately

3. **Test functionality:**
   - Upload a GPG key
   - Verify a signature
   - Download the offline package

4. **Check offline package download:**
   - The download link should work: `https://[username].github.io/[repository-name]/gpg-verifier-offline-v1.0.0.zip`

## Updating the Site

To update your deployed site:

1. **Make changes locally**
2. **Commit and push to main:**
   ```bash
   git add .
   git commit -m "Update application"
   git push origin main
   ```
3. **GitHub Actions automatically redeploys** (takes 1-2 minutes)

## Troubleshooting

### Site not loading

**Check:**
- GitHub Actions workflow completed successfully
- GitHub Pages is enabled in Settings → Pages
- Correct source is selected (GitHub Actions or gh-pages branch)
- Allow 1-2 minutes for first deployment

### 404 errors for assets

**Fix:**
- Ensure all file references in `index.html` are relative (not absolute)
- Check that `.nojekyll` file exists in the repository
- Verify files are committed and pushed to the repository

### Offline package download fails

**Fix:**
- Ensure `gpg-verifier-offline-v1.0.0.zip` is committed to the repository
- Check the file size is reasonable (<200MB limit)
- Verify the link in `index.html` is relative: `href="gpg-verifier-offline-v1.0.0.zip"`

### Custom domain not working

**Fix:**
- Verify DNS records are correct
- Wait 24-48 hours for DNS propagation
- Check CNAME file is in repository root
- Enable **Enforce HTTPS** in GitHub Pages settings

## Security Considerations

### HTTPS

GitHub Pages provides free HTTPS with Let's Encrypt certificates:
- ✅ Automatically enabled for `*.github.io` domains
- ✅ Available for custom domains (enable in settings)
- ✅ No configuration required

### Content Security Policy

The application includes strict CSP headers via meta tags:
- Blocks external scripts and resources
- Prevents XSS attacks
- All dependencies are self-hosted

**Note:** GitHub Pages doesn't allow custom HTTP headers, but the CSP meta tag provides equivalent protection.

## Performance

### Caching

GitHub Pages automatically:
- Caches static assets
- Serves content via CDN (Fastly)
- Provides global distribution

### Optimization

The application is already optimized:
- Minified JavaScript libraries
- Compressed assets
- Small total size (~500KB with all dependencies)

## Monitoring

### GitHub Actions

Monitor deployments:
- **Actions** tab shows deployment history
- Email notifications for failed deployments (configure in Settings → Notifications)
- View logs for debugging

### Analytics (Optional)

To add analytics to your GitHub Pages site:

1. **Google Analytics:**
   ```html
   <!-- Add to index.html <head> -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=YOUR-ID"></script>
   ```

2. **Privacy-focused alternatives:**
   - Plausible Analytics
   - Simple Analytics
   - Fathom Analytics

## Costs

**GitHub Pages is completely free** for public repositories:
- ✅ Unlimited bandwidth
- ✅ Unlimited builds
- ✅ Free HTTPS
- ✅ Free CDN
- ✅ 100GB storage limit (this project uses <1GB)

## Limitations

GitHub Pages has some limitations:
- ⚠ **Public repositories only** (for free tier)
- ⚠ **No server-side code** (static content only)
- ⚠ **No custom HTTP headers** (use meta tags instead)
- ⚠ **100GB monthly bandwidth soft limit** (rarely enforced)
- ⚠ **1GB repository size limit** (this project uses ~15MB)

**This project works perfectly within these limitations** as it's entirely client-side.

## Alternative Hosting

If you need private hosting or more control, consider:

1. **Netlify** (free tier available)
   - Custom headers support
   - Branch previews
   - Form handling

2. **Vercel** (free tier available)
   - Serverless functions
   - Automatic HTTPS
   - Preview deployments

3. **Cloudflare Pages** (free tier available)
   - Unlimited bandwidth
   - Workers support
   - DDoS protection

4. **Self-hosted**
   - Full control
   - No limitations
   - Requires server management

## Support

For GitHub Pages issues:
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Community Forum](https://github.community/)
- [GitHub Status](https://www.githubstatus.com/)

For application issues:
- Open an issue in this repository
- Check existing documentation
- Review the test suite

---

**Ready to deploy?** Just push to main and GitHub Actions handles the rest! 🚀
