export interface ConsoleWarningOptions {
  /** Big red first line. Default "Stop". */
  title?: string
  heading?: string
  body?: string
  /** CSS color for the title and heading. Default #c1341f. */
  color?: string
  /** Stay quiet on localhost / 127.0.0.1 / *.localhost. Default true. */
  skipLocalhost?: boolean
}

export declare const DEFAULT_CONSOLE_WARNING: {
  title: string
  heading: string
  body: string
  color: string
}

/** Print the self-XSS "Stop" warning now (browser only). Returns whether it printed. */
export declare function printConsoleWarning(options?: ConsoleWarningOptions): boolean

/** The same warning as inline script source, for `<script dangerouslySetInnerHTML>`. */
export declare function consoleWarningScript(options?: ConsoleWarningOptions): string
