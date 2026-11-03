import { describe,expect,it } from 'vitest';
import { parseThemePreference,resolveTheme } from '../../src/theme';

describe('theme preferences',()=>{
 it('defaults to light for a missing or invalid stored choice',()=>{
  expect(parseThemePreference(null)).toBe('light');
  expect(parseThemePreference('')).toBe('light');
  expect(parseThemePreference('sepia')).toBe('light');
 });
 it('accepts all three explicit choices',()=>{
  expect(['dark','light','system'].map(parseThemePreference)).toEqual(['dark','light','system']);
 });
 it('follows the system only when that preference is selected',()=>{
  expect(resolveTheme('system',true)).toBe('dark');
  expect(resolveTheme('system',false)).toBe('light');
  expect(resolveTheme('dark',false)).toBe('dark');
  expect(resolveTheme('light',true)).toBe('light');
 });
});
