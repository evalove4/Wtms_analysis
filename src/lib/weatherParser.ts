/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WeatherDataPoint {
  time: string;
  temp: number | null;
  precip: number | null;
}

export function parseWeatherResponse(csvText: string): WeatherDataPoint[] {
  const lines = csvText.trim().split('\n');
  const data: WeatherDataPoint[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 16) continue;

    const tm = parts[0]; // YYYYMMDDHHmm
    const ta = parseFloat(parts[11]);
    const rn = parseFloat(parts[15]);

    // Format time for display (HH시)
    const year = tm.substring(0, 4);
    const month = tm.substring(4, 6);
    const day = tm.substring(6, 8);
    const hour = tm.substring(8, 10);
    
    data.push({
      time: `${hour}시`,
      temp: isNaN(ta) || ta === -99.9 ? null : ta,
      precip: isNaN(rn) || rn === -9.9 || rn < 0 ? 0 : rn // RN can be -9.9 for no data or something
    });
  }

  return data;
}
