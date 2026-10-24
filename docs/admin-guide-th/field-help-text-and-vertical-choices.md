# ข้อความช่วยใต้ช่อง และการเรียงตัวเลือกแนวตั้ง

หน้านี้สำหรับผู้ดูแลระบบ (Admin) อธิบายวิธีใส่ **Field Help Text** (ข้อความช่วยที่แสดงตัวเล็กใต้ช่องในฟอร์ม)
และวิธีตั้งให้ช่องแบบ Multiple choice เรียงตัวเลือกจากบนลงล่าง (**Vertical**) ใช้กับระบบตั้งแต่ 24 ตุลาคม 2026
(issue #116) คำศัพท์เป็นไปตาม [GLOSSARY.md](../../GLOSSARY.md) รายละเอียดทางเทคนิคอยู่ที่
[current implementation](../current-implementation.md)

ทั้งสองอย่างตั้งที่เมนู **Administration → Form Management** เลือกฟอร์ม Requester Information หรือ
PSF Created Information แล้วเปิดเวอร์ชันที่เป็น Draft (ถ้ายังไม่มี ให้กด **Duplicate as draft** จากเวอร์ชันที่ใช้อยู่)
จากนั้นกด **Edit** ที่แถวของช่องที่ต้องการ

## ข้อความช่วยใต้ช่อง (Field Help Text)

ใช้บอกกติกาการกรอกที่ผู้ขอมักพลาด เช่น ช่อง Motion Sensor Type ใส่ว่า "Put NA if not Motion Sensor"

1. ในหน้าต่าง **Edit field** พิมพ์ข้อความในกล่อง **Help text (optional)**
2. ใต้กล่องมีตัวนับ เช่น "Plain text, 27 of 500 characters." พิมพ์ได้ไม่เกิน 500 ตัวอักษร
3. กด **Apply** แล้วกด **Save draft** และ **Publish** (ดูหัวข้อ [ใช้กับคำขอไหนบ้าง](#ใช้กับคำขอไหนบ้าง))

สิ่งที่ผู้ใช้เห็น

- ข้อความแสดงเป็นตัวเล็กสีเทาใต้ช่องกรอก ในหน้า **New Request**, ตอนแก้ Draft, ตอนกด **Edit information**
  ของคำขอที่ส่งแล้ว, ตอนแก้ PSF Created Information และใน **Preview form** ของ Form Management
- โปรแกรมอ่านหน้าจออ่านข้อความช่วยพร้อมกับช่องนั้น (ต่อด้วยข้อความ error และป้าย Auto-filled ถ้ามี)
- ตอนดูคำขอแบบอ่านอย่างเดียว (ยังไม่กด Edit information), หน้า Draft Management และ Request Snapshot
  จะไม่แสดงข้อความช่วย เพราะไม่ได้กรอกอยู่
- ช่องที่ไม่มีข้อความช่วยหน้าตาเหมือนเดิมทุกอย่าง

ข้อควรรู้

- เป็นข้อความธรรมดา (plain text) ขึ้นบรรทัดใหม่ได้ และระบบแสดงการขึ้นบรรทัดตามที่พิมพ์
  ถ้าพิมพ์โค้ด HTML เช่น `<b>` ระบบแสดงตัวอักษรตามที่พิมพ์ ไม่ทำเป็นตัวหนา
- ลบข้อความช่วยได้โดยลบข้อความในกล่องจนว่าง แล้วกด Apply ข้อความที่มีแต่ช่องว่างถือว่าไม่มีข้อความช่วย
- ข้อความช่วยไม่ถูกบันทึกเป็นคำตอบของคำขอ ไม่เปลี่ยนค่าที่กรอกไว้ และไม่อยู่ในไฟล์ Excel หรือ Export Preview
- ถ้าช่องนั้นมีสีไฮไลต์ของ Autofill สีและป้าย "Auto-filled" / "Edited by user" ยังแสดงเหมือนเดิม
  (ดู [Autofill: สีไฮไลต์และ Select All](autofill-highlight-and-select-all.md))

## เรียงตัวเลือกแนวตั้ง (Choice layout)

ใช้ได้เฉพาะช่องประเภท **Multiple choice** (ปุ่มตัวเลือกแบบวงกลม) เช่น Request To
ช่องประเภท Dropdown เป็นรายการแบบเลื่อนลงอยู่แล้วจึงไม่มีตัวเลือกนี้

1. ในหน้าต่าง **Edit field** ของช่อง Multiple choice เลื่อนลงไปที่หัวข้อ **Choice layout**
2. เลือก **Vertical: one option per line** (ค่าเริ่มต้นคือ **Horizontal: options side by side**)
3. กด **Apply** แล้วกด **Save draft** และ **Publish**

เมื่อเลือก Vertical ตัวเลือกแต่ละข้อขึ้นบรรทัดของตัวเอง เรียงจากบนลงล่าง ทุกกล่องกว้างเท่ากับข้อที่ยาวที่สุด
(ไม่เกินความกว้างของช่อง) แบบ Horizontal วางตัวเลือกเรียงกันในแถวเหมือนเดิม บนหน้าจอโทรศัพท์
(กว้างน้อยกว่า 600px) ตัวเลือกเรียงจากบนลงล่างอยู่แล้วทั้งสองแบบ

ข้อควรรู้

- ถ้าเปลี่ยน Field type ของช่องเป็นประเภทอื่นที่ไม่ใช่ Multiple choice ค่า Choice layout จะถูกล้างออก
  ถ้าเปลี่ยนกลับเป็น Multiple choice จะเริ่มที่ Horizontal
- การเรียงแนวตั้งเปลี่ยนแค่หน้าตา ไม่เปลี่ยนตัวเลือก ค่าที่บันทึก หรือการจัดทีม (Dashboard Team Group) ของ Request To

## ดูว่าช่องไหนตั้งค่าไว้แล้ว

- ในรายการช่องของเวอร์ชัน Draft บรรทัดสรุปของช่องต่อท้ายด้วย "Vertical" และ/หรือ "Help text"
  เช่น "Multiple choice · Required · Vertical · Help text"
- ในเวอร์ชันที่อ่านอย่างเดียว (Active หรือเวอร์ชันเก่า) แต่ละช่องแสดง "Choice layout: Vertical" และ
  "Help text: …" พร้อมข้อความเต็ม
- กด **Preview form** เพื่อดูหน้าตาจริงก่อน Publish

## ใช้กับคำขอไหนบ้าง

ข้อความช่วยและการเรียงตัวเลือกเป็นส่วนหนึ่งของ **Form Version** จึงมีผลหลังกด **Publish** เท่านั้น

- คำขอใหม่ (New Request) ใช้ฟอร์มที่ Publish ล่าสุดทันที
- Draft ที่มีอยู่ยังใช้ Form Version เดิมจนกว่าผู้สร้างจะกด Upgrade
- คำขอที่ส่งแล้วและ Imported Request ใช้ฟอร์มที่บันทึกไว้ตอนสร้าง จึงแสดงเหมือนเดิม

## ข้อความเมื่อบันทึกไม่ได้

| ข้อความ | ความหมาย |
| --- | --- |
| Help text must be 500 characters or fewer. | ข้อความช่วยยาวเกิน 500 ตัวอักษร ปุ่ม Apply กดไม่ได้จนกว่าจะตัดให้สั้นลง |
| Field 2 in section 1 help text must be 500 characters or fewer. | เจอเมื่อแก้ผ่าน Advanced · Edit schema JSON ปุ่ม Save draft กดไม่ได้จนกว่าจะแก้ |
| Field 1 in section 1 choice layout applies only to Multiple choice fields. | ใส่ `optionLayout` ใน JSON ให้ช่องที่ไม่ใช่ Multiple choice ให้ลบออก |
| Field 1 in section 1 choice layout must be horizontal or vertical. | ค่า `optionLayout` ใน JSON ต้องเป็น `horizontal` หรือ `vertical` เท่านั้น |

ระบบฝั่ง server ตรวจซ้ำตอน Save draft และ Publish ด้วยข้อความแบบเดียวกันที่ระบุชื่อช่อง เช่น
`Help text for "Motion Sensor Type" must be 500 characters or fewer.`

## รายการตรวจก่อน go-live

**Initial Data Load** สร้างฟอร์มใหม่จาก workbook โดยไม่มีข้อความช่วยและไม่มีการเรียงแนวตั้ง
และไม่มีการย้ายค่าที่ตั้งไว้ในระบบทดสอบมาให้ ควรจดข้อความช่วยของแต่ละช่องไว้ก่อน

- [ ] ก่อน Initial Data Load: จดข้อความช่วยของแต่ละช่อง (ชื่อช่องและข้อความ) จากระบบทดสอบเก็บไว้
- [ ] หลัง Initial Data Load: ใส่ Field Help Text ของแต่ละช่องใหม่ใน Form Management ทั้งฟอร์ม
      Requester Information และ PSF Created Information (ถ้ามี) เช่น "Put NA if not Motion Sensor"
- [ ] หลัง Initial Data Load: ตั้ง Choice layout ของช่อง **Request To** เป็น **Vertical**
- [ ] กด Save draft แล้ว Publish ทั้งสองฟอร์ม
- [ ] เปิดหน้า New Request ดูว่าข้อความช่วยแสดงใต้ช่องที่ตั้งไว้ และ Request To เรียงตัวเลือกจากบนลงล่าง
