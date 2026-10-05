# Email Notification — ฉบับรวมสำหรับ Review

- วันที่: 2026-10-05
- Branch: `feat/email-notification`
- สถานะ: **รวมคำตอบ review ทั้ง 5 ข้อแล้ว — implementation ในเครื่องตามคำสั่งผู้ใช้**
- รายละเอียดพฤติกรรม/ตั้งค่าปัจจุบัน: [Email notifications](../../email-notifications.md)
- อ้างอิง: [design spec เดิม](2026-10-05-email-notification-design.md)
- เอกสารนี้รวบรวมข้อสรุปล่าสุดและข้อเสนอเพิ่มเติม เอกสารเดิมยังมีรายละเอียดที่ต้องปรับตามผล review โดยเฉพาะ From และกฎผู้รับ

## 1. เป้าหมายและข้อที่ตกลงแล้ว

เพิ่มการแจ้งอีเมลเมื่อ request เข้าสู่สถานะที่ตั้งค่าให้ส่ง โดย admin กำหนดผู้รับแยกตามสถานะได้ และการติดต่อ mail service ไม่ทำให้ผู้ใช้ต้องรอระหว่างเปลี่ยนสถานะ

ข้อที่ตกลงแล้ว:

1. ทำงานใน checkout `feat-email-notification/` เป็นหลัก
2. From ใช้ `noreply-psf@nxp.com` ทุกกรณี ไม่ใช้ email ของผู้ดำเนินการ
3. แต่ละ status มี To, CC และ checkbox “ไม่ส่งอีเมลเมื่อเข้าสู่สถานะนี้”
4. เมื่อ A → B ให้ใช้การตั้งค่าของ **B** เมื่อ B → C ให้ใช้การตั้งค่าของ **C**
5. SOAP endpoint อยู่ใน LAN บริษัท จึงยังไม่ทดสอบการเชื่อมต่อหรือส่งจริงจาก environment นี้
6. ผู้ใช้อนุมัติให้เริ่ม implementation หลัง review และรวม UI ล่าสุดจาก unified-local-auth แล้ว
7. To/CC รองรับทั้ง email ที่กรอกเอง รวมถึง mailbox กลุ่มที่ไม่มีในระบบ และการเลือกผู้รับจากผู้ใช้ในระบบ
8. Submit ใช้ policy ของสถานะเป้าหมายที่เลือก
9. สถานะเดิมและสถานะใหม่เริ่มด้วย “ไม่ส่งอีเมล” จน admin ตั้งผู้รับและเปิดส่ง
10. การลบสถานะแล้ว bulk replace ให้สร้าง notification แยกทุก request โดยใช้ policy ของสถานะปลายทาง; หากปลายทางปิดส่ง ก็ไม่สร้างงาน
11. ความผิดพลาดของ notification ที่กู้คืนได้ต้องไม่ทำให้การเปลี่ยนสถานะหรือ bulk replacement ล้มเหลว

## 2. เพิ่มอะไรใน Status Management

เพิ่มการตั้งค่าอีเมลให้แต่ละ status ในหน้าปัจจุบัน:

| การตั้งค่า | พฤติกรรมที่เสนอ |
| --- | --- |
| To | รายชื่อผู้รับหลัก กรอก email เองและเลือกผู้รับจากระบบร่วมกันได้ |
| CC | รายชื่อผู้รับสำเนา กรอก email เองและเลือกผู้รับจากระบบร่วมกันได้; เว้นว่างได้ |
| ไม่ส่งอีเมลเมื่อเข้าสู่สถานะนี้ | เมื่อติ๊ก จะไม่สร้างงานส่งเมลจากการเข้าสู่สถานะนี้ |
| Save / Cancel | บันทึกหรือยกเลิกการแก้ไขก่อนมีผล |

เมื่อเลือกไม่ส่ง ให้ช่อง To/CC อยู่ในสถานะ disabled แต่เก็บค่าเดิมไว้ เมื่อเปิดกลับมาจึงไม่ต้องกรอกใหม่

หากเปิดส่ง ต้องมี To ที่ถูกต้องก่อนบันทึก กรองช่องว่าง ตรวจ email และตัดรายการซ้ำ รวมถึงไม่ใส่ผู้รับที่อยู่ใน To ซ้ำใน CC การตรวจฝั่ง backend เป็นข้อบังคับ แม้หน้า UI ตรวจแล้ว

**คำตอบ review:** รองรับทั้งการกรอก email คงที่และการเลือกผู้รับจากผู้ใช้ในระบบในช่องเดียวกัน เพื่อให้ใช้ mailbox กลุ่มที่ไม่มี user account ได้ด้วย รายชื่อผู้ใช้ที่เลือกได้ต้องมี email ที่ถูกต้อง และรายชื่อจากทั้งสองวิธีจะถูกรวมและตัดซ้ำก่อน snapshot ลง outbox การเลือกผู้ใช้บันทึก email ปัจจุบันเป็นรายชื่อคงที่ ไม่สร้างการสมัครรับตาม role; หาก email ผู้ใช้เปลี่ยน ให้ admin แก้ policy ตามด้วย

## 3. ข้อมูลและ API ของ Status Management

เสนอให้เก็บ email policy ภายใน entry ของ status ใน `workflow_transition_config.config_json` ที่มีอยู่แล้ว ประกอบด้วยการเปิด/ปิดส่ง รายชื่อ To และรายชื่อ CC จึงยังไม่ต้องเพิ่มตารางแยกสำหรับ policy

- ผูก policy กับ **status ID** ซึ่งระบบมีอยู่แล้ว ไม่ผูกกับข้อความชื่อ status
- เปลี่ยนชื่อ status แล้ว policy ต้องยังอยู่ครบ
- การสร้าง แก้ชื่อ ลบ และแก้ PSF visibility trigger ต้องไม่ทำให้ policy ของสถานะอื่นหาย
- ใช้ revision `expectedUpdatedAt` และ transaction ตามรูปแบบเดิม เพื่อป้องกัน admin บันทึกทับการแก้ไขของอีกคน
- บันทึก audit ว่าใครแก้ค่าใด พร้อมค่าเดิมและค่าใหม่
- เฉพาะ admin ดูและแก้ recipient settings ผ่าน admin API ส่วน API status catalog สำหรับผู้ใช้ทั่วไปไม่ต้องคืนรายชื่อ email
- การส่งเมลและ PSF visibility trigger เป็นการตั้งค่าคนละส่วน การปิดเมลไม่เปลี่ยนกฎการเปิดเผย PSF

## 4. เมื่อผู้ใช้เปลี่ยนสถานะ

ลำดับการทำงานที่เสนอ:

1. ตรวจ session, สิทธิ์, request revision และสถานะปลายทางตามระบบเดิม
2. อ่าน policy ของสถานะปลายทางจาก configuration ที่ lock ภายใน transaction เดียวกัน
3. บันทึก request, search index และ audit ตามปกติ
4. หากสถานะปลายทางเลือกไม่ส่ง ให้จบขั้นตอนโดยไม่สร้าง outbox
5. หากเปิดส่ง ให้เตรียมผู้รับและเนื้อหา แล้ว enqueue ก่อน commit
6. หลัง transaction commit แล้ว worker จึงสามารถรับงานไปส่งได้

ตัวอย่าง:

| การกระทำ | การตั้งค่า | ผลลัพธ์ |
| --- | --- | --- |
| A → B | B เปิดส่ง | Enqueue โดยใช้ To/CC ของ B |
| A → B | B เลือกไม่ส่ง | เปลี่ยนสถานะได้และไม่มีงานส่งเมล |
| B → C | C เปิดส่ง | Enqueue โดยใช้ To/CC ของ C |
| เลือกสถานะเดิม | ไม่ได้เปลี่ยนสถานะจริง | ไม่ enqueue |
| การเปลี่ยนสถานะล้มเหลว/rollback | เปิดส่งก็ตาม | ไม่มีงานส่งเมลที่ commit จากเหตุการณ์นั้น |

หากออกจาก B แล้วกลับเข้า B อีกครั้ง จะเป็นเหตุการณ์ใหม่และใช้ policy ของ B ในเวลานั้น

**คำตอบ review:** ตอน submit Draft ให้ใช้ policy ของสถานะเป้าหมายที่เลือก และสร้างอีเมล submission เพียงชุดเดียว ไม่ส่งซ้ำอีกชุดด้วยกฎ status-change แบบเดิม ส่วนการ save Draft หรือแก้ข้อมูลอย่างเดียวไม่ส่งเมลใน scope แรก

**Bulk replacement:** เมื่อลบสถานะแล้วแทนที่ requests ให้ enqueue แยกทุก request โดยใช้ To/CC ของสถานะปลายทางที่เลือก รวมถึงเคารพ checkbox ไม่ส่งของปลายทางด้วย ต้องเพิ่ม hook ที่ `WorkflowTransitionService` เพราะเส้นทางนี้ไม่ได้เรียก `RequestsService.updateRequestStatus` และต้องใช้ savepoint แยกสำหรับแต่ละ notification เพื่อให้งานหนึ่งที่ enqueue ล้มไม่ยกเลิกการแทนที่หรือ notification อื่นที่สำเร็จ

## 5. Outbox และความผิดพลาด

เพิ่ม `email_outbox` เก็บ event, request, status ID/ชื่อสถานะในเวลานั้น, ผู้รับเดิม, From, subject, body และประวัติการส่ง

- Snapshot ผู้รับและเนื้อหาตอน enqueue การแก้ policy ภายหลังมีผลกับเหตุการณ์ใหม่ ไม่เปลี่ยนงานที่เข้าคิวแล้ว
- สถานะงานประกอบด้วย pending, sending, sent และ failed
- การติ๊กไม่ส่งเป็นการปิด event ไม่ใช่ความผิดพลาด จึงไม่ส่งเข้า mailbox fallback
- Mail service ล่มหรือ timeout เป็นเรื่องของ worker ไม่ทำให้ request transaction ล้ม

ตามคำตอบ review การเปลี่ยนสถานะต้องไม่ล้มเหลวเพราะ notification จึงเสนอให้ครอบขั้นตอนเตรียม notification และ enqueue ด้วย savepoint หากเกิดความผิดพลาดที่กู้คืนได้ ให้ rollback เฉพาะส่วนนั้น บันทึก error พร้อม request/event และปล่อยให้ธุรกรรมหลักดำเนินต่อ การ catch exception อย่างเดียวไม่เพียงพอสำหรับ SQL error ภายใน transaction

ข้อแลกเปลี่ยน: หาก enqueue ไม่สำเร็จ อาจไม่มีอีเมลของเหตุการณ์นั้น และต้องตรวจผ่าน logs การ retry รับประกันได้เฉพาะงานที่เข้าตารางสำเร็จแล้ว ส่วน connection เสียหรือ transaction หลักเสียทั้งหมดอาจยังทำให้ request ล้มได้

### Enqueue ล้มเหลวได้ในกรณีใด

การ enqueue ในแบบนี้คือการ INSERT ลง `email_outbox` ภายใน PostgreSQL ยังไม่เกี่ยวข้องกับ SOAP หรือการเข้าถึง LAN

- Schema ของ outbox ไม่พร้อม เช่น deployment มีโค้ดใหม่แต่ตารางหรือ column ไม่ตรงกัน
- Database account มีสิทธิ์เปลี่ยน request แต่ไม่มีสิทธิ์ INSERT ตาราง outbox
- ข้อมูล notification ผิด constraint หรือมี bug ในการเตรียม template/ผู้รับ
- Query ถูกยกเลิกหรือ timeout ที่สามารถ rollback ไปยัง savepoint แล้วดำเนิน transaction ต่อได้

ส่วน SOAP ล่ม, network ภายในเข้าถึงไม่ได้ หรือ SOAP fault เกิดหลังเข้าคิวแล้ว งานยังอยู่ใน outbox และ worker retry ได้

หาก connection ฐานข้อมูลที่ใช้บันทึก request ขาดหรือ transaction หลักเสียจน commit ไม่ได้ จะไม่สามารถรับประกันการเปลี่ยนสถานะสำเร็จได้ด้วย savepoint นี่เป็นขอบเขตของการบันทึก request เอง ไม่ใช่กรณี notification failure ที่กู้คืนได้

อ้างอิงกลไก: [PostgreSQL ROLLBACK TO SAVEPOINT](https://www.postgresql.org/docs/current/sql-rollback-to.html)

`MAIL_DEFAULT_TO` ใช้สำหรับ admin delivery alerts และ fallback ที่กำหนดไว้อย่างชัดเจน ไม่ใช้แทน To ที่ admin ปล่อยว่างขณะเปิดส่ง; การตั้งค่าแบบนั้นต้องถูกปฏิเสธตั้งแต่บันทึก

## 6. Worker และการส่ง SOAP

ใช้ background worker ใน NestJS กับ PostgreSQL outbox ตาม design เดิม ยังไม่เพิ่ม Redis หรือระบบ queue แยก

- Poll แบบไม่ซ้อนกัน และ claim งานแบบ atomic ด้วย `FOR UPDATE SKIP LOCKED`
- SOAP call อยู่นอก database transaction เสมอ
- ใช้ claim token เพื่อให้ worker เก่าไม่เขียนทับผลของ worker ที่รับงานต่อ
- Retry สูงสุด 5 attempts โดยรอ 1, 5, 15 และ 60 นาทีระหว่างครั้ง
- กู้คืนงาน sending ที่หมดเวลา พร้อมรักษาขีดจำกัด attempts
- เมื่อส่งไม่สำเร็จครบจำนวนครั้ง เปลี่ยนเป็น failed และรวม admin alert ต่อ batch
- หาก admin alert เองส่งล้มเหลว จะไม่สร้าง alert ซ้อนอีก
- เก็บ marker การสร้าง alert ลงฐานข้อมูล โดย INSERT summary และ mark งานต้นทางใน transaction เดียวกัน หากล้มเหลว รอบถัดไปลองใหม่ได้ และ worker หลายตัวไม่แจ้งซ้ำสำหรับ failure cycle เดียวกัน
- หยุด polling และจัดการงานที่กำลังส่งเมื่อแอป shutdown

ระบบมีโอกาสส่งซ้ำหาก SOAP รับคำขอแล้ว แต่แอปดับก่อนบันทึกผล `sent` จึงไม่รับประกัน exactly-once และ `sent` หมายถึง SOAP ยอมรับคำขอ ไม่ใช่ยืนยันว่าเข้า inbox แล้ว

## 7. From และเนื้อหาอีเมล

- From ใช้ `noreply-psf@nxp.com` ทั้ง request notifications, admin alerts และ test emails
- แสดงผู้ดำเนินการใน body เช่น Updated by: ชื่อและ role
- เนื้อหาแสดงเลข request, ข้อมูลสรุปจาก requester, สถานะก่อน/หลัง และลิงก์เปิด request
- ใช้ status kind เพื่อแยกหัวข้อทั่วไป/Completed/Cancelled ไม่ใช้ชื่อสถานะตายตัว
- ไม่ใส่ PSF Created Information ในอีเมล
- Escape ข้อมูลผู้ใช้ใน HTML และ SOAP XML รวมถึงจัดการ CDATA ให้ถูกต้อง
- ไม่เพิ่ม footer อัตโนมัติซ้ำกับ footer ของ SOAP service

ลิงก์ใช้ `APP_BASE_URL/requests/{requestId}` และใช้ login redirect ที่ frontend มีอยู่แล้ว ต้องตรวจกรณีไม่มีสิทธิ์และ SPA fallback เพิ่มเติม

## 8. ปิดส่ง, Redirect และงานค้าง

แยกการควบคุมสองระดับ:

| ตัวควบคุม | ความหมาย |
| --- | --- |
| ไม่ส่งเมลของแต่ละ status | ไม่สร้าง outbox สำหรับการเข้าสู่ status นั้น |
| `MAIL_ENABLED=false` | หยุด dispatch แต่สถานะที่เปิดส่งยังสร้างงาน pending ได้ |

เมื่อเปิด `MAIL_ENABLED` กลับมาแล้ว restart แอป งาน pending เดิมจะถูกนำไปส่ง ต้องแจ้งพฤติกรรมนี้ในเอกสารตั้งค่า เพราะไม่ใช่การทิ้งงานทดสอบเก่าโดยอัตโนมัติ

เสนอให้ development/test ที่เปิด dispatch ต้องมี `MAIL_REDIRECT_TO` โดยส่ง To ไปยังผู้รับทดสอบและล้าง CC/BCC ทั้งหมด ใช้ subject `[TEST]` และ banner แสดงผู้รับเดิม เก็บ intended recipients และ actual recipients แยกกันใน audit

รอบนี้ไม่เรียก endpoint ใน LAN จริง การตรวจ SOAP จะใช้ mock response ทั้ง success, fault, invalid XML และ timeout

## 9. Admin Notifications API

คง scope ของ design เดิม:

- List: ดูงานและกรองสถานะ พร้อม pagination; ไม่โหลด body ทั้งหมดในรายการ
- Resend: ใช้ได้เฉพาะงาน failed โดยใช้ snapshot ผู้รับและเนื้อหาของงานเดิม
- Test: ส่ง template ทดสอบที่กำหนดไว้ ใช้ From กลางและ redirect เดียวกับงานปกติ พร้อมบันทึกผล
- ตรวจ session และ role จาก profile ใน backend

หน้า monitoring UI แยกต่างหากยังไม่รวมใน scope แรก เว้นแต่ต้องการเพิ่ม ส่วนหน้าที่ต้องปรับแน่นอนคือ Status Management

## 10. ข้อเสนอสำหรับค่าเริ่มต้นและการแก้ catalog

1. สถานะเดิมที่ไม่มี policy และสถานะใหม่เริ่มด้วย “ไม่ส่งอีเมล” จน admin ตั้งผู้รับและเปิดส่ง
2. Draft ปิดส่งเสมอ
3. Rename status หรือแก้ recipient settings ไม่ถือเป็นการเปลี่ยนสถานะของ request จึงไม่ส่งเมล
4. ตามคำตอบ review การลบ status แล้ว bulk replace requests ส่งแยกทุก request ตาม policy ของปลายทาง หน้ายืนยันการลบต้องแสดงจำนวน request และสรุปว่าปลายทางเปิด/ปิดส่งพร้อมผู้รับ ให้ admin เห็นผลก่อนยืนยัน
5. การปิด policy ภายหลังไม่ยกเลิกงาน pending เดิม หากต้องการยกเลิกย้อนหลังต้องออกแบบคำสั่งแยก ไม่รวมโดยอัตโนมัติ

## 11. ส่วนที่คาดว่าจะปรับและลำดับทำงาน

| ส่วน | สิ่งที่จะเพิ่ม/ปรับ |
| --- | --- |
| Backend Status Management | Types, policy storage/normalization, validation, operation, audit และ public projection |
| Frontend Status Management | To/CC แบบกรอกเองและเลือกผู้ใช้จากระบบ, checkbox, Save/Cancel, validation feedback และสรุป notification ตอน bulk replacement |
| Frontend API types | รองรับ policy ใน admin configuration |
| Backend Requests | Hook submission/status-change ให้ใช้ policy ของสถานะปลายทาง |
| Backend WorkflowTransitionService | Hook bulk replacement แยก notification ทุก request ตาม policy ปลายทาง |
| Backend Notifications | Config, outbox storage, templates, SOAP dispatcher, worker และ admin API |
| เอกสารตั้งค่า | From, LAN limitation, redirect และพฤติกรรมคิวเมื่อปิดส่ง |

ลำดับที่เสนอ: ยืนยัน design → ปรับ spec หลัก → เขียน implementation plan → ทำ status policy และ UI → ทำ notification storage/dispatcher → เชื่อม workflow → ทำ worker/admin API → ตรวจทั้ง flow ด้วย mock → ทดสอบ SOAP จริงใน LAN บริษัท

## 12. เกณฑ์ตรวจรับและคำตอบ review

เกณฑ์ตรวจรับ:

- A → B ใช้ policy ของ B; B → C ใช้ policy ของ C
- สถานะที่เลือกไม่ส่งไม่สร้าง outbox และไม่ใช้ fallback
- ผู้รับต่างกันแต่ละ status ได้ และ policy ไม่หายเมื่อ rename หรือแก้ catalog
- To/CC ผสม email ที่กรอกเอง/mailbox กลุ่มกับผู้ใช้ที่เลือกจากระบบได้ โดยไม่มีผู้รับซ้ำ
- Submit ใช้ policy ของสถานะเป้าหมายที่เลือก
- Bulk replacement สร้างงานแยกทุก request ที่ปลายทางเปิดส่ง; ปลายทางปิดส่งไม่สร้างงาน
- Enqueue ล้มเหลวที่กู้คืนได้ในหนึ่ง request ของ bulk replacement ไม่ยกเลิกการแทนที่หรือ notification อื่นที่สำเร็จ
- Request rollback แล้วไม่มี notification ที่ commit; enqueue error ที่กู้คืนได้ไม่ทำให้ request ล้ม
- Worker หลาย instance ไม่ claim งานเดียวกันพร้อมกัน และ worker เก่าไม่เขียนทับผลของ claim ใหม่
- Redirect ไม่ปล่อยผู้รับจริงหลุดผ่าน To/CC/BCC
- Retry, stuck recovery, resend และ admin alert ไม่เกิด loop
- From เป็น `noreply-psf@nxp.com` และเนื้อหาไม่เปิดเผย PSF Created Information
- การทดสอบ concurrency ใช้ PostgreSQL หลาย connection; PGlite ใช้ตรวจ SQL/constraints แบบ sequential ได้
- Live verification แยกจาก mock tests และทำภายใน LAN เท่านั้น ต้องตรวจด้วยว่า relay ยอมรับ From นี้จริง

คำตอบจากผู้ใช้:

1. To/CC กรอก email คงที่และเลือกผู้รับจากระบบได้ เพราะมี mailbox กลุ่มที่ไม่อยู่ในระบบ
2. Submit ส่งตามสถานะเป้าหมายที่เลือก
3. ค่าเริ่มต้นของสถานะเดิมและใหม่เป็น “ไม่ส่ง”
4. Bulk replacement ส่งตาม To/CC ของปลายทางทุก request โดยเคารพการปิดส่งของปลายทางเช่นเดียวกับการเปลี่ยนสถานะทั่วไป
5. การเปลี่ยนสถานะต้องไม่ล้มเหลวเพราะขั้นตอน notification; กรณี enqueue ล้มเหลวและข้อจำกัดของ transaction อธิบายในหัวข้อ 5

เริ่ม implementation ตามคำสั่งผู้ใช้แล้ว การทดสอบใช้ mock และฐานข้อมูลแยกในเครื่อง ยังไม่เรียก SOAP endpoint จริง
