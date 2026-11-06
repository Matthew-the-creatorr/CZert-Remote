from pathlib import Path
from xml.etree import ElementTree as ET
root = Path(__file__).resolve().parent.parent
manifest = (root / 'app/src/main/AndroidManifest.xml').read_text(encoding='utf-8')
code = (root / 'app/src/main/java/com/czert/blackexit/MainActivity.java').read_text(encoding='utf-8')
ET.fromstring(manifest)
assert '<uses-permission' not in manifest
assert 'SYSTEM_ALERT_WINDOW' not in manifest
assert 'BOOT_COMPLETED' not in manifest
assert 'DEVICE_ADMIN' not in manifest
assert 'setText("×")' in code
assert 'Gravity.CENTER' in code
assert 'setOnClickListener(v -> closeToHome())' in code
assert 'home.addCategory(Intent.CATEGORY_HOME)' in code
assert 'startActivity(home)' in code and 'finish()' in code
assert 'BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE' in code
print('PASS: safe fullscreen screen, central X, return home, zero permissions')
