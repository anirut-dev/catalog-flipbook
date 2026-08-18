# Sangudom Catalog Flipbook

เว็บ flipbook (พลิกหน้าเหมือนหนังสือจริง) จากแคตตาล็อกสินค้า Sangudom Lighting Centre 2021
สร้างด้วย HTML/CSS/JS ธรรมดา + [StPageFlip](https://github.com/Nodlik/StPageFlip) — deploy บน Vercel

## โครงสร้างโปรเจค

```
catalog-flipbook/
├── index.html              หน้าเว็บหลัก
├── css/style.css           สไตล์
├── js/app.js               โค้ดพลิกหน้า + lazy load
├── lib/                    StPageFlip (วางไฟล์ library ที่นี่)
├── pages/                  รูปหน้าที่ optimize แล้ว (page-001.webp ...)
│   └── zoom/               รูปคมชัดสำหรับตอน zoom
├── scripts/                สคริปต์ optimize รูป (รันครั้งเดียว)
├── vercel.json             ตั้งค่า deploy
└── README.md
```

## แผนงาน (Phases)

- [x] **Phase 0** — ตั้งโครงโปรเจค + git
- [x] **Phase 1** — optimize รูป (332MB → 80.5MB, JPG → WebP, เปลี่ยนชื่อเรียงเลข)
- [ ] **Phase 2** — หน้าเว็บพื้นฐาน + StPageFlip พลิกได้
- [ ] **Phase 3** — lazy load + ปุ่ม (ถัดไป/ก่อนหน้า, zoom, thumbnail, มือถือ)
- [ ] **Phase 4** — deploy Vercel

## Performance

- **Lazy loading** — โหลดเฉพาะหน้าปัจจุบัน + หน้าถัดไป ไม่โหลด 232 หน้าพร้อมกัน
- **รูป 2 ขนาด** — แสดงปกติ ~1000px (~120KB), ตอน zoom ค่อยโหลดรูปคมชัด
- **Preload** — โหลดหน้าถัดไปล่วงหน้าเงียบๆ

## ที่มาของรูป

รูปต้นฉบับ 232 หน้าอยู่ที่ `../catalog/แยกแต่ละหน้า/` (นอก repo — ไฟล์ใหญ่ 332MB)
Phase 1 optimize แล้ว → `pages/` (แสดง 1000px) + `pages/zoom/` (คมชัด 1785px)
