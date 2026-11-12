import test from 'node:test';
import assert from 'node:assert/strict';
import {sendPhotoEmail} from './index.mjs';
test('The existing SMTP sender requires acceptance of the intended customer address',async()=>{
 const messages=[],smtp={async sendMail(message){messages.push(message);return {accepted:['ALICE@example.test']};}};
 await sendPhotoEmail(smtp,'Recognition Direct <roth@example.test>',{to:'alice@example.test',subject:'Code',text:'Sample code'});
 assert.equal(messages[0].to,'alice@example.test');
 await assert.rejects(sendPhotoEmail(smtp,'sender@example.test',{to:'bob@example.test'}),e=>e.code==='PILOT_EMAIL_NOT_ACCEPTED');
 await assert.rejects(sendPhotoEmail(smtp,'sender@example.test',{to:'bad\r\nBcc: other@example.test'}),e=>e.code==='PILOT_EMAIL_SETUP_REQUIRED');
});
