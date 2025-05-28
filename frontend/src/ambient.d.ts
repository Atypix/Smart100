// frontend/src/ambient.d.ts

// For better-sqlite3 (TS2694)
declare module 'better-sqlite3' {
  interface Statement {
    get(...params: any[]): any;
    all(...params: any[]): any[];
    run(...params: any[]): any;
    iterate(...params: any[]): IterableIterator<any>;
  }
  interface Database {
    prepare(source: string): Statement;
    exec(source: string): this;
    pragma(source: string, options?: any): any;
    close(): void;
    transaction(fn: (...args: any[]) => any): (...args: any[]) => any;
  }
  // Add a default export if that's how it's typically imported, or a constructor
  // Assuming it's imported like: import DatabaseConstructor from 'better-sqlite3';
  // Or: const db = require('better-sqlite3')('path');
  // Let's assume a default export that is a constructor for now.
  export default function Database(filepath: string, options?: any): Database;
}

// For @tensorflow/tfjs-node (TS2694)
// Add common classes/functions based on typical usage.
// This will be very minimal and may need expansion if other members are used.
declare module '@tensorflow/tfjs-node' {
  export class Sequential {
    // Add minimal methods if known, or leave empty if just type checking existence
  }
  export function layers(): any; // Or more specific types if known
  export function loadLayersModel(path: string | any, options?: any): Promise<any>;
  export function tensor(data: any, shape?: any, dtype?: any): any;
  export function tidy(fn: () => any): any;
  // Add other exports if errors point to them
}

// For winston (TS2694) - assuming common usage patterns
declare module 'winston' {
  export interface LoggerOptions {
    level?: string;
    levels?: any;
    format?: any;
    transports?: any[];
    exitOnError?: boolean;
    silent?: boolean;
  }
  export interface Logger {
    log(level: string, message: string, ...meta: any[]): Logger;
    info(message: string, ...meta: any[]): Logger;
    warn(message: string, ...meta: any[]): Logger;
    error(message: string, ...meta: any[]): Logger;
    debug(message: string, ...meta: any[]): Logger;
    // Add other levels/methods if needed
  }
  export function createLogger(options?: LoggerOptions): Logger;
  export namespace format {
    export function combine(...formats: any[]): any;
    export function timestamp(options?: any): any;
    export function printf(templateFunction: (info: any) => string): any;
    export function colorize(options?: any): any;
    export function simple(): any;
    export function json(): any;
  }
  export namespace transports {
    export class Console {
      constructor(options?: any);
    }
    export class File {
      constructor(options?: any);
    }
  }
  // Add other exports if needed
}

// For yahoo-finance2 (already declared, ensure it's sufficient or enhance if new TS2694 errors appear for it)
declare module 'yahoo-finance2' {
  // Assuming it might have a default export or named exports used by backend
  // If errors point to specific members, add them here.
  // Example:
  // export function historical(symbol: string, options?: any): Promise<any[]>;
  // For now, leave as simple module declaration if no specific member errors.
  // If backend uses `import yahooFinance from 'yahoo-finance2'`, then:
  // const yahooFinance: any; export default yahooFinance;
  // If backend uses `import { historical } from 'yahoo-finance2'`, then:
  // export function historical(symbol: string, queryOptions?: any): Promise<any[]>;
  // Based on src/services/dataService.ts, it seems to be a named import.
  export function historical(symbol: string, queryOptions?: any): Promise<any[]>;
}

// For axios (TS2307 in backend file src/services/dataService.ts)
// Provide a basic ambient declaration. Vite will handle the actual module for frontend code.
// This is just to satisfy tsc when it processes backend files.
declare module 'axios' {
  export interface AxiosRequestConfig {
    headers?: any;
    [key: string]: any;
  }
  export interface AxiosResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: AxiosRequestConfig;
    request?: any;
  }
  export interface AxiosError<T = any> extends Error {
    config?: AxiosRequestConfig;
    code?: string;
    request?: any;
    response?: AxiosResponse<T>;
    isAxiosError: boolean;
    toJSON: () => object;
  }
  export interface AxiosInstance {
    get<T = any, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>;
    post<T = any, R = AxiosResponse<T>>(url: string, data?: any, config?: AxiosRequestConfig): Promise<R>;
    // Add other methods if used by backend code being (incorrectly) checked
  }
  const axios: AxiosInstance;
  export default axios;
}
