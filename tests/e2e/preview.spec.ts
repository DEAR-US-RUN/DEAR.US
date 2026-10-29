import { test,expect } from '@playwright/test';
test.describe('honest sample preview',()=>{
 test.skip(!!process.env.E2E_EMULATOR,'Sample-only tests run against the unconfigured preview.');
 test('shows a labeled sample and never claims the example was saved',async({page})=>{
  await page.goto('/');await expect(page.getByText('SAMPLE PREVIEW')).toBeVisible();await expect(page.getByText('No diary data is saved or connected.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Your diaries'})).toBeVisible();await page.getByRole('link',{name:/Our little world/}).click();
  await expect(page.getByText('Example content for the preview. No entry has been saved.')).toBeVisible();await page.getByRole('tab',{name:'Feelings vault'}).click();
  await expect(page.getByText('No pressure, no deadline.')).toBeVisible();await page.getByRole('button',{name:'Review and approve'}).click();await page.getByRole('button',{name:'I understand, approve'}).click();
  await expect(page.getByText('This is a sample preview; no approval was recorded.')).toBeVisible();
 });
 test('the create form explains that preview data cannot be saved',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Add diary'}).first().click();const modal=page.getByRole('dialog');
  await modal.getByLabel('Diary name').fill('A little space');await modal.getByLabel('Their display name').fill('Jamie');await modal.getByLabel('Diary password',{exact:true}).fill('long example passphrase');await modal.getByLabel('Confirm password').fill('long example passphrase');
  await modal.getByRole('button',{name:'Create diary'}).click();await expect(modal.getByText(/This is a sample preview/)).toBeVisible();
 });
 test('works at a narrow mobile viewport with keyboard-accessible navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('button',{name:'Open menu'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.getByRole('button',{name:'Open menu'}).click();
  await page.getByRole('link',{name:'Settings'}).click();await expect(page.getByRole('heading',{name:'Settings.'})).toBeVisible();
 });
});
