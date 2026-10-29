import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand,ListObjectVersionsCommand,PutObjectCommand } from '@aws-sdk/client-s3';
import { deleteObject,storage } from '../../server/storage';

test('cleanup removes every test object version and delete marker',async()=>{
 test.skip(!process.env.E2E_STORAGE||!process.env.STORAGE_ENDPOINT,'Requires explicitly configured disposable local versioned storage.');
 const endpoint=new URL(process.env.STORAGE_ENDPOINT!);
 if(!['127.0.0.1','localhost'].includes(endpoint.hostname)||!process.env.STORAGE_BUCKET?.includes('test'))throw new Error('Storage cleanup test only permits a local test bucket.');
 const {client,bucket}=storage();const key=`private/test-only-${randomUUID()}`;
 for(let i=0;i<3;i++)await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:`test version ${i}`}));
 await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
 const before=await client.send(new ListObjectVersionsCommand({Bucket:bucket,Prefix:key}));
 expect(before.Versions?.length).toBe(3);expect(before.DeleteMarkers?.length).toBe(1);
 await deleteObject(key);
 const after=await client.send(new ListObjectVersionsCommand({Bucket:bucket,Prefix:key}));
 expect(after.Versions?.length||0).toBe(0);expect(after.DeleteMarkers?.length||0).toBe(0);
});
