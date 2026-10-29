import { S3Client, HeadObjectCommand, GetObjectCommand, GetBucketVersioningCommand, ListObjectVersionsCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
let client: S3Client|undefined;
export function storage() {
  const {STORAGE_ENDPOINT:endpoint,STORAGE_REGION:region,STORAGE_BUCKET:bucket,STORAGE_ACCESS_KEY_ID:accessKeyId,STORAGE_SECRET_ACCESS_KEY:secretAccessKey}=process.env;
  if(!endpoint||!region||!bucket||!accessKeyId||!secretAccessKey)throw new Error('STORAGE_NOT_CONFIGURED');
  const url=new URL(endpoint); if(url.protocol!=='https:' && process.env.NODE_ENV==='production')throw new Error('STORAGE_NOT_CONFIGURED');
  if(!client)client=new S3Client({endpoint,region,forcePathStyle:process.env.STORAGE_FORCE_PATH_STYLE==='true',credentials:{accessKeyId,secretAccessKey},requestHandler:{requestTimeout:15000}});
  return {client,bucket};
}
export async function presignUpload(key:string,size:number) {
 const {client,bucket}=storage();
 // A still-valid upload URL must not be able to replace a published attachment.
 // Pinning the object version at completion makes later overwrites irrelevant.
 const versioning=await client.send(new GetBucketVersioningCommand({Bucket:bucket}));
 if(versioning.Status!=='Enabled')throw new Error('STORAGE_VERSIONING_NOT_CONFIGURED');
 return createPresignedPost(client,{Bucket:bucket,Key:key,Expires:300,Fields:{'Content-Type':'application/octet-stream'},Conditions:[['content-length-range',size,size],['eq','$Content-Type','application/octet-stream']]});
}
export async function checkUploaded(key:string,size:number):Promise<string> {
 const {client,bucket}=storage();
 const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
 if(head.ContentLength!==size||head.ContentType!=='application/octet-stream'||!head.VersionId||head.VersionId==='null')throw new Error('Upload validation failed');
 return head.VersionId;
}
export async function presignDownload(key:string,versionId:string) {
 const {client,bucket}=storage();
 if(!versionId)throw new Error('Missing object version');
 return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key,VersionId:versionId,ResponseContentDisposition:'attachment; filename="encrypted-diary-media.bin"',ResponseContentType:'application/octet-stream'}),{expiresIn:60});
}
export async function deleteObject(key:string,configured=storage()) {
  const {client,bucket}=configured;
  // Delete from the beginning each time: version markers may no longer be valid after deletion.
  // Bound each invocation; remaining versions are retried rather than orphaned silently.
  for(let batch=0;batch<10;batch++) {
    const page=await client.send(new ListObjectVersionsCommand({Bucket:bucket,Prefix:key,MaxKeys:1000}));
    const objects=[...(page.Versions||[]),...(page.DeleteMarkers||[])].filter(v=>v.Key===key&&v.VersionId).map(v=>({Key:v.Key!,VersionId:v.VersionId!}));
    if(!objects.length)return;
    const result=await client.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{Objects:objects,Quiet:true}}));
    if(result.Errors?.length)throw new Error('STORAGE_CLEANUP_INCOMPLETE');
  }
  throw new Error('STORAGE_CLEANUP_RETRY_REQUIRED');
}
