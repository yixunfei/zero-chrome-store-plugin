import { existsSync } from 'node:fs';

export function chromeExecutable() {
  const candidates = [
    process.env.ZV_CHROME_PATH,
    process.env.ProgramFiles && process.env.ProgramFiles + '/Google/Chrome/Application/chrome.exe',
    process.env['ProgramFiles(x86)'] && process.env['ProgramFiles(x86)'] + '/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  ].filter((value): value is string => Boolean(value));
  return candidates.find(existsSync) ?? 'chrome.exe';
}
