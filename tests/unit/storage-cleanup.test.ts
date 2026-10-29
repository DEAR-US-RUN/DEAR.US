import { describe,expect,it,vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { deleteObject } from '../../server/storage';
describe('versioned storage cleanup',()=>{
 it('retains the database cleanup job when an S3 batch reports partial failure',async()=>{
  const send=vi.fn().mockResolvedValueOnce({Versions:[{Key:'private/test-key',VersionId:'v1'}]}).mockResolvedValueOnce({Errors:[{Key:'private/test-key',Code:'AccessDenied'}]});
  const client={send} as unknown as S3Client;
  await expect(deleteObject('private/test-key',{client,bucket:'test'})).rejects.toThrow('STORAGE_CLEANUP_INCOMPLETE');
  expect(send).toHaveBeenCalledTimes(2);
 });
 it('never deletes neighboring keys with a common prefix',async()=>{
  const send=vi.fn().mockResolvedValueOnce({Versions:[{Key:'private/test-key-extra',VersionId:'v1'}]});
  const client={send} as unknown as S3Client;
  await deleteObject('private/test-key',{client,bucket:'test'});
  expect(send).toHaveBeenCalledTimes(1);
 });
});
