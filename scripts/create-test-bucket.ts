// Explicitly local-only setup for the disposable browser-test bucket.
import { S3Client,CreateBucketCommand,HeadBucketCommand,PutBucketVersioningCommand,GetBucketVersioningCommand } from '@aws-sdk/client-s3';
const {STORAGE_ENDPOINT:endpoint,STORAGE_REGION:region='us-east-1',STORAGE_BUCKET:bucket,STORAGE_ACCESS_KEY_ID:accessKeyId,STORAGE_SECRET_ACCESS_KEY:secretAccessKey}=process.env;
if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)throw new Error('Set the local STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY.');
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(endpoint).hostname)||!bucket.includes('test'))throw new Error('Only a localhost bucket whose name includes test is permitted.');
const client=new S3Client({endpoint,region,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
try {await client.send(new HeadBucketCommand({Bucket:bucket}));}
catch(error:any){if(error?.$metadata?.httpStatusCode!==404)throw error;await client.send(new CreateBucketCommand({Bucket:bucket}));}
await client.send(new PutBucketVersioningCommand({Bucket:bucket,VersioningConfiguration:{Status:'Enabled'}}));
const state=await client.send(new GetBucketVersioningCommand({Bucket:bucket}));
if(state.Status!=='Enabled')throw new Error('Test bucket versioning could not be enabled.');
console.log(`Local test bucket ${bucket} is ready with versioning enabled.`);
client.destroy();
