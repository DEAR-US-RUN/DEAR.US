import { test,expect } from '@playwright/test';

test.describe('appearance and gentle interactions in the sample',()=>{
 test.skip(!!process.env.E2E_EMULATOR,'Sample-only tests run against the unconfigured preview.');
 test('starts dark, even when the device prefers light',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference','dark');
  await expect(page.getByRole('group',{name:'Quick appearance controls'}).getByRole('button',{name:'Dark theme'})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#101c17');
  await expect(page.getByText('No diary data is saved or connected.')).toBeVisible();
 });
 test('quick and settings controls stay in sync and persist across reloads',async({page})=>{
  await page.goto('/');const quick=page.getByRole('group',{name:'Quick appearance controls'});
  const light=quick.getByRole('button',{name:'Light theme'});await light.focus();await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(light).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>localStorage.getItem('dear-us:appearance'))).toBe('light');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.goto('/settings');const options=page.getByRole('group',{name:'Appearance options'});
  await expect(options.getByRole('button',{name:'Light theme'})).toHaveAttribute('aria-pressed','true');
  await options.getByRole('button',{name:'Dark theme'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.getByRole('group',{name:'Quick appearance controls'}).getByRole('button',{name:'Dark theme'})).toHaveAttribute('aria-pressed','true');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 });
 test('system follows device changes, but an explicit choice does not',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});await page.goto('/settings');
  const options=page.getByRole('group',{name:'Appearance options'});await options.getByRole('button',{name:'System theme'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference','system');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.getByText(/System is currently using light mode/)).toBeVisible();
  await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.getByText(/System is currently using dark mode/)).toBeVisible();
  await page.reload();await expect(options.getByRole('button',{name:'System theme'})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await options.getByRole('button',{name:'Light theme'}).click();await page.emulateMedia({colorScheme:'light'});await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 });
 test('another tab can change the shared browser appearance preference',async({page,context})=>{
  await page.goto('/');const other=await context.newPage();await other.goto('/settings');
  await other.getByRole('group',{name:'Appearance options'}).getByRole('button',{name:'Light theme'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.getByRole('group',{name:'Quick appearance controls'}).getByRole('button',{name:'Light theme'})).toHaveAttribute('aria-pressed','true');
  await other.close();
 });
 test('still lets you switch themes for the session if local storage is blocked',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new Error('Storage blocked');}});});
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'Light theme'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 });
 test('system falls back to dark if the browser cannot report a system scheme',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:undefined});});
  await page.goto('/');await page.getByRole('button',{name:'System theme'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference','system');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 });
 test('the connection card opens and closes a privacy explainer',async({page})=>{
  await page.goto('/');const toggle=page.getByRole('button',{name:'About this connection'});const note=page.locator('#connection-privacy-note');
  await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(note).toBeHidden();
  await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(note).toContainText('Your entries stay private');await expect(note).toBeVisible();
  await toggle.focus();await page.keyboard.press('Enter');await expect(note).toBeHidden();
 });
 test('the reminder button offers a new thought and respects reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const reminder=page.locator('.reminder-card p');await expect(reminder).toContainText('ordinary moments, too.');
  await page.getByRole('button',{name:'Show another gentle reminder'}).click();await expect(reminder).toContainText('perfect words to begin.');
  expect(await page.locator('.reminder-thought').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('button',{name:'Show another gentle reminder'}).click();await expect(reminder).toContainText('one day at a time.');
  await expect(page.getByText('No diary data is saved or connected.')).toBeVisible();
 });
 test('theme controls and key pages fit narrow mobile screens',async({page})=>{
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   for(const path of ['/','/settings','/vault','/diaries/sample-together?tab=vault','/sign-in']){
    await page.goto(path);await expect(page.getByRole('group',{name:'Quick appearance controls'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${path} at ${width}px`).toBeLessThanOrEqual(width);
   }
  }
 });
});
