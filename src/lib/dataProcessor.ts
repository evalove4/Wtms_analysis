import * as XLSX from 'xlsx';
import { format, startOfHour } from 'date-fns';
import { TMSRecord, ValidationResult, Anomaly, AnomalyType } from './utils';

const MAIN_ITEMS = ['TOC', 'SS', 'T-N', 'T-P'];
const FLOW_ITEM = '적산유량';
const MAINT_STATES = ['점검중', '교정중'];
const NORMAL_5MIN = ['장비정상', '유량없음'];

export async function processFiles(
  hourlyFile: File | null,
  fiveMinFile: File | null,
  threshold: number
): Promise<ValidationResult & { anomalies: Anomaly[] }> {
  if (!hourlyFile || !fiveMinFile) {
    return { isValid: false, errors: ['두 종류의 파일을 모두 업로드해주세요.'], anomalies: [] };
  }

  try {
    const hourlyData = await parseExcel(hourlyFile);
    const fiveMinData = await parseExcel(fiveMinFile);

    const errors: string[] = [];

    // Validation (Prompt requirements)
    const hSite = hourlyData[0]?.siteName;
    const fSite = fiveMinData[0]?.siteName;
    const hDischarge = hourlyData[0]?.dischargeNo;
    const fDischarge = fiveMinData[0]?.dischargeNo;

    if (hSite !== fSite) {
      errors.push(`사업장 명칭이 일치하지 않습니다. (시간자료: ${hSite}, 5분자료: ${fSite})`);
    }
    if (hDischarge !== fDischarge) {
      errors.push(`방류구 번호가 일치하지 않습니다. (시간자료: ${hDischarge}, 5분자료: ${fDischarge})`);
    }

    // Sort by timestamp to ensure we check the actual start of the period correctly
    hourlyData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    fiveMinData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const hStart = startOfHour(hourlyData[0].timestamp);
    const fStart = startOfHour(fiveMinData[0].timestamp);

    if (hStart.getTime() !== fStart.getTime()) {
      errors.push(`측정 시작 시점이 일치하지 않습니다. (시간자료: ${format(hStart, 'yyyy-MM-dd HH시')}, 5분자료: ${format(fStart, 'yyyy-MM-dd HH시')})`);
    }

    const hParams = Object.keys(hourlyData[0].params).sort();
    const fParams = Object.keys(fiveMinData[0].params).sort();
    
    if (hParams.join(',') !== fParams.join(',')) {
      errors.push('시간 데이터와 5분 데이터의 측정 항목이 일치하지 않습니다.');
      errors.push(`(시간: ${hParams.join(', ')} / 5분: ${fParams.join(', ')})`);
    }

    if (errors.length > 0) {
      return { isValid: false, errors, anomalies: [] };
    }

    const anomalies: Anomaly[] = [];
    const currentMainItems = hParams.filter(p => p !== FLOW_ITEM && MAIN_ITEMS.includes(p));

    // --- CASE 1: Hourly Flow > 0 but Measured = 0 & Status = '장비정상' ---
    hourlyData.forEach(record => {
      const flow = record.params[FLOW_ITEM]?.measured || 0;
      if (flow > 0) {
        currentMainItems.forEach(param => {
          const val = record.params[param];
          if (val && val.measured === 0 && val.status === '장비정상') {
            anomalies.push({
              id: `case1-${record.timestamp.getTime()}-${param}`,
              type: 'CASE1_ZERO',
              param,
              timestamp: record.timestamp,
              value: 0,
              siteName: record.siteName,
              dischargeNo: record.dischargeNo,
              status: val.status,
              details: '유량 발생 중 측정치 0.0 (장비정상)'
            });
          }
        });
      }
    });

    // --- CASE 2: Sudden change before/after Maintenance/Calibration (Hourly based) ---
    // In Streamlit, this checks if a value changed drastically after a maintenance block
    currentMainItems.forEach(param => {
      let maintenanceBlock: TMSRecord[] = [];
      let lastNormalRecord: TMSRecord | null = null;

      hourlyData.forEach((record, index) => {
        const val = record.params[param];
        if (!val) return;

        const isMaint = MAINT_STATES.includes(val.status);
        const isNormal = val.status === '장비정상';

        if (isMaint) {
          maintenanceBlock.push(record);
        } else if (isNormal) {
          if (maintenanceBlock.length > 0 && lastNormalRecord) {
            // Check first value after block
            const prevVal = lastNormalRecord.params[param].measured;
            const currentVal = val.measured;
            
            if (prevVal > 0) {
              const diff = Math.abs(currentVal - prevVal);
              const rate = (diff / prevVal) * 100;
              
              if (rate >= threshold) {
                anomalies.push({
                  id: `case2-${record.timestamp.getTime()}-${param}`,
                  type: 'CASE2_SUDDEN',
                  param,
                  timestamp: record.timestamp,
                  value: currentVal,
                  prevValue: prevVal,
                  changeRate: rate,
                  siteName: record.siteName,
                  dischargeNo: record.dischargeNo,
                  status: val.status,
                  details: `점검/교정 전후 급변 (${maintenanceBlock.length}시간 지속)`
                });
              }
            }
          }
          lastNormalRecord = record;
          maintenanceBlock = [];
        }
      });
    });

    // --- CASE 3 & 4: Link 5-min data to Hourly ---
    const fiveMinByHour: Record<string, TMSRecord[]> = {};
    fiveMinData.forEach(f => {
      // Use formatted local time string + site + orifice as key for robust matching
      const hKey = `${f.siteName}_${f.dischargeNo}_${format(f.timestamp, 'yyyyMMddHH')}`;
      if (!fiveMinByHour[hKey]) fiveMinByHour[hKey] = [];
      fiveMinByHour[hKey].push(f);
    });

    hourlyData.forEach(hRecord => {
      // Match using the same robust key
      const hKey = `${hRecord.siteName}_${hRecord.dischargeNo}_${format(hRecord.timestamp, 'yyyyMMddHH')}`;
      const matched = fiveMinByHour[hKey] || [];

      currentMainItems.forEach(param => {
        const hVal = hRecord.params[param];
        if (!hVal) return;

        // CASE 3: Missing Reception (Count < 12)
        if (matched.length < 12) {
          anomalies.push({
            id: `case3-missing-${hRecord.timestamp.getTime()}-${param}-${hRecord.dischargeNo}`,
            type: 'CASE3_MISSING',
            param,
            timestamp: hRecord.timestamp,
            value: hVal.measured,
            siteName: hRecord.siteName,
            dischargeNo: hRecord.dischargeNo,
            status: hVal.status,
            count: matched.length,
            details: `5분 자료 미수신 (${matched.length}/12건)`
          });
        }

        // CASE 3 Part 2: 5-min Measured=0 while Hour is Normal
        if (hVal.status === '장비정상') {
          const zeroRecords = matched.filter(f => f.params[param]?.measured === 0 && f.params[param]?.status === '장비정상');
          if (zeroRecords.length > 0) {
            anomalies.push({
              id: `case3-zero-${hRecord.timestamp.getTime()}-${param}-${hRecord.dischargeNo}`,
              type: 'CASE3_MISSING',
              param,
              timestamp: hRecord.timestamp,
              value: 0,
              siteName: hRecord.siteName,
              dischargeNo: hRecord.dischargeNo,
              status: '5분0값포함',
              count: zeroRecords.length,
              details: `정상 시간대 중 5분 측정치 0값 (${zeroRecords.length}건)`
            });
          }
        }

        // CASE 4: Status Mismatch (Hour=Normal, but 5-min has abnormal status)
        if (hVal.status === '장비정상') {
          const abnormal = matched.filter(f => {
             const s = f.params[param]?.status;
             return s && !NORMAL_5MIN.includes(s);
          });
          if (abnormal.length > 0) {
            const statusCounts = abnormal.reduce((acc, curr) => {
                const s = curr.params[param].status;
                acc[s] = (acc[s] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            anomalies.push({
              id: `case4-status-${hRecord.timestamp.getTime()}-${param}-${hRecord.dischargeNo}`,
              type: 'CASE4_STATUS_MISMATCH',
              param,
              timestamp: hRecord.timestamp,
              value: hVal.measured,
              siteName: hRecord.siteName,
              dischargeNo: hRecord.dischargeNo,
              status: '상태상이',
              details: `상태정보 불일치: ${Object.entries(statusCounts).map(([s, n]) => `${s}(${n}건)`).join(', ')}`
            });
          }
        }
      });
    });

    return {
      isValid: true,
      errors: [],
      hourlyData,
      fiveMinData,
      anomalies
    };
  } catch (err) {
    console.error(err);
    return { isValid: false, errors: ['파일 처리 중 오류가 발생했습니다. 규격에 맞는 엑셀 파일인지 확인해 주세요.'], anomalies: [] };
  }
}

function parseDateTime(dateVal: any, timeVal: any): Date {
  let date: Date;
  
  if (typeof dateVal === 'number') {
    // Excel serial date (0 is 1900-01-01)
    // 25569 is 1970-01-01
    date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
  } else {
    // String like "2024/05/17" or "24-05-17"
    const cleanedDate = String(dateVal).trim().replace(/-/g, '/');
    date = new Date(cleanedDate);
  }

  const timeStr = String(timeVal || '00시').trim();
  const hourMatch = timeStr.match(/^(\d+)시/);
  const minMatch = timeStr.match(/시\s*(\d+)분/);

  let hour = hourMatch ? parseInt(hourMatch[1]) : 0;
  const min = minMatch ? parseInt(minMatch[1]) : 0;

  if (hour === 24) {
    date.setDate(date.getDate() + 1);
    hour = 0;
  }

  // Use local time set components
  const timestamp = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, min, 0, 0);
  return timestamp;
}

async function parseExcel(file: File): Promise<TMSRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1 });

        if (rows.length < 4) {
           reject(new Error('데이터가 부족합니다. (최소 4행 이상)'));
           return;
        }

        const siteNameFromHeader = String(rows[0][0] || '').trim();
        const headers = rows[1] as string[];
        const itemPositions: number[] = [];
        headers.forEach((h, i) => {
          if (i >= 3 && h && h.trim() !== '') {
            itemPositions.push(i);
          }
        });

        const records: TMSRecord[] = [];

        for (let i = 3; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 3 || !row[1]) continue;

          const dischargeNo = String(row[0] || '').trim();
          const timestamp = parseDateTime(row[1], row[2]);
          const params: TMSRecord['params'] = {};

          itemPositions.forEach(pos => {
            const rawName = headers[pos].split('(')[0].trim();
            if (pos + 2 < row.length) {
                params[rawName] = {
                    standard: Number(row[pos] || 0),
                    measured: Number(row[pos + 1] || 0),
                    status: String(row[pos + 2] || '').trim()
                };
            }
          });

          records.push({
            siteName: siteNameFromHeader,
            dischargeNo,
            timestamp,
            params
          });
        }
        resolve(records);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
}
