/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { 
  BarChart3, 
  Settings, 
  ChevronLeft, 
  Play, 
  AlertCircle,
  Database,
  Layers,
  History
} from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { Dashboard } from './components/Dashboard';
import { Button } from './components/ui/Button';
import { processFiles } from './lib/dataProcessor';
import { Anomaly } from './lib/utils';
import { getSiteDetail, SiteInfoDetail } from './lib/siteData';
import { findNearestWeatherStation } from './lib/weatherStations';
import { parseWeatherResponse } from './lib/weatherParser';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [hourlyFile, setHourlyFile] = React.useState<File | null>(null);
  const [fiveMinFile, setFiveMinFile] = React.useState<File | null>(null);
  const [threshold, setThreshold] = React.useState(30);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = React.useState(false);
  
  const [anomalies, setAnomalies] = React.useState<Anomaly[]>([]);
  const [totalRecords, setTotalRecords] = React.useState(0);
  const [siteInfo, setSiteInfo] = React.useState<SiteInfoDetail | null>(null);
  const [nearestWeatherStation, setNearestWeatherStation] = React.useState<{ id: string; name: string; distance: number } | null>(null);
  const [weatherChartData, setWeatherChartData] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [aiReport, setAiReport] = React.useState<string | null>(null);

  const handleReset = () => {
    setHourlyFile(null);
    setFiveMinFile(null);
    setAnomalies([]);
    setTotalRecords(0);
    setSiteInfo(null);
    setNearestWeatherStation(null);
    setWeatherChartData([]);
    setError(null);
    setAiReport(null);
  };

  const handleRunAnalysis = async () => {
    if (!hourlyFile || !fiveMinFile) {
      setError('시간 자료와 5분 자료를 모두 업로드해 주세요.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setAiReport(null);

    const result = await processFiles(hourlyFile, fiveMinFile, threshold);
    
    if (!result.isValid) {
      setError(result.errors.join(' '));
      setIsProcessing(false);
      // Reset analysis results
      setAnomalies([]);
      setTotalRecords(0);
      setSiteInfo(null);
      setAiReport(null);
      return;
    }

    const sortedAnomalies = [...result.anomalies].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    setAnomalies(sortedAnomalies);
    setTotalRecords((result.hourlyData?.length || 0) + (result.fiveMinData?.length || 0));
    
    const siteName = result.hourlyData?.[0].siteName || '';
    const detail = getSiteDetail(siteName);
    let finalSiteInfo: SiteInfoDetail | null = null;

    if (detail) {
      finalSiteInfo = detail;
    } else {
      finalSiteInfo = { 
        name: siteName, 
        code: result.hourlyData?.[0].dischargeNo || '-',
        address: '-',
        lat: '-',
        lng: '-'
      };
    }

    setSiteInfo(finalSiteInfo);

    const siteInfoToUse = finalSiteInfo;
    if (siteInfoToUse && siteInfoToUse.lat !== '-' && siteInfoToUse.lng !== '-') {
      const nearest = findNearestWeatherStation(parseFloat(siteInfoToUse.lat), parseFloat(siteInfoToUse.lng));
      if (nearest) {
        setNearestWeatherStation({
          id: nearest.station.id,
          name: nearest.station.name,
          distance: nearest.distance
        });

        // Fetch Weather Data
        if (result.hourlyData && result.hourlyData.length > 0) {
          const sorted = [...result.hourlyData].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          const start = sorted[0].timestamp;
          const end = sorted[sorted.length - 1].timestamp;

          const formatDateForKma = (date: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}00`;
          };

          const tm1 = formatDateForKma(start);
          const tm2 = formatDateForKma(end);
          const stn = nearest.station.id;

          try {
            const resp = await fetch(`/api/weather?tm1=${tm1}&tm2=${tm2}&stn=${stn}`);
            const text = await resp.text();
            const weatherData = parseWeatherResponse(text);
            setWeatherChartData(weatherData);
          } catch (err) {
            console.error('Failed to fetch weather for chart:', err);
          }
        }
      }
    }
    
    setIsProcessing(false);

    // Generate AI Report
    generateAiReport(result.anomalies);
  };

  const generateAiReport = async (foundAnomalies: Anomaly[]) => {
    setIsGeneratingReport(true);
    try {
      const response = await fetch('/api/analyze-integrity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anomalies: foundAnomalies,
          weatherData: weatherChartData,
          summary: {
            totalAnomalies: foundAnomalies.length,
            suddenChanges: foundAnomalies.filter(a => a.type === 'CASE2_SUDDEN').length,
            zeroValues: foundAnomalies.filter(a => a.type === 'CASE1_ZERO').length,
            missingData: foundAnomalies.filter(a => a.type === 'CASE3_MISSING').length,
            abnormalStatuses: foundAnomalies.filter(a => a.type === 'CASE4_STATUS_MISMATCH').length,
          }
        })
      });
      const data = await response.json();
      setAiReport(data.report);
    } catch (err) {
      console.error(err);
      setAiReport('AI 리포트를 생성하는 중 오류가 발생했습니다.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="flex h-screen bg-surface font-sans text-on-surface overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[320px] bg-white border-r border-border flex flex-col z-10 shadow-xl overflow-y-auto">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <div className="bg-primary/10 p-1.5 rounded-lg">
              <BarChart3 className="w-6 h-6" />
            </div>
            <span className="font-bold text-lg tracking-tight">수질 TMS 분석 지원</span>
          </div>
          <button 
            onClick={handleReset}
            className="text-on-surface-variant hover:text-on-surface transition-colors"
            title="초기화"
          >
            <History className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-6 space-y-8">
          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-primary">조회 조건</h2>
                <ChevronLeft className="w-5 h-5 text-outline" />
             </div>
             <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">필터 설정</p>
          </div>

          <div className="space-y-6">
            <FileUploader 
              id="hourly-upload"
              label="시간 자료 업로드 (CSV/Excel)"
              selectedFile={hourlyFile}
              onFileSelect={setHourlyFile}
            />
            
            <FileUploader 
              id="fivemin-upload"
              label="5분 자료 업로드 (CSV/Excel)"
              selectedFile={fiveMinFile}
              onFileSelect={setFiveMinFile}
            />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                <Settings className="w-4 h-4" />
                점검 전후 측정값 급변 임계값 설정
              </div>
              <div className="px-1">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-on-surface-variant mt-2 font-bold px-1">
                  <span>0%</span>
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">{threshold}%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-error/10 border border-error/20 rounded-lg flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
              <p className="text-xs text-error font-medium leading-relaxed">{error}</p>
            </motion.div>
          )}
        </div>

        <div className="p-6 border-t border-border">
          <Button 
            onClick={handleRunAnalysis}
            disabled={isProcessing || !hourlyFile || !fiveMinFile}
            className="w-full gap-2 h-12"
          >
            <Play className="w-4 h-4 fill-white" /> {isProcessing ? '분석 중...' : '분석 실행'}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <Dashboard 
          anomalies={anomalies}
          totalRecords={totalRecords}
          siteInfo={siteInfo}
          nearestWeatherStation={nearestWeatherStation}
          weatherChartData={weatherChartData}
          onRedoAnalysis={handleRunAnalysis}
          aiReport={aiReport}
          isGeneratingReport={isGeneratingReport}
        />

        {/* Global Loading Overlay */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center"
            >
              <div className="bg-white p-8 rounded-2xl shadow-2xl border border-border flex flex-col items-center gap-4">
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <div className="text-center space-y-1">
                  <p className="font-bold text-lg">데이터 분석 엔진 가동 중</p>
                  <p className="text-sm text-on-surface-variant">측정값 정합성 및 패턴 분석을 수행하고 있습니다...</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Nav / Decorative */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-2 bg-white/80 backdrop-blur rounded-full border border-border shadow-soft hidden md:flex">
           <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Database className="w-3.5 h-3.5" /> 
              <span>Data Engine Active</span>
           </div>
           <div className="w-[1px] h-4 bg-outline-variant" />
           <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
              <Layers className="w-3.5 h-3.5" />
              <span>Version 2.4.0-TMS</span>
           </div>
        </div>
      </main>
    </div>
  );
}
