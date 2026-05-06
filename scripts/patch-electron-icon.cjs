const path = require('path');
const rcedit = require('rcedit');

exports.default = async function patchElectronIcon(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'img', 'Img_1756804186972 (1) (1).ico');

  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      FileDescription: 'NSB POS',
      ProductName: 'NSB POS',
      CompanyName: 'NS Bazaar',
      InternalName: 'NSB POS',
      OriginalFilename: 'NSB POS.exe',
    },
  });
};
