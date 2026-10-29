import { test,expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
test('encrypted media uploads, downloads, and stays pinned after a signed URL is replayed',async({page})=>{
 test.skip(!process.env.E2E_EMULATOR||!process.env.E2E_STORAGE,'Requires local Auth emulator, test PostgreSQL, and a versioned S3-compatible test bucket.');test.setTimeout(90000);
 await page.goto('/');await page.evaluate(async()=>{const path='/tests/e2e/auth-helper.ts';const h=await import(/* @vite-ignore */ path);await h.emulatorGoogleSignIn(`media-${Date.now()}`,'Media Tester');});
 await page.getByRole('button',{name:'Create your first diary'}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Diary name').fill('Private media');await dialog.getByRole('button',{name:/Personal/}).click();await dialog.getByLabel('Diary password',{exact:true}).fill('a very private test password');await dialog.getByLabel('Confirm password').fill('a very private test password');await dialog.getByRole('button',{name:'Create diary'}).click();
 await page.getByRole('button',{name:'Write an entry'}).click();const unlock=page.getByRole('dialog');await unlock.getByLabel('Diary password').fill('a very private test password');await unlock.getByRole('button',{name:'Unlock diary'}).click();
 await page.getByLabel('Entry title').fill('My private photograph');
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 const presignResponse=page.waitForResponse(r=>r.url().includes('/uploads')&&r.request().method()==='POST'&&!r.url().includes('/complete')&&r.status()===200);
 await page.locator('input[type=file]').setInputFiles({name:'little-photo.png',mimeType:'image/png',buffer:image});const signed=await (await presignResponse).json();
 await expect(page.getByText('Attachment uploaded.')).toBeVisible({timeout:20000});await expect(page.locator('.save-status')).toHaveText('Saved',{timeout:15000});
 await page.getByRole('button',{name:'Publish entry'}).click();await page.getByRole('dialog').getByRole('button',{name:'Publish permanently'}).click();await expect(page.getByText('Entry published permanently.')).toBeVisible();
 // Reusing a still-valid signed POST writes a new version, but the entry must retain the original version.
 const form=new FormData();for(const [k,v] of Object.entries(signed.post.fields))form.append(k,String(v));form.append('file',new Blob([randomBytes(image.length+16)],{type:'application/octet-stream'}),'encrypted.bin');
 const overwrite=await fetch(signed.post.url,{method:'POST',body:form});expect(overwrite.ok).toBe(true);
 await page.getByRole('button',{name:/little-photo.png/}).click();const shown=page.locator('img[alt="little-photo.png"]');await expect(shown).toBeVisible({timeout:15000});
 expect(await shown.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1);
});
