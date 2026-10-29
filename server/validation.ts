import { z } from 'zod';
export const uuid=z.string().uuid();
const base64=z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);
const iv=base64.refine(s=>Buffer.from(s,'base64').length===12);
export const ciphertextSchema=z.object({v:z.literal(1),iv,data:base64.min(24).max(300_000)}).strict();
export const passwordEnvelopeSchema=z.object({v:z.literal(1),kdf:z.literal('PBKDF2-SHA256'),iterations:z.literal(600000),salt:base64.refine(s=>Buffer.from(s,'base64').length===16),iv,data:base64.refine(s=>Buffer.from(s,'base64').length===48)}).strict();
export const diarySchema=z.object({
  id:uuid,title:z.string().trim().min(1).max(80),kind:z.enum(['personal','connected']),
  relationshipLabel:z.string().trim().max(60).optional(),otherName:z.string().trim().max(80).optional(),
  targetMode:z.enum(['none','date','duration']),targetDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),targetDuration:z.number().int().min(1).max(36500).optional(),
  passwordEnvelope:passwordEnvelopeSchema,escrowKey:base64.refine(s=>Buffer.from(s,'base64').length===32),
}).strict().superRefine((v,ctx)=>{
  if(v.kind==='connected' && (!v.relationshipLabel||!v.otherName))ctx.addIssue({code:'custom',message:'Relationship and other name required'});
  if(v.kind==='personal' && (v.relationshipLabel||v.otherName))ctx.addIssue({code:'custom',message:'Personal diary has no second member'});
  if(v.targetMode==='date' && (!v.targetDate || Number.isNaN(Date.parse(v.targetDate+'T00:00:00Z')) || new Date(v.targetDate+'T00:00:00Z').toISOString().slice(0,10)!==v.targetDate || v.targetDate<new Date().toISOString().slice(0,10)))ctx.addIssue({code:'custom',message:'Invalid target date'});
  if(v.targetMode==='duration'&&!v.targetDuration)ctx.addIssue({code:'custom',message:'Duration required'});
});
export const draftSchema=z.object({operationId:uuid,expectedVersion:z.number().int().min(0),ciphertext:ciphertextSchema,entryType:z.enum(['text','photo','video','voice','media']),forVault:z.boolean(),attachmentIds:z.array(uuid).max(8).refine(ids=>new Set(ids).size===ids.length)}).strict();
export const uploadSchema=z.object({id:uuid,mime:z.enum(['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','application/pdf']),size:z.number().int().positive().max(40*1024*1024),iv}).strict().superRefine((v,ctx)=>{
 const max=v.mime.startsWith('image/')?10*1024*1024:v.mime.startsWith('video/')?40*1024*1024:20*1024*1024;
 if(v.size>max)ctx.addIssue({code:'custom',message:'File too large'});
});
