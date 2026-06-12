const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Ad-hoc sign the .app bundle and all bundled binaries.
// This is free (no Apple Developer account required) and avoids the
// "App is damaged" Gatekeeper error users would otherwise see on first launch.
// The first-run installer .command (bundled in the DMG) strips the quarantine
// attribute via `xattr -cr`, which is what actually lets the app open without
// any Settings panel detour.
exports.default = async function(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appOutDir = context.appOutDir;
  const productName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${productName}.app`);

  if (!fs.existsSync(appPath)) {
    console.log(`  • afterSign-mac: app not found at ${appPath}, skipping`);
    return;
  }

  const resourcesBin = path.join(appPath, 'Contents', 'Resources', 'bin');
  const binariesToSign = [];
  if (fs.existsSync(resourcesBin)) {
    for (const name of fs.readdirSync(resourcesBin)) {
      const full = path.join(resourcesBin, name);
      try {
        const stat = fs.statSync(full);
        // Sign anything that looks like a Mach-O binary (no extension or executable)
        if (stat.isFile() && (stat.mode & 0o111)) binariesToSign.push(full);
      } catch {}
    }
  }

  const codesign = (target) => {
    try {
      execFileSync('codesign', [
        '--force',
        '--deep',
        '--sign', '-',           // ad-hoc identity
        '--timestamp=none',
        target,
      ], { stdio: 'inherit' });
    } catch (err) {
      console.log(`  • codesign failed for ${target}: ${err.message}`);
    }
  };

  for (const bin of binariesToSign) {
    console.log(`  • ad-hoc signing bundled binary: ${path.basename(bin)}`);
    // chmod +x first in case the runner stripped the bit
    try { fs.chmodSync(bin, 0o755); } catch {}
    codesign(bin);
  }

  console.log(`  • ad-hoc signing .app bundle: ${productName}.app`);
  codesign(appPath);
};
