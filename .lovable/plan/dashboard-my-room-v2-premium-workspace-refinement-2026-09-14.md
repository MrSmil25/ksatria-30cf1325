# Dashboard My Room V2 — Premium Workspace Refinement

## Tujuan
Menyempurnakan dashboard yang ada menjadi workspace organisasi premium dengan palet Navy Trust, tipografi Outfit + Figtree, dan struktur Dashboard Fokus. Seluruh routing, autentikasi, data, izin, query Supabase, dan fitur tetap sama.

## Perubahan
- Satukan header dengan halaman melalui permukaan transparan, blur ringan, kontrol kaca, serta identitas akun berupa nama pendek dan role; nama lengkap tetap berada di menu profil.
- Tingkatkan rail navigasi desktop menjadi 72px dengan maksimal 11 pintasan plus menu Lainnya, active state halus, tooltip, dan gerakan ikon ringan. Navigasi mobile tetap ringkas dengan akses ke semua menu.
- Susun ulang hero agar konten, kutipan leadership, ringkasan hari ini, tombol aksi, dan foto tim menyatu dalam satu komposisi desktop yang fokus.
- Pertahankan aksi cepat, Perlu Perhatian, Aktivitas Terbaru, Organisasi Hari Ini, keuangan, dan seluruh konten lanjutan; rapikan hierarchy agar aksi lebih dominan dan statistik lebih compact.
- Terapkan animasi masuk 300ms, stagger 50ms, hover lift, dan perilaku reduced-motion tanpa efek glow besar.
- Rapikan tampilan tablet dan mobile agar teks, foto, tombol, navigasi, dan statistik tidak tumpang tindih.

## Detail teknis
- Refinement dibatasi pada presentasi React/CSS dan pengaturan lokal maksimal pintasan dari 9 menjadi 11.
- Gunakan token semantic berbasis warna: `#F5F9FF`, `#0B1F3A`, `#2563EB`, `#DBEAFE`; mode gelap tetap mengikuti token yang sudah ada.
- Muat Outfit dan Figtree melalui metadata dokumen, lalu gunakan Outfit untuk judul dan Figtree untuk isi.
- Ringkasan harian dipindahkan ke dalam hero tanpa mengubah sumber datanya.
- Setelah perubahan, periksa hasil desktop dan mobile, interaksi menu, foto, overflow, serta status build.
