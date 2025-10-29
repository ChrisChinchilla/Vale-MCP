/**
 * Vale issue severity levels
 */
export type ValeSeverity = "error" | "warning" | "suggestion";

/**
 * A single Vale linting issue
 */
export interface ValeIssue {
  Line: number;
  Span: [number, number];
  Check: string;
  Message: string;
  Severity: ValeSeverity;
  Link?: string;
  Match?: string;
  Action?: {
    Name: string;
    Params: string[];
  };
}

/**
 * Vale's raw JSON output structure (uses file paths as keys)
 */
export interface ValeRawOutput {
  [filePath: string]: ValeIssue[];
}

/**
 * Normalized Vale issue for MCP output
 */
export interface NormalizedValeIssue {
  line: number;
  span: [number, number];
  check: string;
  message: string;
  severity: ValeSeverity;
  link?: string;
  match?: string;
}

/**
 * Summary statistics for Vale results
 */
export interface ValeSummary {
  total: number;
  errors: number;
  warnings: number;
  suggestions: number;
}

/**
 * Result structure for check_file tool
 */
export interface CheckFileResult {
  formatted: string;
  file: string;
  issues: NormalizedValeIssue[];
  summary: ValeSummary;
}

/**
 * Server configuration options
 */
export interface ValeServerConfig {
  configPath?: string;
}

/**
 * Error result structure
 */
export interface ValeError {
  error: string;
  details?: string;
}

