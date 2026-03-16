const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

exports.default = async function(context) {
  const exePath = path.join(context.appOutDir, 'RAVdownloader.exe');
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  // Find rcedit in electron-builder cache
  const cacheBase = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign');
  let rcedit = '';
  if (fs.existsSync(cacheBase)) {
    const dirs = fs.readdirSync(cacheBase);
    for (const d of dirs) {
      const candidate = path.join(cacheBase, d, 'rcedit-x64.exe');
      if (fs.existsSync(candidate)) { rcedit = candidate; break; }
    }
  }

  if (!rcedit) {
    console.log('  • WARNING: rcedit not found, skipping icon embed');
    return;
  }

  console.log('  • setting icon on RAVdownloader.exe');
  execFileSync(rcedit, [exePath, '--set-icon', iconPath]);
};
