🟡 Hi, I'm AGENTS.md from .codex folder

🟢 Instruction for project called.

## Review

- **High — Firefox privacy blockers masih berjalan di isolated world.**  
  `src/manifest.firefox.json:47-57` memuat `content/privacy-main.js` tanpa `"world": "MAIN"`. Override `Navigator.prototype.geolocation`, `Notification.requestPermission`, `navigator.permissions.query`, dan `window.open` di `src/content/privacy-main.js:20-85` tidak memengaruhi JavaScript halaman. Artinya finding notification blocker dan CSP-based injection belum benar-benar selesai untuk Firefox.

- **Medium — Video Controls rusak setelah siklus off → on.**  
  `setupVolumeGuard()` berhenti ketika `volumeState.has(video)` pada `src/content/video-controls.js:194-195`. Namun `stop()` menghapus descriptor `video.muted` dan `video.volume` tanpa menghapus state WeakMap pada `src/content/video-controls.js:475-493`. Saat diaktifkan kembali, guard tidak dipasang ulang. Masalah serupa terjadi pada `overlaysDone`: style overlay dipulihkan saat stop, tetapi WeakSet tidak direset, sehingga `nukeOverlay()` melewati overlay yang sama pada aktivasi berikutnya (`src/content/video-controls.js:5,66-72`).

- **Medium — Opsi YouTube `disableStableVolume` tetap no-op.**  
  Opsi hanya didefinisikan di `src/content/youtube-control-panel.js:13`; tidak ada penggunaan lain. Jadi finding terkait konfigurasi panel yang tidak diimplementasikan belum seluruhnya selesai. Pemeriksaan statis menemukan `debug` dan `disableStableVolume` sebagai satu-satunya key default yang hanya muncul sekali; `debug` bisa sekadar diagnostic flag, tetapi `disableStableVolume` merupakan fitur UI nyata.

- **Medium — Resolver domain masih bukan registrable-domain resolver.**  
  `src/lib/utils.js:1-11` hanya menangani beberapa second-level ccTLD. Public suffix seperti `github.io`, `pages.dev`, dan `appspot.com` tetap dikembalikan sebagai domain bersama. Contoh konkret: `alice.github.io` dan `bob.github.io` sama-sama menjadi `github.io`, sehingga Element Hider dan konfigurasi per-site dapat bocor antar-situs tenant. Kasus `example.co.uk` memang sudah diperbaiki, tetapi akar finding belum selesai.

- **Medium — Generated Firefox build tidak sinkron dengan source.**  
  `dist/firefox/manifest.json:47-58` masih memiliki `"world": "MAIN"`, sedangkan `src/manifest.firefox.json:47-57` tidak. Build berikutnya akan menghasilkan perilaku berbeda dari artifact yang sekarang ada. Perubahan YouTube setelah build juga berisiko belum tercermin di `dist/`. Artifact yang dikirim dan source of truth saat ini tidak konsisten.

- **Low — Badge masih menghitung total historis, bukan jumlah blocker aktif.**  
  `src/background.js:29-31` tetap menambahkan setiap batch ke nilai sebelumnya. Reset baru terjadi saat navigasi atau toggle dimatikan. Jika elemen yang diblokir dihapus oleh SPA, badge tidak turun. Service-worker restart juga menghapus state. Jadi catatan badge “hanya naik dan tidak konsisten” baru diperbaiki sebagian.

- **Correct — Syntax dan manifest parsing lolos.**  
  Semua JavaScript dalam `src/` lolos `node --check`. Manifest Chrome dan Firefox valid JSON. `git diff --check` tidak menemukan whitespace error.

- **Correct — Tidak ada staged file dan review tidak mengubah file.**