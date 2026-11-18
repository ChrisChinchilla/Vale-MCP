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
  /** Vale's suggested fix, when the rule has one (e.g. name "replace", params are the candidates) */
  action?: { name: string; params: string[] };
  /** Source file, set for directory checks */
  file?: string;
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
 * Optional result filtering shared by the check tools
 */
export interface CheckOptions {
  /** Drop issues below this severity */
  minSeverity?: ValeSeverity;
  /** Return at most this many issues (summary still counts all filtered issues) */
  maxIssues?: number;
}

/**
 * Result structure for check_file tool
 */
export interface CheckFileResult {
  formatted: string;
  file: string;
  issues: NormalizedValeIssue[];
  summary: ValeSummary;
  /** True when maxIssues cut off issues; summary.total is the untruncated count */
  truncated?: boolean;
}

/**
 * Where a rule applies in the active config (one entry per [glob] section)
 */
export interface RuleSection {
  glob: string;
  enabled: boolean;
  /** Effective level: the config's override, else the rule's own */
  level?: string;
}

/**
 * A Vale rule discovered in a style on the StylesPath
 */
export interface RuleInfo {
  /** "Style.Rule" */
  name: string;
  style: string;
  /** Vale check type, e.g. existence, substitution */
  extends?: string;
  level?: string;
  message?: string;
  description?: string;
  link?: string;
  sections: RuleSection[];
  /** True for Vale's built-in rules, which have no file on disk */
  builtin?: boolean;
}

export interface ExplainRuleResult {
  rule: RuleInfo;
  /** Absent for built-in rules */
  file?: string;
  /** The rule's YAML source; absent for built-in rules */
  definition?: string;
}

export interface ListRulesResult {
  rules: RuleInfo[];
  /** Rules found before max_rules was applied */
  total: number;
  truncated: boolean;
}

/**
 * Details of the Vale setup the server is using
 */
export interface ValeSetupInfo {
  configPath?: string;
  /** Packages declared in the config's Packages line */
  packages: string[];
  /** Style directories found on the StylesPath */
  installedStyles: string[];
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

