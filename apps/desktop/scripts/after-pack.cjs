/**
 * electron-builder afterPack: stamp the Studio's icon and product strings onto the packaged
 * executable. electron-builder would do this itself through its signing helper, but that
 * helper cannot be unpacked without symlink rights (see `win.signAndEditExecutable: false`),
 * so the standalone rcedit does the one part we need — the build stays unsigned either way.
 */
const path = require("node:path");
const { rcedit } = require("rcedit");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const { productName, description, version } = context.packager.appInfo;
  await rcedit(exe, {
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    "product-version": version,
    "file-version": version,
    "version-string": { ProductName: productName, FileDescription: description || productName, OriginalFilename: path.basename(exe) },
  });
  console.log(`  • stamped the Studio's icon onto ${path.basename(exe)}`);
};
