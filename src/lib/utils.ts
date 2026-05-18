import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TMSRecord {
  siteName: string;
  dischargeNo: string;
  timestamp: Date;
  params: {
    [key: string]: {
      standard: number;
      measured: number;
      status: string;
    };
  };
}

export type AnomalyType = 'CASE1_ZERO' | 'CASE2_SUDDEN' | 'CASE3_MISSING' | 'CASE4_STATUS_MISMATCH';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  param: string;
  timestamp: Date;
  value: number;
  prevValue?: number;
  changeRate?: number;
  siteName: string;
  dischargeNo: string;
  status: string;
  details?: string; // For Case 3, Case 4 specific info
  count?: number; // For missing record counts
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  hourlyData?: TMSRecord[];
  fiveMinData?: TMSRecord[];
}
