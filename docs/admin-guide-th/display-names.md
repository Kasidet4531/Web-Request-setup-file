# ชื่อที่แสดงบนหน้าจอ

หน้านี้อธิบายชื่อ **Request To** และ **Target 12NC Desc** ที่ผู้ใช้เห็นบนหน้าจอและในอีเมล
สำหรับผู้ดูแลระบบ (Admin) ใช้ตั้งแต่ 24 ตุลาคม 2026 (issue #112) คำศัพท์เป็นไปตาม
[GLOSSARY.md](../../GLOSSARY.md)

## สองชื่อนี้คืออะไร

| ชื่อที่แสดง | ชื่อเดิมที่เลิกใช้ | ข้อมูลที่เก็บ (ไม่เปลี่ยน) | ความหมาย |
| --- | --- | --- | --- |
| **Request To** | Product Type | ช่อง `product_type` | ประเภทของคำขอ: สร้าง PSF ใหม่ (Create new PSF), แก้ PSF เดิม (Revise from old PSF) หรือย้ายผลิตภัณฑ์ (Product Transfer) |
| **Target 12NC Desc** | Product Description, Product_Description, Title | ช่อง `title` | ชื่อผลิตภัณฑ์มาตรฐานที่ใช้เรียกคำขอ และเป็นชื่อนำหน้าโฟลเดอร์ไฟล์แนบ |

เปลี่ยนเฉพาะชื่อที่แสดงเท่านั้น ค่าในคำขอ Field key และ Canonical key ยังเหมือนเดิม
จึงไม่ต้องแก้ข้อมูลคำขอใด ๆ การค้นหา ตัวกรอง Team และ Excel ทำงานเหมือนเดิม

## ชื่อที่ระบบกำหนดไว้ (ผู้ดูแลแก้ไม่ได้)

ชื่อต่อไปนี้เขียนไว้ในโปรแกรม แสดงเหมือนกันทุกฟอร์มและทุกคำขอ

- ตาราง **Requests**, **Dashboard** และ **My Drafts**: คอลัมน์ Target 12NC Desc และ
  Request To รวมถึงหัวข้อของแต่ละช่องเมื่อดูบนจอแคบ
- **Draft Management**: คอลัมน์ Request To และคำแนะนำในช่อง Keyword
  "Draft number or Target 12NC Desc…"
- **Audit History**: คอลัมน์ Target 12NC Desc
- คำอธิบายช่อง Search ของ Requests, Dashboard และ Audit History ใช้คำว่า Target 12NC Desc
- ตัวกรอง **Team** บน Dashboard (เห็นเฉพาะ Setup File Owner):
  `GNTC — Create new PSF`, `MFG — Revise from old PSF / Product Transfer` และ
  `รอระบุ Request To` ตัวกรองยังแบ่งทีมแบบเดิมทุกประการ
- คำขอที่ไม่มี Request To หรือค่าไม่ตรงกับตัวเลือกที่ระบบรู้จัก แสดงเป็น **"รอระบุ Request To"**
- อีเมลคำขอ (New Request, Status change, Completed, Cancelled): แถว Target 12NC Desc
  และ Request To ยังเป็นพื้นสีเขียวและอยู่ในลำดับเดิม อีเมลที่เข้าคิวไว้ก่อนการเปลี่ยนนี้
  จะส่งด้วยเนื้อหาเดิม

## ชื่อที่มาจาก Form Management (ผู้ดูแลตั้งเอง)

ป้ายชื่อช่องในฟอร์ม (New Request, Request Detail, Request Snapshot) และหัวคอลัมน์ของ
Excel กับ Export Preview ใช้ **Field label** ที่ตั้งใน Form Management ระบบไม่เขียนทับ
หลัง Initial Data Load ป้ายชื่อมาจาก workbook ("Column Name change" หรือ "Column Name"
ในแผ่น `Column_Mapping`) จึงอาจไม่ตรงกับชื่อในตาราง เช่น ช่อง `title` อาจชื่อ
`Product_Description`

วิธีแก้ป้ายชื่อ:

1. เปิด **Form Management** แล้วเลือกฟอร์ม Requester Information (`psf-request`)
2. ที่ version ที่เป็น Active กด **Duplicate as draft** แล้วกด **Edit** ที่ draft ที่ได้
3. หาช่องที่แสดง `product_type · product_type` กด **Edit** แก้ **Field label** เป็น
   `Request To` แล้วกด **Apply**
4. หาช่องที่แสดง `title · title` แก้ **Field label** เป็น `Target 12NC Desc` แล้วกด **Apply**
5. กด **Save draft** แล้ว **Publish**

หลัง Publish คำขอใหม่และหัวคอลัมน์ Excel ใช้ชื่อใหม่ทันที คำขอที่มีอยู่แล้ว (รวม
Imported Requests) แสดงฟอร์มตาม Form Version ที่บันทึกไว้ตอนสร้าง Draft จะเปลี่ยนเมื่อ
ผู้สร้างกด Upgrade รายการใน Audit History ที่บันทึกก่อนหน้ายังแสดงป้ายชื่อของเวลานั้น

## ค่าตัวเลือกของ Request To

ตาราง อีเมล และตัวกรอง Team อ่านค่า Request To จาก **คำขึ้นต้น** ของค่าที่เลือก
(ตัวพิมพ์ใหญ่-เล็กต้องตรงกัน)

- ขึ้นต้นด้วย `Create new PSF` อยู่ทีม GNTC
- ขึ้นต้นด้วย `Revise from old PSF`, `Revise Old PSF` หรือ `Product Transfer` อยู่ทีม MFG
- ค่าที่รู้จักจะแสดงแบบย่อ โดยตัดวงเล็บท้ายออก เช่น
  `Create new PSF (Require PCSF , E142 or .DPL)` แสดงเป็น `Create new PSF`
- ค่าอื่นแสดงเป็น "รอระบุ Request To" ในตาราง ไม่อยู่ทีมใด และอีเมลแสดงค่าตามที่บันทึกไว้

ถ้าแก้ข้อความตัวเลือกใน Form Management ให้คงคำขึ้นต้นเหล่านี้ไว้

## New Request เริ่มด้วย Target 12NC Desc ว่าง

New Request ไม่เติมค่า `Product_Description` ให้อีกแล้ว ผู้ขอต้องพิมพ์ชื่อจริงเอง
Draft บันทึกได้แม้ช่องนี้ว่าง ระหว่างนั้นโฟลเดอร์ไฟล์แนบชื่อ `_[ID]` และเมื่อพิมพ์ชื่อแล้ว
บันทึก ระบบเปลี่ยนชื่อโฟลเดอร์เป็น `[Target 12NC Desc]_[ID]` เหมือนเดิม
ต้องกรอกช่องนี้ก่อนส่งคำขอหรือไม่ ขึ้นกับ **Required field** ของช่องนี้ใน Form Management
หลัง Initial Data Load ช่องนี้ไม่ได้เป็น Required (มีเพียง Request To และ Requester Name)

## รายการตรวจก่อน go-live

- [ ] หลัง Initial Data Load ตรวจ Field label ใน Form Management: ถ้าชื่อจาก workbook
      ไม่ใช่ "Request To" และ "Target 12NC Desc" ให้แก้ตามขั้นตอนด้านบนแล้ว Publish
- [ ] ตรวจว่าตัวเลือกของ Request To ยังขึ้นต้นด้วย `Create new PSF`, `Revise from old PSF`
      หรือ `Product Transfer` (ตัวพิมพ์ตรงกัน)
- [ ] ตัดสินใจว่า Target 12NC Desc ต้องกรอกก่อนส่งหรือไม่ แล้วตั้ง Required field ให้ตรง
- [ ] เปิด New Request ตรวจว่า Target 12NC Desc ว่างและป้ายชื่อตรงกับตาราง แล้วเปิด
      Export Preview ตรวจหัวคอลัมน์ Request To และ Target 12NC Desc
