import { randomBytes, scryptSync } from 'node:crypto';
import process from 'node:process';
// No command-line arguments, history entry, or terminal echo for the secret.
if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Use an interactive private terminal to generate the owner credential.');
async function readSecret(prompt:string):Promise<string> {
 process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
 return new Promise((resolve,reject)=>{
  let value='';
  const done=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.removeListener('data',input);process.stdout.write('\n');};
  const input=(chunk:string|Buffer)=>{
   const text=String(chunk);for(const c of text){
    if(c==='\u0003'){done();reject(new Error('Cancelled.'));return;}
    if(c==='\r'||c==='\n'){done();resolve(value);return;}
    if(c==='\u007f'||c==='\b'){value=value.slice(0,-1);continue;}
    if(c>=' '&&c!=='\u001b')value+=c;
   }
  };
  process.stdin.on('data',input);
 });
}
const secret=await readSecret('Separate owner-access credential (input hidden): ');
if(secret.length<20)throw new Error('Use at least 20 characters, ideally a randomly generated passphrase.');
const repeated=await readSecret('Repeat credential: ');
if(secret!==repeated)throw new Error('Credentials did not match.');
const salt=randomBytes(16),hash=scryptSync(secret,salt,32,{N:16384,r:8,p:1});
console.log(`Set OWNER_CREDENTIAL_SCRYPT in the server secret manager to:\nscrypt:16384:8:1:${salt.toString('base64')}:${hash.toString('base64')}`);
