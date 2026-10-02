import { clipboard } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PasteTarget {
  app: string | null;
  pid: number;
  bundleId: string | null;
  text: string;
}

export class TextInjector {
  private lastActiveApp: string | null = null;
  private lastPid = 0;
  private lastBundleId: string | null = null;
  private nativePaste: ((target: PasteTarget) => Promise<boolean>) | null = null;

  public setNativePaste(fn: (target: PasteTarget) => Promise<boolean>) {
    this.nativePaste = fn;
  }

  public setFrontmostApp(name: string | null, pid?: number, bundleId?: string | null) {
    const trimmed = name?.trim() || '';
    if (trimmed === 'OpenHandy' || trimmed === 'Electron') return;
    if (trimmed) this.lastActiveApp = trimmed;
    if (pid && pid > 0) this.lastPid = pid;
    if (bundleId && bundleId.trim()) this.lastBundleId = bundleId.trim();
  }

  /**
   * Captures the name of the currently focused macOS application
   */
  public async captureFrontmostApp(): Promise<string | null> {
    try {
      const script = `tell application "System Events" to get name of first application process whose frontmost is true`;
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const appName = stdout.trim();
      this.lastActiveApp = appName;
      return appName;
    } catch (e) {
      console.warn('Could not capture frontmost app:', e);
      return null;
    }
  }

  /**
   * Injects the text into the active application and manages clipboard behavior
   */
  public async pasteText(text: string, options: { autoPaste: boolean; copyToClipboard: boolean }): Promise<boolean> {
    if (!text || text.trim() === '') return false;

    const previousClipboard = options.copyToClipboard ? null : clipboard.readText();

    try {
      // 1. Put the text onto clipboard for the paste operation
      clipboard.writeText(text);

      if (options.autoPaste) {
        if (this.nativePaste) {
          const pasted = await this.nativePaste({
            app: this.lastActiveApp,
            pid: this.lastPid,
            bundleId: this.lastBundleId,
            text,
          });
          if (pasted) {
            if (!options.copyToClipboard && previousClipboard !== null) {
              setTimeout(() => {
                try { clipboard.writeText(previousClipboard); } catch { /* ignore */ }
              }, 350);
            }
            return true;
          }
        }

        return false;
      }

      return true;
    } catch (err) {
      console.error('Failed to paste text via AppleScript:', err);
      return false;
    }
  }

  /**
   * Checks if macOS Accessibility permissions are granted for keystroke simulation
   */
  public async checkAccessibilityPermission(): Promise<boolean> {
    try {
      const { systemPreferences } = require('electron');
      return systemPreferences.isTrustedAccessibilityClient(false);
    } catch {
      return false;
    }
  }

  /**
   * Opens macOS System Settings directly to the Accessibility pane
   */
  public async openAccessibilitySettings(): Promise<void> {
    try {
      await execAsync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"');
    } catch (e) {
      console.error('Failed to open Accessibility settings', e);
    }
  }
}
