import { test,expect,type Page } from '@playwright/test';
test.describe('two-member journey against local Firebase Auth emulator and PostgreSQL',()=>{
 test.skip(!process.env.E2E_EMULATOR,'Requires the explicitly configured local Firebase emulator and test database.');
 test.setTimeout(180000);
 async function signIn(page:Page,uid:string,name:string){
  await page.evaluate(async({uid,name})=>{const path='/tests/e2e/auth-helper.ts';const helper=await import(/* @vite-ignore */ path);await helper.emulatorGoogleSignIn(uid,name);},{uid,name});
 }
 async function unlock(page:Page,password:string){const d=page.getByRole('dialog');await d.getByLabel('Diary password').fill(password);await d.getByRole('button',{name:'Unlock diary'}).click();}
 async function writeAndPublish(page:Page,title:string,body:string,vault=false){
  await page.getByRole('button',{name:'Write an entry'}).click();
  if(await page.getByRole('dialog').isVisible().catch(()=>false))await unlock(page,'a very private test password');
  await page.getByLabel('Entry title').fill(title);await page.getByLabel('Your entry').fill(body);
  if(vault)await page.getByRole('checkbox',{name:/Save this entry for the Feelings Vault/}).check();
  await expect(page.locator('.save-status')).toHaveText('Saved',{timeout:15000});
  await page.getByRole('button',{name:'Publish entry'}).click();await page.getByRole('dialog').getByRole('button',{name:'Publish permanently'}).click();
  await expect(page.getByText('Entry published permanently.')).toBeVisible();
 }
 test('draft recovery, immutable publishing, pairing and mutual reveal',async({browser,baseURL})=>{
  const suffix=Date.now().toString();const a=await browser.newContext({baseURL}),b=await browser.newContext({baseURL});const alice=await a.newPage(),bob=await b.newPage();
  await alice.goto('/');await signIn(alice,`alice-${suffix}`,'Alice');await expect(alice.getByText('Create your first diary')).toBeVisible();
  await alice.getByRole('button',{name:'Create your first diary'}).click();const create=alice.getByRole('dialog');
  await create.getByLabel('Diary name').fill('Our test story');await create.getByLabel('Their display name').fill('Bob');await create.getByLabel('Diary password',{exact:true}).fill('a very private test password');await create.getByLabel('Confirm password').fill('a very private test password');
  await create.getByLabel('A gentle target').selectOption('duration');await create.getByRole('spinbutton',{name:'Number of days'}).fill('30');await create.getByRole('button',{name:'Create diary'}).click();
  await expect(alice.getByRole('heading',{name:'Our test story.'})).toBeVisible();await expect(alice.getByText('Starts when you both join')).toBeVisible();
  await alice.getByRole('button',{name:'Write an entry'}).click();await unlock(alice,'a very private test password');await alice.getByLabel('Entry title').fill('Only Alice can read this');await alice.getByLabel('Your entry').fill('A private, unpublished draft.');await expect(alice.locator('.save-status')).toHaveText('Saved',{timeout:15000});
  await alice.reload();await alice.getByRole('button',{name:'Write an entry'}).click();await unlock(alice,'a very private test password');await expect(alice.getByLabel('Your entry')).toHaveValue('A private, unpublished draft.');
  await alice.getByRole('button',{name:'Publish entry'}).click();await alice.getByRole('dialog').getByRole('button',{name:'Publish permanently'}).click();await expect(alice.getByText('Entry published permanently.')).toBeVisible();
  await alice.getByRole('button',{name:'Invite Bob'}).click();const invitation=alice.getByRole('dialog');await invitation.getByRole('button',{name:'Create invitation link'}).click();const link=await invitation.getByLabel('Invitation link').inputValue();await invitation.getByRole('button',{name:'Close'}).click();
  await bob.goto(link);await signIn(bob,`bob-${suffix}`,'Bob');await bob.getByRole('button',{name:'Accept invitation'}).click();await expect(bob.getByText('Connection established.')).toBeVisible();
  await bob.getByRole('button',{name:'Unlock diary'}).first().click();await unlock(bob,'a very private test password');await expect(bob.getByText('A blank page, just for you.')).toBeVisible();await expect(bob.getByText('Only Alice can read this')).toHaveCount(0);
  await alice.reload();await writeAndPublish(alice,'Alice vault note','A message for the vault.',true);
  await writeAndPublish(bob,'Bob vault note','Another message for the vault.',true);
  await bob.getByRole('tab',{name:'Feelings vault'}).click();await bob.getByRole('button',{name:'Review and approve'}).click();await bob.getByRole('button',{name:'I understand, approve'}).click();await expect(bob.getByText('Your approval has been recorded. Waiting for the other person.')).toBeVisible();
  await alice.getByRole('tab',{name:'Feelings vault'}).click();await alice.getByRole('button',{name:'Review and approve'}).click();await alice.getByRole('button',{name:'I understand, approve'}).click();await expect(alice.getByText('The Feelings Vault has been revealed together.')).toBeVisible();
  await bob.reload();await bob.getByRole('tab',{name:'Feelings vault'}).click();await bob.getByRole('button',{name:'Unlock diary'}).first().click();await unlock(bob,'a very private test password');
  await expect(bob.getByRole('heading',{name:'Alice vault note'})).toBeVisible();await expect(bob.getByRole('heading',{name:'Bob vault note'})).toBeVisible();await expect(bob.getByText('Only Alice can read this')).toHaveCount(0);
  await a.close();await b.close();
 });
});
