import * as React from 'react';
import { 
  AlertTriangle, 
  Activity, 
  CheckCircle2, 
  FileDown, 
  Search,
  ChevronDown,
  Info,
  Database,
  CloudRain,
  Thermometer
} from 'lucide-react';
import { 
  ComposedChart, 
  Line, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { format } from 'date-fns';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Anomaly, AnomalyType, cn } from '../lib/utils';
import { SiteInfoDetail } from '../lib/siteData';
import { WeatherDataPoint } from '../lib/weatherParser';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  anomalies: Anomaly[];
  totalRecords: number;
  siteInfo: SiteInfoDetail | null;
  nearestWeatherStation: { id: string; name: string; distance: number } | null;
  weatherChartData?: WeatherDataPoint[];
  onRedoAnalysis: () => void;
  aiReport: string | null;
  isGeneratingReport: boolean;
}

export function Dashboard({ 
  anomalies, 
  totalRecords, 
  siteInfo, 
  nearestWeatherStation,
  weatherChartData,
  onRedoAnalysis,
  aiReport,
  isGeneratingReport
}: DashboardProps) {
  const [activeTab, setActiveTab] = React.useState<AnomalyType>('CASE2_SUDDEN');

  const filteredAnomalies = anomalies.filter(a => a.type === activeTab);

  const stats = {
    case1: anomalies.filter(a => a.type === 'CASE1_ZERO').length,
    case2: anomalies.filter(a => a.type === 'CASE2_SUDDEN').length,
    case3: anomalies.filter(a => a.type === 'CASE3_MISSING').length,
    case4: anomalies.filter(a => a.type === 'CASE4_STATUS_MISMATCH').length,
  };

  const getTabLabel = (type: AnomalyType) => {
    switch(type) {
      case 'CASE1_ZERO': return `유량↑ 측정0 (${stats.case1})`;
      case 'CASE2_SUDDEN': return `점검·교정 급변 (${stats.case2})`;
      case 'CASE3_MISSING': return `미수신 및 0값 (${stats.case3})`;
      case 'CASE4_STATUS_MISMATCH': return `상태불일치 (${stats.case4})`;
    }
  };

  const getCaseDescription = (type: AnomalyType) => {
    switch(type) {
      case 'CASE1_ZERO': return '유량 발생 중 측정치가 0.0이고 상태가 장비정상인 사례';
      case 'CASE2_SUDDEN': return '점검/교정 전후로 이전 값 대비 급격한 변동 감지 (설정 임계값 기준)';
      case 'CASE3_MISSING': return '시간 자료당 5분 자료 누락(12건 미만) 또는 5분 자료 중 0값 포함';
      case 'CASE4_STATUS_MISMATCH': return '시간 자료는 정상이나 5분 자료에 오류 상태가 포함된 사례';
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-surface p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">분석 결과 리포트</h1>
          <p className="text-sm text-on-surface-variant">전체 대상 데이터: <span className="font-semibold text-primary">{totalRecords.toLocaleString()}</span> 건</p>
        </div>
        <Button onClick={onRedoAnalysis} variant="primary" className="gap-2">
          <Activity className="w-4 h-4" /> 분석 재실행
        </Button>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: '유량↑ 측정치0', value: stats.case1, color: 'text-on-surface', type: 'CASE1_ZERO' },
          { label: '점검·교정 급변', value: stats.case2, color: 'text-error', highlight: true, type: 'CASE2_SUDDEN' },
          { label: '5분 미수신 및 0값', value: stats.case3, color: 'text-error', type: 'CASE3_MISSING' },
          { label: '상태 정보 불일치', value: stats.case4, color: 'text-error', type: 'CASE4_STATUS_MISMATCH' },
        ].map((item, i) => (
          <Card 
            key={i} 
            className={cn(
              "border-b-4 cursor-pointer transition-all hover:scale-105", 
              activeTab === item.type ? "border-b-primary ring-2 ring-primary/20" : item.highlight ? "border-b-error" : "border-b-outline-variant"
            )}
            onClick={() => setActiveTab(item.type as AnomalyType)}
          >
            <CardContent className="p-4 pt-4 flex flex-col items-center justify-center">
              <span className="text-xs font-semibold text-on-surface-variant mb-1">{item.label}</span>
              <span className={cn("text-3xl font-bold", item.color)}>{item.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Site Info & Main Table */}
      <Card>
        <CardContent className="p-0">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                   {siteInfo?.name || '사업장 정보 없음'} ({siteInfo?.code || '사업장 코드'})
                  <ChevronDown className="w-4 h-4 text-on-surface-variant" />
                </h3>
                <p className="text-xs text-on-surface-variant">측정 정합성 분석 및 이상 패턴 감지 결과</p>
              </div>
            </div>
            {anomalies.length > 0 && (
              <span className="px-3 py-1 bg-error/10 text-error text-xs font-bold rounded-full">
                총 {anomalies.length}건 이상 포착
              </span>
            )}
          </div>

          {/* Table Tabs */}
          <div className="px-6 py-2 border-b border-border flex gap-8">
            {(['CASE1_ZERO', 'CASE2_SUDDEN', 'CASE3_MISSING', 'CASE4_STATUS_MISMATCH'] as AnomalyType[]).map(type => (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={cn(
                  "py-3 text-sm font-semibold transition-all border-b-2 -mb-px",
                  activeTab === type 
                    ? "border-primary text-primary" 
                    : "border-transparent text-on-surface-variant hover:text-on-surface"
                )}
              >
                {getTabLabel(type)}
              </button>
            ))}
          </div>

          {/* Info Banner */}
          <div className="px-6 py-4 bg-primary/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary font-medium text-sm">
              <Info className="w-4 h-4" />
              <span>{getCaseDescription(activeTab)}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase text-on-surface-variant block">이상 건수</span>
              <span className="text-xl font-bold">{filteredAnomalies.length}건</span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-container-low text-on-surface-variant font-medium">
                <tr>
                  <th className="px-6 py-3">방류구</th>
                  <th className="px-6 py-3">측정 항목</th>
                  <th className="px-6 py-3">측정 시간</th>
                  <th className="px-6 py-3">이전값</th>
                  <th className="px-6 py-3">현재값(대표값)</th>
                  <th className="px-6 py-3">{activeTab === 'CASE2_SUDDEN' ? '변화율' : '분석 내용'}</th>
                  <th className="px-6 py-3">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAnomalies.map((a, idx) => (
                  <tr key={idx} className="hover:bg-surface-container transition-colors">
                    <td className="px-6 py-4 font-medium">{a.dischargeNo}</td>
                    <td className="px-6 py-4">{a.param}</td>
                    <td className="px-6 py-4 text-on-surface-variant">{format(a.timestamp, 'yyyy-MM-dd HH:mm')}</td>
                    <td className="px-6 py-4 font-mono">{a.prevValue?.toFixed(4) || '-'}</td>
                    <td className="px-6 py-4 font-mono font-semibold">{a.value.toFixed(4)}</td>
                    <td className="px-6 py-4">
                      {a.type === 'CASE2_SUDDEN' && a.changeRate ? (
                        <span className="text-error font-bold">{a.changeRate.toFixed(1)}%</span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">{a.details || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                        a.status === '정상' || a.status === '장비정상' ? "bg-warning/20 text-warning" : "bg-error text-white"
                      )}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredAnomalies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant italic">
                      감지된 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-border flex justify-end">
            <Button variant="outline" size="sm" className="gap-2">
              <FileDown className="w-4 h-4" /> 엑셀 다운로드 (.xlsx)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Site Detail Information */}
      {siteInfo && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <h4 className="font-bold mb-4 text-primary flex items-center gap-2">
              <Database className="w-4 h-4" /> 사업장 등록 정보
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
              <div className="space-y-1">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">사업장코드</p>
                <p className="font-mono text-sm font-semibold">{siteInfo.code}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">사업장명</p>
                <p className="font-bold text-sm">{siteInfo.name}</p>
              </div>
              <div className="space-y-1 lg:col-span-1 md:col-span-2">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">주소</p>
                <p className="text-sm">{siteInfo.address}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">위도 (Latitude)</p>
                <p className="font-mono text-sm">{siteInfo.lat}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">경도 (Longitude)</p>
                <p className="font-mono text-sm">{siteInfo.lng}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-primary font-bold uppercase tracking-wider flex items-center gap-1">
                  <Info className="w-3 h-3" /> 인근 기상관측소
                </p>
                <p className="text-sm font-bold">
                  {nearestWeatherStation ? (
                    <span className="flex items-center gap-1">
                      {nearestWeatherStation.name} 
                      <span className="text-xs font-normal text-on-surface-variant">
                        ({nearestWeatherStation.distance.toFixed(2)}km)
                      </span>
                    </span>
                  ) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weather Chart Section */}
      {weatherChartData && weatherChartData.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="font-bold flex items-center gap-2">
                  <CloudRain className="w-4 h-4 text-primary" /> 인근 기상 실측 데이터
                </h4>
                <p className="text-xs text-on-surface-variant">가장 가까운 관측소({nearestWeatherStation?.name})의 측정값</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span>기온 (℃)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-secondary" />
                  <span>강수량 (mm)</span>
                </div>
              </div>
            </div>
            
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weatherChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis 
                    dataKey="time" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    yAxisId="left"
                    orientation="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#3B82F6' }}
                    label={{ value: '기온 (℃)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#3B82F6' }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    label={{ value: '강수량 (mm)', angle: 90, position: 'insideRight', offset: 10, fontSize: 10, fill: '#94A3B8' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    itemStyle={{ fontSize: '12px' }}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    content={() => null} // We have a custom legend above
                  />
                  <Bar 
                    yAxisId="right" 
                    dataKey="precip" 
                    name="강수량" 
                    fill="#94A3B8" 
                    radius={[2, 2, 0, 0]} 
                    barSize={20}
                  />
                  <Line 
                    yAxisId="left" 
                    type="monotone" 
                    dataKey="temp" 
                    name="기온" 
                    stroke="#3B82F6" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#3B82F6', strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom Section: AI Insights */}
      <div className="w-full">
        <Card className="min-h-[300px] relative overflow-hidden bg-surface-container-low">
          <CardContent className="p-6">
            <h4 className="font-bold mb-2 flex items-center gap-2">
               수질 TMS 운영 평가 리포트 (Gemini AI)
            </h4>
            {isGeneratingReport ? (
              <div className="space-y-3 mt-4">
                <div className="h-4 bg-surface-container-highest animate-pulse rounded w-3/4" />
                <div className="h-4 bg-surface-container-highest animate-pulse rounded w-1/2" />
                <div className="h-4 bg-surface-container-highest animate-pulse rounded w-5/6" />
                <div className="h-4 bg-surface-container-highest animate-pulse rounded w-2/3" />
              </div>
            ) : aiReport ? (
              <div className="text-2xl leading-relaxed text-on-surface-variant h-[220px] overflow-auto whitespace-pre-wrap mt-2 pr-2">
                {aiReport}
              </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center opacity-50">
                    <AlertTriangle className="w-12 h-12 mb-2 text-outline" />
                    <p className="text-sm">분석을 완료하면 AI 기반 진단 리포트가 여기에 표시됩니다.</p>
                </div>
            )}
            <p className="text-[10px] text-on-surface-variant mt-4 font-medium italic">※ AI 리포트는 참고용이며, 실제 점검 결과를 우선하십시오.</p>
          </CardContent>
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CheckCircle2 className="w-24 h-24 text-primary" />
          </div>
        </Card>
      </div>
    </div>
  );
}
