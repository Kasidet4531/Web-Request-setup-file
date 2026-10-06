# Form Management, Preview และ Request Assignment

- วันที่: 2026-10-06
- Branch: `feat/email-notification`
- สถานะ: รอ review spec ก่อนเขียน implementation plan และโค้ด
- ที่มา: ข้อเสนอและคำตอบ Q1–Q12 ในการ review กับผู้ใช้

## เป้าหมาย

ทำให้ผู้ดูแลหาและแก้ Draft ของฟอร์มได้ชัดเจน เปิดดูเวอร์ชันเก่าได้ และใช้ Preview ตรวจหน้าตากับการกรอกก่อน publish โดย New Request แสดง section/field ตาม config จริง หน้า Detail แยกหัวข้อกับคำตอบให้อ่านง่าย และเพิ่มการมอบหมายผู้รับผิดชอบเพื่อให้งานปรากฏใน Dashboard ของคนนั้นหลัง Submit

## 1. Form Management และหน้า Config

- เพิ่มปุ่ม `View` ชัดเจนสำหรับทุกเวอร์ชัน และ `Edit` สำหรับเวอร์ชัน Draft เท่านั้น
- เวอร์ชัน Active/Published เปิดดูได้ แต่แก้ผ่าน `Duplicate as draft` เหมือนเดิม
- ใช้เส้นทางและ editor ที่มีอยู่ การ View เวอร์ชันเก่าไม่เปลี่ยน active version และไม่เปลี่ยน schema snapshot ของ request เดิม
- คงกติกาหนึ่ง Draft ต่อชนิดฟอร์ม การ Publish/Discard และการบล็อก Duplicate เมื่อมี Draft อยู่แล้ว
- หน้า catalog ยังมีตัวเลือกชนิดฟอร์ม Requester Information และ PSF Created Information
- เอา family sidebar ออกจากหน้า version editor ย้ายปุ่ม Back ไปไว้กับหัวหน้าหน้า ใช้ชื่อชนิดฟอร์มที่คนอ่านเข้าใจใน heading/breadcrumb
- เอา `Family: psf-request` และข้อความ seed เช่น `Default requester-facing MVP schema for local PSF request creation.` ออกจากการแสดงผล รวมถึงข้อความ seed ของอีกชนิดฟอร์ม
- ซ่อนข้อความ seed ที่เก็บอยู่แล้วในเวอร์ชันเก่าและสำเนาของมันด้วย ไม่ลบ description ในฐานข้อมูล และไม่เพิ่มช่องแก้ description ในงานนี้ หากมี description ที่ผู้ดูแลเขียนเองให้แสดงได้
- คงข้อมูลเวอร์ชัน สถานะ ผู้สร้าง และวันที่ที่ช่วย review เวอร์ชัน

## 2. Preview และการแสดงฟอร์มจริง

- ปรับ Preview ของทั้งสองชนิดฟอร์มให้ใช้ช่องกรอกจริง เช่น input, textarea, select และ radio ไม่ใช้ข้อความ `Not provided` แทนช่องกรอก
- Preview ใช้ schema ที่กำลังดู/แก้ รวมถึงการแก้ Draft ที่ยังไม่ Save เพื่อให้ตรวจผลได้ก่อนบันทึก
- ลองกรอกและตรวจ required fields ได้ในเครื่อง โดยไม่สร้าง/บันทึก request ไม่เรียก autofill จริง และไม่ส่งเมล
- ค่า Preview เป็นค่าชั่วคราวของเวอร์ชันที่เปิดอยู่ เมื่อเปลี่ยนเวอร์ชัน/ชนิดฟอร์มเริ่มค่าทดลองใหม่ และไม่ทำให้ config กลายเป็น dirty
- Requester identity ใน Preview ใช้ตัวอย่างที่ระบุว่าเป็นข้อมูลทดลองและคงลักษณะช่องที่ระบบเติมให้ ไม่มีการแก้ identity จริง
- Preview ของ requester form ใช้การจัดวางเดียวกับ New Request ส่วน Preview ของ PSF Created Information ใช้การจัดวางเดียวกับพื้นที่แก้ข้อมูล PSF ใน Detail
- แสดง section, field, label, type, options, required และลำดับตาม schema config ทั้ง Preview, New Request และการแก้ Draft/request
- เลิกย้าย optional fields ออกไปอยู่ใน `Additional details` โดยอัตโนมัติ ช่อง optional อยู่ตามตำแหน่งที่ config กำหนด
- Preview มีข้อความบอกว่าเป็นการทดลองและปุ่มตรวจความครบถ้วน แยกการทดลองออกจากปุ่ม Save/Publish ของ config
- ฟังก์ชันจริง เช่น requester identity, autofill, Save Draft, Submit และสิทธิ์แก้ PSF ยังคงทำงานในหน้าจริงตามกติกาเดิม

## 3. Request Detail

- ปรับ label ของ field ทั้ง Requester Information และ PSF Created Information เป็น 14px ตัวหนา สี foreground
- เพิ่มเส้นบางใต้ label เพื่อคั่นกับคำตอบในโหมดอ่านข้อมูล คำตอบใช้ตัวปกติและรองรับข้อความหลายบรรทัด
- หัวข้อ section ใช้ขนาด 16px โดยยังแยกจาก label ของ field
- ปรับ style เฉพาะพื้นที่ Detail ไม่เปลี่ยน label ของทุกหน้าทั้งระบบ
- คง Owner / Dept ใน summary และในตาราง Requests

## 4. การ Assign ผู้รับผิดชอบ

### พฤติกรรมที่ตกลง

- หนึ่ง request มีผู้รับผิดชอบได้หนึ่งคน เลือกได้จาก user ที่มี role `setup_owner` พร้อม Dept จาก profile ของคนนั้น
- ไม่บังคับเลือกก่อน Submit สามารถส่งเป็น `Unassigned` แล้ว assign ภายหลังได้
- ทุก role ที่เปิด request นั้นได้สามารถ assign, เปลี่ยน หรือยกเลิก assignment ได้
- ผู้สร้างเลือกได้ตั้งแต่ New Request และบันทึกการเลือกพร้อม Draft ได้ เปลี่ยนการเลือกใน Draft ของตัวเองได้
- Draft ยังคงเป็นส่วนตัวของผู้สร้าง ผู้ที่ถูก assign และผู้ใช้อื่นไม่ได้สิทธิ์เปิด Draft จาก assignment
- หลัง Submit requester, setup owner และ admin เปลี่ยน assignment ได้ตามสิทธิ์เปิด request เดิม
- เพิ่มช่องเลือกผู้รับผิดชอบใน New Request/Draft และปุ่ม `Assign` / `Change owner` ในหน้า Detail ใช้ dropdown ที่ค้นหาชื่อได้ แสดงชื่อพร้อม Dept และมีตัวเลือก `Unassigned`
- การ assign ใช้ระบุความรับผิดชอบและกรอง Dashboard คงกติกาสิทธิ์แก้ข้อมูล PSF, ข้อมูล requester และเปลี่ยนสถานะเดิม
- ยกเลิกการใส่ Owner อัตโนมัติเมื่อ setup owner บันทึก PSF ครั้งแรก การบันทึก PSF โดยคนอื่นไม่เปลี่ยน assignment
- การ assign ไม่เปลี่ยนสถานะและไม่สร้าง notification event การส่งเมลตอน Submit/เปลี่ยนสถานะยังใช้ To/CC ของสถานะเป้าหมาย

### ข้อมูลและ API

- เพิ่ม nullable user ID ของผู้รับผิดชอบใน request และ search index ใช้ ID จับคู่ Dashboard ไม่ใช้ชื่อหรือ Dept แทนตัวตน
- คงชื่อ/Dept ที่แสดงอยู่เดิมเป็น snapshot ณ ตอน assign การเปลี่ยนชื่อ/Dept/role ใน User Management ไม่ย้าย assignment หรือเขียนทับ snapshot ของ request อัตโนมัติ
- ตรวจผู้รับผิดชอบที่เลือกใหม่จาก server ว่ามีอยู่และเป็น setup owner ที่มี Dept ถูกต้อง ไม่รับชื่อ/Dept จาก client เป็นข้อมูลอ้างอิง
- เพิ่ม directory สำหรับผู้ใช้ที่ login แล้ว ให้ข้อมูลเฉพาะที่ picker ต้องใช้ เช่น ID, ชื่อและ Dept ของ setup owners ไม่เปิดสิทธิ์ User Management หรือข้อมูล profile ทั้งหมด
- Draft create/update รองรับ assignment โดยบันทึกพร้อมข้อมูล Draft ใน transaction เดียว การแก้ request data ที่ไม่ได้ส่ง assignment ต้องเก็บ assignment เดิม
- Submit ตรวจ assignment ที่ไม่ว่างอีกครั้ง หาก user นั้นไม่มีสิทธิ์เป็น setup owner แล้ว ให้เลือกใหม่หรือเคลียร์ก่อนส่ง
- เพิ่ม mutation สำหรับ assignment บน Detail ใช้ revision `expectedUpdatedAt` และตรวจสิทธิ์เปิด request ทุกครั้ง รวมทั้ง Draft privacy
- Assignment, request timestamp, search index และ audit/history เปลี่ยนใน transaction เดียว การเปลี่ยนชน revision ให้คืน conflict และให้ UI เก็บค่าที่เลือกไว้สำหรับ review
- การเลือกคนเดิมโดยไม่มีการเปลี่ยน assignment ไม่สร้าง audit ซ้ำหรือเพิ่ม revision โดยไม่จำเป็น
- การยกเลิก assignment เคลียร์ user ID และชื่อ/Dept ที่แสดง เพื่อให้กลับเป็น `Unassigned`
- Audit/history ระบุผู้เปลี่ยนและผู้รับผิดชอบก่อน/หลัง โดยใช้รูปแบบ history ของ request ที่มีอยู่

### Request เก่า

- request เก่าที่มีเพียงชื่อ/Dept ยังแสดงค่าที่เก็บไว้ ไม่ผูกเข้ากับ user โดยการเดาชื่อ
- user ID เริ่มเป็น null สำหรับข้อมูลเก่า การ assign ครั้งใหม่จะได้ตัวตนที่ชัดเจนและแทนที่ snapshot เดิม
- งานเก่าที่มี Dept ยังหาได้จาก `Department work` และรายการ Requests การเข้าหน้า/บันทึก PSF ไม่ทำ backfill assignment อัตโนมัติ

## 5. Dashboard

- สำหรับ setup owner ค่าเริ่มต้น `Related to me` รวม request ที่ฉันสร้างหรือ assign ให้ฉันด้วย user ID และนับ request ที่ตรงทั้งสองเงื่อนไขเพียงครั้งเดียว
- เปลี่ยน relationship selector เป็น dropdown: `Related to me`, `Created by me`, `Assigned to me`, `Department work`
- `Department work` ใช้ Dept ที่เก็บกับ request เทียบกับ Dept ปัจจุบันของผู้ใช้ตามแนวทางเดิม รวมข้อมูลเก่าที่มี Dept แต่ยังไม่มี owner ID
- requester และ admin ไม่เห็น relationship dropdown ในงานนี้ Dashboard ของสอง role นี้ยังแสดง request ที่ตัวเองสร้าง ส่วน requester ยังเห็นและใช้ช่อง assignment บน request ได้
- คง Open/Overdue/Completed และการค้นหา/แบ่งหน้าที่มีอยู่ Summary cards และรายการใช้ relationship filter เดียวกัน
- Draft ไม่ปรากฏและไม่ถูกนับใน Dashboard ของผู้รับผิดชอบ Submit สำเร็จจึงเขียนข้อมูลลง search index และทำให้งานปรากฏตาม work-state filter
- เปลี่ยนผู้รับผิดชอบแล้วงานต้องย้ายจาก `Assigned to me` ของคนเดิมไปคนใหม่ และยอดรวมปรับตามข้อมูลที่ commit แล้ว
- request ที่ Unassigned ยังอยู่ในรายการ Requests และ Dashboard ของผู้สร้างตามตัวกรองเดิม ทีมสามารถเปิดจากรายการ Requests เพื่อ assign
- คงการ refresh ใน background ที่รักษาข้อมูลเดิมระหว่างโหลด ไม่มีข้อความ Updating หรือการกระพริบกลับหน้า Loading

## 6. ขอบเขตการเปลี่ยนแปลง

- Frontend: Form Management/config/preview, DynamicFormRenderer, New Request/Draft, Detail/history, Dashboard relation dropdown และ API types
- Backend: assignee directory, request DTO/controller/service/storage, search index/dashboard scope และ audit ของ assignment
- ใช้โครงสร้าง form versions และ request snapshots เดิม ไม่มีการแก้เวอร์ชัน publish ทับที่เดิม
- ไม่มีการเปลี่ยน PSF release trigger, recipient policy หรือ worker ส่งเมล
- แยก schema form ที่ผู้ดูแลกำหนดออกจาก assignment ซึ่งเป็น metadata ของ request ไม่เพิ่ม assignee เป็น field ใน schema

## 7. เกณฑ์ทดสอบและยอมรับงาน

1. Draft มี Edit ทุกเวอร์ชันมี View เวอร์ชันเก่าเปิดได้ และ Active/Published ยังคงแก้ได้ผ่าน Duplicate as draft เท่านั้น
2. Editor ไม่มี family sidebar, internal Family key หรือข้อความ seed และยังมีทางกลับ catalog/เลือกชนิดฟอร์ม
3. ทั้งสอง Preview ลองกรอกและตรวจ required ได้โดยไม่เรียก create/update/autofill/notification API
4. Preview สะท้อน Draft ที่ยังไม่ Save และตรงกับ section/field order/type/options ของหน้ากรอกจริง รวม optional fields โดยไม่มี Additional details ที่ระบบสร้างเอง
5. Detail อ่านหัวข้อกับคำตอบแยกกันได้ มีเส้นบางใต้ label ทั้งสองส่วน ตรวจ desktop/mobile และ light/dark
6. requester สร้างและแก้ assignment ใน Draft ได้ คนอื่นรวมผู้รับผิดชอบเปิด Draft ไม่ได้ และ Draft ไม่ถูกนับใน Dashboard
7. Submit ที่มี assignment ทำให้งานปรากฏใน Dashboard ของคนนั้น ส่วน Unassigned Submit ได้ และเปลี่ยน assignment หลัง Submit ได้ทุก role ที่เปิด request ได้
8. ใช้ ID แยกผู้ใช้ชื่อซ้ำ การเลือก assignee ที่ไม่ใช่ setup owner ถูกปฏิเสธ ฝั่ง client เปลี่ยนชื่อ/Dept เพื่อปลอม assignment ไม่ได้
9. PSF save ไม่ claim/change Owner และ assignment ไม่เปลี่ยนสิทธิ์แก้/เปลี่ยนสถานะ ไม่ enqueue เมล
10. Dashboard dropdown มีเฉพาะ setup owner ทุกตัวเลือกให้ยอดและรายการตรงกัน Related to me ไม่มีรายการซ้ำ และ reassignment/clear อัปเดต scope ถูกต้อง
11. ชน revision และ DB failure ไม่ทิ้ง request/search index/audit ที่อัปเดตเพียงบางส่วน และ UI ไม่ทิ้งค่าที่ผู้ใช้กำลังเลือกโดยไม่มีคำอธิบาย
12. ข้อมูล Owner/Dept เก่ายังคงแสดงได้หลังเพิ่ม storage และยังหาได้จาก Department work/Requests โดยไม่เดาจับคู่ user

ใช้ unit/component tests กับกติกาและการโต้ตอบ, API/SQL tests กับ permission/revision/transaction/filtering และ E2E flow ผ่าน frontend/backend/PostgreSQL จริงใน fixture แยกสำหรับ Form Preview และ Draft → Submit → Assign → Dashboard ไม่ต้องเชื่อม DB, LDAP หรือ mail service ของบริษัท

## ขั้นตอนถัดไป

Review spec นี้ก่อน จากนั้นเขียน implementation plan ระบุลำดับ storage/API/UI/test และเลือกวิธี execute ตามขั้นตอน brainstorming
