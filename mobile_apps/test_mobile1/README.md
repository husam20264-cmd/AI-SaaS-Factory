# تطبيق مهام عربي PWA (Hybrid WebView)

## نظرة عامة
هذا المشروع هو تطبيق ويب تقدمي (Progressive Web App) لتقويم وإدارة المهام باللغة العربية، مصمم بنهج **mobile‑first** مع دعم كامل للـ **RTL**. يمكن تحويله بسهولة إلى تطبيق Android (APK) باستخدام أدوات مثل **PWABuilder** أو عبر **GitHub Actions** لتوليد حزمة WebView.

## المميزات
- واجهة عربية فصحى مع خطوط **Tajawal** من Google Fonts.
- تصميم عصري، داكن (Dark Mode) مع ألوان هادئة تناسب القراءة الطويلة.
- حفظ المهام محليًا باستخدام `localStorage`، يعمل بدون اتصال إنترنت.
- دعم كامل للـ **PWA**: `manifest.json`، `service worker`، وإمكانية تثبيت التطبيق على الشاشة الرئيسية.
- تنقل سهل عبر شريط قوائم ثابت، أقسام: **الرئيسية، المميزات، الأسعار، المعرض، اتصل بنا**.
- زر واتساب عائم لتواصل سريع مع الدعم.
- أيقونات من **Font Awesome** وحركات خفيفة باستخدام CSS.
- جاهز للتحويل إلى APK عبر **PWABuilder** أو **GitHub Actions**.

## بنية المشروع
```
project-root/
│
├─ index.html          # الصفحة الرئيسية مع جميع الأقسام المطلوبة
├─ style.css           # أنماط CSS حديثة مع متغيرات ألوان ودعم RTL
├─ app.js              # منطق JavaScript للتنقل، التمرير السلس، نموذج الاتصال
├─ manifest.json       # تعريف الـ PWA (اسم، أيقونات، اتجاه RTL، …)
├─ sw.js               # Service Worker لتخزين الموارد وتفعيل الوضع غير المتصل
└─ README.md           # هذا الملف
```

## المتطلبات
- Node.js (للتطوير فقط إذا استخدمت أدوات بناء مثل `vite` أو `webpack`).
- متصفح حديث يدعم Service Workers.
- اتصال إنترنت لتحميل الخطوط والأيقونات من CDN.

## خطوات التشغيل محليًا
1. **استنساخ المستودع**
   ```bash
   git clone https://github.com/username/arabic-todo-pwa.git
   cd arabic-todo-pwa
   ```
2. **فتح `index.html` مباشرة** في المتصفح أو تشغيل خادم محلي بسيط:
   ```bash
   npx serve .
   ```
3. سيتحقق المتصفح من وجود `manifest.json` و`sw.js` ويعرض زر "إضافة إلى الشاشة الرئيسية".

## تحويل إلى تطبيق Android (APK)
### باستخدام PWABuilder
1. زيارة https://www.pwabuilder.com/.
2. إدخال عنوان `http://localhost:5000` (أو رابط GitHub Pages).
3. اختيار **Android** → **Generate** → **Download** ملف الـ APK.

### باستخدام GitHub Actions
أضف ملف workflow في `.github/workflows/pwa.yml`:
```yaml
name: Build Android APK
on:
  push:
    branches: [ main ]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npx pwabuilder build --platform android
      - uses: actions/upload-artifact@v3
        with:
          name: apk
          path: ./android/*.apk
```
بعد كل دفع إلى الفرع `main` سيُنشأ ملف APK تلقائيًا ويمكن تحميله من صفحة الـ Actions.

## تفاصيل الملفات الرئيسية
### `index.html`
- يضم **خط Tajawal** عبر Google Fonts.
- يستخدم `dir="rtl"` لضمان اتجاه النص من اليمين إلى اليسار.
- شريط تنقل ثابت مع روابط داخلية (`#home`, `#features`, …).
- أقسام: **الرئيسية** (مع صورة غلاف)، **المميزات**، **الأسعار**، **المعرض** (شبكة صور)، **اتصل بنا** (نموذج بسيط). 
- زر واتساب عائم يفتح رابط `https://wa.me/رقم_الهاتف`.

### `style.css`
- تعريف متغيرات ألوان (`--primary`, `--background`, `--text`) لتسهيل تبديل الوضع الداكن.
- قواعد `@media` لضمان استجابة التصميم على شاشات الهواتف.
- استخدام `flex` و`grid` لتوزيع العناصر.
- تأثيرات انتقالية خفيفة على الأزرار والروابط.

### `app.js`
- تفعيل القائمة المتنقلة (hamburger) وإغلاقها عند اختيار عنصر.
- تمكين **التمرير السلس** للروابط الداخلية باستخدام `scrollIntoView({behavior:'smooth'})`.
- معالجة نموذج الاتصال: التحقق من الحقول وإظهار رسالة نجاح دون إرسال بيانات فعلية.
- تسجيل Service Worker إذا كان المتصفح يدعمه.

### `manifest.json`
```json
{
  "name": "تطبيق مهام عربي",
  "short_name": "مهام",
  "description": "تطبيق ويب تقدمي لإدارة المهام باللغة العربية مع وضع غير متصل.",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#121212",
  "theme_color": "#1e88e5",
  "lang": "ar",
  "dir": "rtl",
  "icons": [
    {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"}
  ]
}
```

### `sw.js`
- تخزين ملفات ثابتة (`index.html`, `style.css`, `app.js`, الخطوط، الأيقونات) في **Cache First**.
- استجابة طلبات الشبكة مع **Network Falling Back to Cache** للبيانات الديناميكية.
- حذف الكاش القديم عند تفعيل نسخة جديدة.

## إرشادات المساهمة
1. **Fork** المستودع.
2. إنشاء فرع جديد للميزة أو الإصلاح:
   ```bash
   git checkout -b feature/اسم-الميزة
   ```
3. الالتزام بتنسيق الكود الموجود (ESLint, Prettier).
4. إرسال **Pull Request** مع وصف واضح.

## رخصة الاستخدام
هذا المشروع مرخص تحت رخصة **MIT**. يمكنك تعديل، توزيع، واستخدامه في التطبيقات التجارية مع الإشارة إلى صاحب الأصل.

---
*تم إنشاء هذا الملف بواسطة نموذج لغة ذكي لتلبية جميع المتطلبات المذكورة.*