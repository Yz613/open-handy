import { clipboard } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PasteTarget {
  app: string | null;
  pid: number;
  bundleId: string | null;
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

        // 2. Reactivate the previously active app if known
        if (this.lastActiveApp && this.lastActiveApp !== 'OpenHandy' && this.lastActiveApp !== 'Electron') {
          try {
            const escaped = this.lastActiveApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            await execAsync(`osascript -e 'tell application "${escaped}" to activate'`);
            await new Promise(res => setTimeout(res, 180));
          } catch (appErr) {
            console.warn(`Could not activate app ${this.lastActiveApp}`, appErr);
          }
        }

        // 3. Synthesize Command + V keystroke via System Events
        const pasteScript = `tell application "System Events" to keystroke "v" using command down`;
        await execAsync(`osascript -e '${pasteScript}'`);

        // 4. If copyToClipboard was false, restore the previous clipboard after a short delay
        if (!options.copyToClipboard && previousClipboard !== null) {
          setTimeout(() => {
            try {
              clipboard.writeText(previousClipboard);
            } catch (e) {
              console.warn('Failed to restore previous clipboard', e);
            }
          }, 350);
        }

        return true;
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
      const script = `tell application "System Events" to get name of first application process whose frontmost is true`;
      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (err: any) {
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
