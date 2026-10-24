# คอลัมน์ Request For และการค้นหาชื่อผู้ขอ

หน้านี้อธิบายคอลัมน์ **Request For** ในตารางคำขอ และการค้นหาคำขอด้วย **ชื่อผู้ขอ (Requester)**
สำหรับผู้ดูแลระบบ (Admin) ใช้ตั้งแต่ 24 ตุลาคม 2026 (issue #113) คำศัพท์เป็นไปตาม
[GLOSSARY.md](../../GLOSSARY.md)

## คอลัมน์ Request For

- ตาราง **Requests** และ **Dashboard** มีคอลัมน์ Request For อยู่ **ถัดจาก Request To**
  ทีมงาน PSF จึงแยกงาน engineering กับงาน production ได้ทันทีจากตาราง
- แต่ละช่องแสดงค่าเดียว ถ้าคำขอไม่มีค่าแสดงเป็น **"—"** เมื่อดูบนจอแคบ ช่องนั้นมีหัวข้อ
  Request For เหมือนกัน
- ตาราง **My Drafts** และ **Draft Management** ไม่มีคอลัมน์นี้
- หัวคอลัมน์ "Request For" เขียนไว้ในโปรแกรม แก้ Field label ใน Form Management แล้ว
  หัวคอลัมน์ในตารางไม่เปลี่ยน (Field label ยังใช้ในฟอร์ม Request Snapshot และหัวคอลัมน์ Excel)

## ค่ามาจากไหน

ค่าในคอลัมน์มาจากช่องในฟอร์ม Requester Information (`psf-request`) ที่มี
**Canonical key เป็น `request_for`** โดยอ่านจาก Form Version ที่คำขอนั้นบันทึกไว้
ไม่ขึ้นกับว่าช่องนั้นติ๊ก searchable หรือ exportable ไว้หรือไม่

- หลัง Initial Data Load ช่องนี้สร้างจากคอลัมน์ "Request For" ในแผ่น `Column_Mapping`
  ของ workbook และได้ Field key กับ Canonical key เป็น `request_for` เอง
  ใน Form Management จะเห็นช่องนี้แสดง `request_for · request_for`
- ถ้าลบช่องนี้ หรือสร้างช่องใหม่ที่ Canonical key ไม่ใช่ `request_for` คำขอที่ใช้ฟอร์มนั้น
  จะแสดง "—" ในคอลัมน์ คำขอเดิมยังแสดงค่าตาม Form Version ที่บันทึกไว้
- เปลี่ยน Field label หรือข้อความตัวเลือกได้ ค่าในตารางแสดงตามที่บันทึกไว้ในคำขอ

ระบบเก็บค่านี้ไว้ใน Search Index และอัปเดตเมื่อส่งคำขอ (Submit) เมื่อแก้ Requester
Information ของคำขอที่ส่งแล้ว และเมื่อรัน Initial Data Load ครั้งแรกที่ระบบเริ่มทำงานหลัง
อัปเดตนี้ ระบบเติมค่าให้คำขอที่มีอยู่แล้วทั้งหมด รวม Imported Requests หนึ่งครั้ง

## การค้นหาด้วยชื่อผู้ขอ

ช่อง **Search** ของ Requests และ Dashboard ค้นหาส่วนใดก็ได้ของ **ชื่อผู้ขอ** โดยไม่สนตัวพิมพ์
เล็ก-ใหญ่ เช่น พิมพ์ `somchai` ก็พบคำขอที่ผู้ขอชื่อ "Somchai Jaidee" ไม่ต้องพิมพ์ชื่อเต็ม

- ค้นได้เพิ่มจากเดิม คือ request no., Target 12NC Desc, reference PSF name,
  PSF setup file name และ probecard name คำอธิบายใต้ช่อง Search เขียนว่า
  "Searches request no., Target 12NC Desc, reference PSF name, PSF setup file name,
  probecard name and Requester name."
- ชื่อผู้ขอคือชื่อที่แสดง (display name) ของบัญชีที่สร้างคำขอ ส่วน Imported Requests
  คือค่า Created By จาก workbook
- ตัวเลข Open, Overdue และ Completed บน Dashboard นับตามกฎเดียวกัน จึงตรงกับรายการที่เห็น
- ช่อง Search ไม่ค้นค่า Request For
- **My Drafts** ค้นจากข้อมูล Requester Information ทั้งหมดของ Draft อยู่แล้ว ไม่เปลี่ยน

## สิทธิ์การเห็นไม่เปลี่ยน

- Requester ที่ดูงานของตัวเอง (related work) ยังเห็นเฉพาะคำขอที่ตัวเองสร้าง พิมพ์ชื่อคนอื่น
  ก็ไม่เห็นคำขอของคนนั้นเพิ่ม
- Requester ยังค้น PSF Setup File Name ได้เฉพาะคำขอที่ผ่าน PSF Visibility Release แล้ว

## Excel export และ Export Preview

หน้า Export to Excel กรองด้วย Status และช่วงวันที่ของคำขอเท่านั้น ไม่มีช่อง Search
จึงไม่ได้รับผลจากการเปลี่ยนนี้ และจำนวนคำขอในไฟล์เหมือนเดิม ช่อง Request For อยู่ใน Excel
อยู่แล้วในฐานะคอลัมน์ของฟอร์ม ตาม Field label ที่ตั้งไว้

## รายการตรวจก่อน go-live

- [ ] หลัง Initial Data Load เปิด Form Management ฟอร์ม Requester Information ที่เป็น
      Active ตรวจว่ามีช่อง Request For ที่แสดง `request_for · request_for`
      **ต้องคง Canonical key `request_for` ไว้ คอลัมน์ Request For จึงมีค่า**
      ถ้าแก้ฟอร์มแล้ว Publish ใหม่ อย่าลบช่องนี้หรือสร้างใหม่แทน
- [ ] เปิด Requests และ Dashboard ตรวจว่าคอลัมน์ Request For อยู่ถัดจาก Request To
      และ Imported Requests ที่มีค่าใน workbook แสดงค่านั้น
- [ ] พิมพ์ชื่อต้นของผู้ขอคนหนึ่งในช่อง Search ของ Requests ตรวจว่าพบคำขอของคนนั้น
