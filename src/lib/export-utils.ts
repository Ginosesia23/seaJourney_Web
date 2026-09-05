/**
 * Export utilities for sea time data
 * Supports CSV, Excel XML, JSON, and PDF formats
 */

import type { SeaTimeReportData } from '@/app/actions';
import { format, parse, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { calendarStateExcelSolidArgb } from '@/lib/calendar-state-colors';
import { calculateStandbyDays } from './standby-calculation';

/** Blend AARRGGBB fill toward white (simulates translucent color on white, like calendar washes). */
function mixArgbTowardWhite(argb: string, colorWeight: number): string {
  if (!argb || argb.length !== 8) return argb;
  const r = parseInt(argb.slice(2, 4), 16);
  const g = parseInt(argb.slice(4, 6), 16);
  const b = parseInt(argb.slice(6, 8), 16);
  const w = Math.max(0, Math.min(1, colorWeight));
  const mix = (c: number) => Math.round(c * w + 255 * (1 - w));
  const nr = mix(r);
  const ng = mix(g);
  const nb = mix(b);
  return `FF${[nr, ng, nb]
    .map((x) => x.toString(16).padStart(2, '0').toUpperCase())
    .join('')}`;
}

/** Readable label color on a solid fill (light pastel → dark text). */
function fontArgbForFill(fillArgb: string): string {
  const r = parseInt(fillArgb.slice(2, 4), 16) / 255;
  const g = parseInt(fillArgb.slice(4, 6), 16) / 255;
  const b = parseInt(fillArgb.slice(6, 8), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? 'FF0F172A' : 'FFFFFFFF';
}

/**
 * Export sea time data to CSV format
 * Includes summary section and detailed daily logs section (if state logs are available)
 */
export function exportToCSV(data: SeaTimeReportData): void {
  const csvSections: string[] = [];

  // Summary Section
  const summaryHeaders = [
    'Vessel Name',
    'Start Date',
    'End Date',
    'Total Days',
    'At Sea Days',
    'Standby Days',
    'Yard Days',
    'Leave Days',
  ];

  const summaryRows = data.serviceRecords.map(record => [
    record.vesselName,
    record.start_date,
    record.end_date,
    record.totalDays.toString(),
    record.at_sea_days?.toString() || '0',
    record.standby_days?.toString() || '0',
    record.yard_days?.toString() || '0',
    record.leave_days?.toString() || '0',
  ]);

  // Add summary row
  summaryRows.push([
    'TOTAL',
    '',
    '',
    data.totalDays.toString(),
    data.totalSeaDays.toString(),
    data.totalStandbyDays.toString(),
    '',
    '',
  ]);

  csvSections.push('=== SUMMARY ===');
  csvSections.push(summaryHeaders.join(','));
  csvSections.push(...summaryRows.map(row => row.map(cell => `"${cell}"`).join(',')));

  // Detailed Daily Logs Section (if state logs are available)
  if (data.stateLogs && data.stateLogs.length > 0) {
    csvSections.push('');
    csvSections.push('=== DETAILED DAILY LOGS ===');
    
    // Create vessel name map
    const vesselNameMap = new Map<string, string>();
    data.serviceRecords.forEach(record => {
      if (record.vesselId && !vesselNameMap.has(record.vesselId)) {
        vesselNameMap.set(record.vesselId, record.vesselName);
      }
    });

    const detailedHeaders = [
      'Date',
      'Day',
      'Vessel',
      'State',
      'Part of Passage',
      'On Watch',
      'Standby',
      'Notes',
    ];

    const watchDates = data.watchDates ? new Set(data.watchDates) : new Set<string>();
    
    // Calculate standby dates
    const partOfActivePassageDates = new Set<string>();
    data.stateLogs.forEach(log => {
      if (log.isPartOfActivePassage) {
        partOfActivePassageDates.add(log.date);
      }
    });
    
    const vesselManagerSeaTime = data.userProfile?.role === 'vessel';
    const { standbyPeriods } = calculateStandbyDays(data.stateLogs.filter(log => !!log.state), watchDates, partOfActivePassageDates, {
      vesselManagerSeaTime,
    });
    const standbyDates = new Set<string>();
    standbyPeriods.forEach(period => {
      const periodDays = eachDayOfInterval({ start: period.startDate, end: period.endDate });
      const daysInPeriod = periodDays.length;
      const countedDays = Math.min(period.countedDays || period.days, daysInPeriod);
      periodDays.slice(0, countedDays).forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        standbyDates.add(dateStr);
      });
    });

    // Use the formatState helper function defined later in this file

    const detailedRows = data.stateLogs.map(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      const dateStr = format(logDate, 'yyyy-MM-dd');
      const dayStr = format(logDate, 'EEE');
      const vesselName = log.vesselId ? (vesselNameMap.get(log.vesselId) || 'Unknown Vessel') : '—';
      const stateDisplay = formatState(log.state);
      const partOfPassage = log.isPartOfActivePassage ? 'Yes' : 'No';
      const onWatch = watchDates.has(dateStr) ? 'Yes' : 'No';
      const isStandby = standbyDates.has(dateStr) ? 'Yes' : 'No';
      const notes = log.notes || '';

      return [
        dateStr,
        dayStr,
        vesselName,
        stateDisplay,
        partOfPassage,
        onWatch,
        isStandby,
        notes,
      ];
    });

    csvSections.push(detailedHeaders.join(','));
    csvSections.push(...detailedRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')));
  }

  const csvContent = csvSections.join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `sea-time-export-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export sea time data to Excel format (.xlsx)
 * Creates separate sheets for each month with detailed daily state information
 * Includes color coding and table formatting
 */
export async function exportToExcelXML(data: SeaTimeReportData): Promise<void> {
  // If we don't have state logs, fall back to the old format
  if (!data.stateLogs || data.stateLogs.length === 0) {
    exportToExcelXMLLegacy(data);
    return;
  }

  const stateLogs = data.stateLogs;
  const watchDates = data.watchDates ? new Set(data.watchDates) : new Set<string>();
  
  // Create a map of vessel IDs to vessel names from service records
  const vesselNameMap = new Map<string, string>();
  data.serviceRecords.forEach(record => {
    if (record.vesselId && !vesselNameMap.has(record.vesselId)) {
      vesselNameMap.set(record.vesselId, record.vesselName);
    }
  });
  
  // Create a map of logs by date for quick lookup
  const logsByDate = new Map<string, typeof stateLogs[0]>();
  stateLogs.forEach(log => {
    logsByDate.set(log.date, log);
  });

  // Group logs by month
  const logsByMonth = new Map<string, typeof stateLogs>();
  stateLogs.forEach(log => {
    const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
    const monthKey = format(logDate, 'yyyy-MM'); // e.g., "2024-01"
    if (!logsByMonth.has(monthKey)) {
      logsByMonth.set(monthKey, []);
    }
    logsByMonth.get(monthKey)!.push(log);
  });

  // Sort months chronologically
  const sortedMonths = Array.from(logsByMonth.keys()).sort();

  // Create workbook with ExcelJS
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SeaJourney';
  workbook.created = new Date();

  // Calculate standby periods for the entire dataset (not just this month)
  const partOfActivePassageDates = new Set<string>();
  stateLogs.forEach(log => {
    if (log.isPartOfActivePassage) {
      partOfActivePassageDates.add(log.date);
    }
  });
  
  const vesselManagerSeaTime = data.userProfile?.role === 'vessel';
  const { standbyPeriods } = calculateStandbyDays(stateLogs.filter(log => !!log.state), watchDates, partOfActivePassageDates, {
    vesselManagerSeaTime,
  });
  const standbyDates = new Set<string>();
  
  // Create a map of which dates are actually counted as standby
  standbyPeriods.forEach(period => {
    const periodDays = eachDayOfInterval({ start: period.startDate, end: period.endDate });
    const daysInPeriod = periodDays.length;
    const countedDays = Math.min(period.countedDays || period.days, daysInPeriod);
    
    periodDays.slice(0, countedDays).forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      standbyDates.add(dateStr);
    });
  });

  /** "No" / neutral fill for indicator columns (Part of Passage, On Watch, Standby). */
  const indicatorNoArgb = 'FFFFF5F5';
  /**
   * Base hues match calendar strips (blue-600, yellow-400, standby #7629BB); blended toward white for softer cells.
   * @see src/app/dashboard/calendar/page.tsx
   */
  const passageYesFill = mixArgbTowardWhite('FF2563EB', 0.34);
  const watchYesFill = mixArgbTowardWhite('FFFACC15', 0.62);
  const standbyYesFill = mixArgbTowardWhite('FF7629BB', 0.32);
  /** State column: tinted like calendarStateWash-style chips on a white ground */
  const stateFillColorWeight = 0.38;

  // Create a sheet for each month
  for (const monthKey of sortedMonths) {
    const monthLogs = logsByMonth.get(monthKey)!;
    
    const firstLogDate = parse(monthLogs[0].date, 'yyyy-MM-dd', new Date());
    const monthStart = startOfMonth(firstLogDate);
    const monthEnd = endOfMonth(firstLogDate);
    
    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const sheetName = format(monthStart, 'MMM yyyy');
    const safeSheetName = sheetName.length > 31 ? monthKey : sheetName;
    const worksheet = workbook.addWorksheet(safeSheetName);

    // Set column widths
    worksheet.columns = [
      { width: 12 }, // Date
      { width: 8 },  // Day
      { width: 15 }, // State
      { width: 15 }, // Part of Passage
      { width: 10 }, // On Watch
      { width: 10 }, // Standby
      { width: 20 }, // Vessel
      { width: 30 }, // Notes
    ];

    // Define header style
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: 'FF4472C4' }, // Dark blue
      },
      alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
      border: {
        top: { style: 'thin' as const, color: { argb: 'FF000000' } },
        left: { style: 'thin' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
        right: { style: 'thin' as const, color: { argb: 'FF000000' } },
      },
    };

    // Add headers
    const headers = ['Date', 'Day', 'State', 'Part of Passage', 'On Watch', 'Standby', 'Vessel', 'Notes'];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell, colNumber) => {
      cell.style = headerStyle;
    });
    headerRow.height = 20;

    // Add data rows
    allDaysInMonth.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const log = logsByDate.get(dateStr);
      
      if (log) {
        const stateDisplay = formatState(log.state);
        const partOfPassage = log.isPartOfActivePassage ? 'Yes' : 'No';
        const onWatch = watchDates.has(dateStr) ? 'Yes' : 'No';
        const isStandby = standbyDates.has(dateStr) ? 'Yes' : 'No';
        const vesselName = log.vesselId ? (vesselNameMap.get(log.vesselId) || 'Unknown Vessel') : '—';
        const notes = log.notes || '';
        
        const row = worksheet.addRow([
          format(day, 'yyyy-MM-dd'),
          format(day, 'EEE'),
          stateDisplay,
          partOfPassage,
          onWatch,
          isStandby,
          vesselName,
          notes,
        ]);

        // Apply styling to each cell (all centered; tints mimic calendar washes on white)
        row.eachCell((cell, colNumber) => {
          const centered: ExcelJS.Alignment = {
            horizontal: 'center' as const,
            vertical: 'middle' as const,
          };

          // Default cell style with borders
          cell.style = {
            border: {
              top: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
              left: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
              bottom: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
              right: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
            },
            alignment: centered,
            font: { size: 10 },
          };

          // State column (column 3)
          if (colNumber === 3) {
            const solid = calendarStateExcelSolidArgb(log.state);
            const fillArgb = solid === 'FFFFFFFF' ? solid : mixArgbTowardWhite(solid, stateFillColorWeight);
            cell.fill = {
              type: 'pattern' as const,
              pattern: 'solid' as const,
              fgColor: { argb: fillArgb },
            };
            cell.font = {
              ...cell.font,
              bold: true,
              ...(fillArgb !== 'FFFFFFFF' ? { color: { argb: fontArgbForFill(fillArgb) } } : {}),
            };
          }

          // Part of Passage (column 4)
          if (colNumber === 4) {
            const yes = partOfPassage === 'Yes';
            const fillArgb = yes ? passageYesFill : indicatorNoArgb;
            cell.fill = {
              type: 'pattern' as const,
              pattern: 'solid' as const,
              fgColor: { argb: fillArgb },
            };
            cell.font = {
              ...cell.font,
              bold: yes,
              ...(yes ? { color: { argb: fontArgbForFill(fillArgb) } } : {}),
            };
          }

          // On Watch (column 5)
          if (colNumber === 5) {
            const yes = onWatch === 'Yes';
            const fillArgb = yes ? watchYesFill : indicatorNoArgb;
            cell.fill = {
              type: 'pattern' as const,
              pattern: 'solid' as const,
              fgColor: { argb: fillArgb },
            };
            cell.font = {
              ...cell.font,
              bold: yes,
              ...(yes ? { color: { argb: fontArgbForFill(fillArgb) } } : {}),
            };
          }

          // Standby (column 6)
          if (colNumber === 6) {
            const yes = isStandby === 'Yes';
            const fillArgb = yes ? standbyYesFill : indicatorNoArgb;
            cell.fill = {
              type: 'pattern' as const,
              pattern: 'solid' as const,
              fgColor: { argb: fillArgb },
            };
            cell.font = {
              ...cell.font,
              bold: yes,
              ...(yes ? { color: { argb: fontArgbForFill(fillArgb) } } : {}),
            };
          }

          // Notes (column 8): centered + wrap for long text
          if (colNumber === 8) {
            cell.alignment = {
              ...centered,
              wrapText: true,
            };
          }
        });

        // Adjust row height if there are notes (to accommodate wrapped text)
        if (log.notes && log.notes.length > 0) {
          // Estimate height based on note length (roughly 20 characters per line)
          const estimatedLines = Math.ceil(log.notes.length / 20);
          row.height = Math.max(18, estimatedLines * 15);
        } else {
          row.height = 18;
        }
      }
    });

    // Freeze header row
    worksheet.views = [{ state: 'frozen' as const, ySplit: 1 }];
  }

  // Generate Excel file buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Create blob and download
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `sea-time-detailed-export-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Helper function to format state for display
 */
function formatState(state: string): string {
  if (!state) return '—';
  const stateMap: Record<string, string> = {
    'underway': 'Underway',
    'in-port': 'Moored',
    'at-anchor': 'At Anchor',
    'on-leave': 'On Leave',
    'in-yard': 'In Yard',
  };
  return stateMap[state] || state;
}

/**
 * Legacy Excel export format (fallback when state logs are not available)
 */
function exportToExcelXMLLegacy(data: SeaTimeReportData): void {
  // Prepare data for Excel
  const headers = [
    'Vessel Name',
    'Start Date',
    'End Date',
    'Total Days',
    'At Sea Days',
    'Standby Days',
    'Yard Days',
    'Leave Days',
  ];

  // Group service records by vessel and sort chronologically
  const recordsByVessel = new Map<string, typeof data.serviceRecords>();
  
  data.serviceRecords.forEach(record => {
    const vesselName = record.vesselName;
    if (!recordsByVessel.has(vesselName)) {
      recordsByVessel.set(vesselName, []);
    }
    recordsByVessel.get(vesselName)!.push(record);
  });

  // Sort records within each vessel by start date
  recordsByVessel.forEach((records, vesselName) => {
    records.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  });

  // Convert to rows, grouped by vessel
  const rows: any[] = [];
  let currentVessel: string | null = null;

  // Sort vessels alphabetically for consistent output
  const sortedVessels = Array.from(recordsByVessel.keys()).sort();

  sortedVessels.forEach(vesselName => {
    const vesselRecords = recordsByVessel.get(vesselName)!;
    
    vesselRecords.forEach(record => {
      // Add vessel name row if this is a new vessel (for grouping)
      if (currentVessel !== vesselName) {
        if (currentVessel !== null) {
          // Add empty row between vessels for visual separation
          rows.push(['', '', '', '', '', '', '', '']);
        }
        currentVessel = vesselName;
      }

      rows.push([
        record.vesselName,
        record.start_date,
        record.end_date,
        record.totalDays,
        record.at_sea_days || 0,
        record.standby_days || 0,
        record.yard_days || 0,
        record.leave_days || 0,
      ]);
    });
  });

  // Add empty row before summary
  if (rows.length > 0) {
    rows.push(['', '', '', '', '', '', '', '']);
  }

  // Add summary row
  rows.push([
    'TOTAL',
    '',
    '',
    data.totalDays,
    data.totalSeaDays,
    data.totalStandbyDays,
    '',
    '',
  ]);

  // Create worksheet
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths for better readability
  worksheet['!cols'] = [
    { wch: 20 }, // Vessel Name
    { wch: 12 }, // Start Date
    { wch: 12 }, // End Date
    { wch: 12 }, // Total Days
    { wch: 12 }, // At Sea Days
    { wch: 12 }, // Standby Days
    { wch: 12 }, // Yard Days
    { wch: 12 }, // Leave Days
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sea Time');

  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { 
    type: 'array', 
    bookType: 'xlsx',
  });

  // Create blob and download
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `sea-time-export-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export sea time data to JSON format
 */
export function exportToJSON(data: SeaTimeReportData): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `sea-time-export-${format(new Date(), 'yyyy-MM-dd')}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* -------------------------------------------------------------------------- */
/* Master Doc — professional multi-sheet SeaJourney vessel workbook           */
/* -------------------------------------------------------------------------- */

const MASTER_NAVY = 'FF0B1F33';
const MASTER_ACCENT = 'FF1D4E89';
const MASTER_HEADER_FILL = 'FF0B1F33';
const MASTER_HEADER_FONT = 'FFFFFFFF';
const MASTER_ZEBRA = 'FFF8FAFC';

function masterSafeText(v: unknown, fallback = '—'): string {
  if (v == null || v === '') return fallback;
  const s = String(v).trim();
  return s || fallback;
}

function masterStateLabel(state: string | null | undefined): string {
  if (!state) return '—';
  const map: Record<string, string> = {
    underway: 'Underway',
    'at-anchor': 'At Anchor',
    'in-port': 'Moored',
    'on-leave': 'On Leave',
    'in-yard': 'In Yard',
  };
  return map[state] || state;
}

function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineNmSimple(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065; // Earth radius nm
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function styleHeaderRow(row: ExcelJS.Row, colCount: number) {
  row.height = 22;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: MASTER_HEADER_FONT }, size: 10 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: MASTER_HEADER_FILL },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: MASTER_ACCENT } },
    };
  }
}

function applyMasterTableBorders(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, cols: number) {
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = 1; c <= cols; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
      if (r > fromRow && (r - fromRow) % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: MASTER_ZEBRA },
        };
      }
    }
  }
}

/**
 * SeaJourney Master Document — one professional workbook with Cover, Vessel,
 * Service Summary, Daily States, Passages, and Track Points sheets.
 */
export async function exportMasterDocExcel(data: SeaTimeReportData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SeaJourney';
  workbook.created = new Date();
  workbook.title = 'SeaJourney Master Document';
  workbook.description = 'Complete vessel daily states and passage logbook export';

  const profile = data.userProfile;
  const vessel = data.vesselDetails;
  const vesselName = vessel?.name || data.serviceRecords[0]?.vesselName || 'Vessel';
  const periodFrom = data.exportPeriod?.from || '—';
  const periodTo = data.exportPeriod?.to || format(new Date(), 'yyyy-MM-dd');
  const exportedAt = format(new Date(), 'd MMM yyyy · HH:mm');
  const personName =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    profile.username ||
    profile.email;

  const stateLogs = data.stateLogs || [];
  const watchDates = new Set(data.watchDates || []);
  const passageLogs = data.passageLogs || [];

  const partOfActivePassageDates = new Set<string>();
  stateLogs.forEach((log) => {
    if (log.isPartOfActivePassage) partOfActivePassageDates.add(log.date);
  });
  const vesselManagerSeaTime = profile?.role === 'vessel';
  const realLogs = stateLogs.filter((l) => !!l.state);
  const { standbyPeriods } = calculateStandbyDays(
    realLogs,
    watchDates,
    partOfActivePassageDates,
    { vesselManagerSeaTime },
  );
  const standbyDates = new Set<string>();
  standbyPeriods.forEach((period) => {
    const periodDays = eachDayOfInterval({
      start: period.startDate,
      end: period.endDate,
    });
    const countedDays = Math.min(period.countedDays || period.days, periodDays.length);
    periodDays.slice(0, countedDays).forEach((day) => {
      standbyDates.add(format(day, 'yyyy-MM-dd'));
    });
  });

  const totalPassageNm = passageLogs.reduce(
    (sum, p) => sum + (typeof p.distance_nm === 'number' ? p.distance_nm : 0),
    0,
  );

  // ── Cover ──────────────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('Cover', {
      views: [{ showGridLines: false }],
    });
    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 48;

    ws.mergeCells('A1:B1');
    const title = ws.getCell('A1');
    title.value = 'SeaJourney Master Document';
    title.font = { bold: true, size: 20, color: { argb: MASTER_NAVY } };
    title.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 32;

    ws.mergeCells('A2:B2');
    ws.getCell('A2').value = 'Complete vessel record — daily states & passages';
    ws.getCell('A2').font = { size: 11, color: { argb: 'FF64748B' }, italic: true };

    const coverRows: [string, string][] = [
      ['Exported', exportedAt],
      ['Account', personName],
      ['Email', profile.email || '—'],
      ['Role', String(profile.role || '—')],
      ['Position', profile.position || '—'],
      ['Vessel', vesselName],
      ['Period from', periodFrom],
      ['Period to', periodTo],
      ['Total logged days', String(data.totalDays)],
      ['At sea days', String(data.totalSeaDays)],
      ['Standby days', String(data.totalStandbyDays)],
      ['Passages', String(passageLogs.length)],
      ['Passage distance (NM)', totalPassageNm ? totalPassageNm.toFixed(1) : '—'],
    ];

    let r = 4;
    for (const [label, value] of coverRows) {
      ws.getCell(r, 1).value = label;
      ws.getCell(r, 1).font = { bold: true, color: { argb: 'FF475569' }, size: 10 };
      ws.getCell(r, 2).value = value;
      ws.getCell(r, 2).font = { size: 11, color: { argb: MASTER_NAVY } };
      r++;
    }

    ws.getCell(r + 1, 1).value =
      'Sheets: Cover · Vessel · Service Summary · Daily States · Passages · Track Points';
    ws.getCell(r + 1, 1).font = { size: 9, color: { argb: 'FF94A3B8' } };
    ws.mergeCells(r + 1, 1, r + 1, 2);
  }

  // ── Vessel ─────────────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('Vessel');
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 44;
    const headers = ws.addRow(['Field', 'Value']);
    styleHeaderRow(headers, 2);

    const fields: [string, unknown][] = [
      ['Name', vessel?.name],
      ['Type', vessel?.type],
      ['IMO', vessel?.imo],
      ['Official number', vessel?.officialNumber],
      ['MMSI', vessel?.mmsi],
      ['Call sign', vessel?.call_sign],
      ['Flag', vessel?.flag],
      ['Length (m)', vessel?.length_m],
      ['Beam (m)', vessel?.beam],
      ['Draft (m)', vessel?.draft],
      ['Gross tonnage', vessel?.gross_tonnage],
      ['Build year', vessel?.build_year],
      ['Crew complement', vessel?.number_of_crew],
      ['Management company', vessel?.management_company],
      ['Company address', vessel?.company_address],
      ['Company contact', vessel?.company_contact],
      ['Description', vessel?.description],
      ['AIS tracking enabled', vessel?.aisTrackingEnabled ? 'Yes' : 'No'],
      ['Last AIS nav status', vessel?.aisLastNavStatus],
      ['Last AIS speed (kn)', vessel?.aisLastSpeed],
      ['Last AIS position at', vessel?.aisLastPositionAt],
    ];
    for (const [label, value] of fields) {
      ws.addRow([label, masterSafeText(value)]);
    }
    applyMasterTableBorders(ws, 1, ws.rowCount, 2);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ── Service Summary ────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('Service Summary');
    const cols = [
      'Vessel',
      'Start',
      'End',
      'Total days',
      'At sea',
      'Standby',
      'Yard',
      'Leave',
    ];
    cols.forEach((c, i) => {
      ws.getColumn(i + 1).width = i === 0 ? 22 : 12;
    });
    styleHeaderRow(ws.addRow(cols), cols.length);
    for (const rec of data.serviceRecords) {
      ws.addRow([
        rec.vesselName,
        (rec as any).start_date || '',
        (rec as any).end_date || '',
        rec.totalDays,
        (rec as any).at_sea_days ?? 0,
        (rec as any).standby_days ?? 0,
        (rec as any).yard_days ?? 0,
        (rec as any).leave_days ?? 0,
      ]);
    }
    const totalRow = ws.addRow([
      'TOTAL',
      '',
      '',
      data.totalDays,
      data.totalSeaDays,
      data.totalStandbyDays,
      '',
      '',
    ]);
    totalRow.font = { bold: true };
    applyMasterTableBorders(ws, 1, ws.rowCount, cols.length);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ── Daily States ───────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('Daily States');
    const cols = [
      'Date',
      'Day',
      'State',
      'Part of passage',
      'On watch',
      'Standby',
      'Vessel',
      'Notes',
    ];
    const widths = [12, 10, 16, 14, 10, 10, 20, 40];
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    styleHeaderRow(ws.addRow(cols), cols.length);

    const vesselNameMap = new Map<string, string>();
    data.serviceRecords.forEach((record) => {
      if (record.vesselId) vesselNameMap.set(record.vesselId, record.vesselName);
    });
    if (vessel?.id && vessel.name) vesselNameMap.set(vessel.id, vessel.name);

    const sorted = [...stateLogs].sort((a, b) => a.date.localeCompare(b.date));
    for (const log of sorted) {
      const day = parse(log.date, 'yyyy-MM-dd', new Date());
      const onWatch = watchDates.has(log.date) ? 'Yes' : 'No';
      const partPassage = log.isPartOfActivePassage ? 'Yes' : 'No';
      const standby = standbyDates.has(log.date) ? 'Yes' : 'No';
      const row = ws.addRow([
        log.date,
        format(day, 'EEE'),
        masterStateLabel(log.state),
        partPassage,
        onWatch,
        standby,
        vesselNameMap.get(log.vesselId) || vesselName,
        log.notes || '',
      ]);

      if (log.state) {
        const solid = calendarStateExcelSolidArgb(log.state);
        const fill = mixArgbTowardWhite(solid, 0.38);
        row.getCell(3).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fill },
        };
        row.getCell(3).font = {
          color: { argb: fontArgbForFill(fill) },
          bold: true,
          size: 10,
        };
      }
      if (partPassage === 'Yes') {
        row.getCell(4).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: mixArgbTowardWhite('FF2563EB', 0.34) },
        };
      }
      if (onWatch === 'Yes') {
        row.getCell(5).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: mixArgbTowardWhite('FFFACC15', 0.62) },
        };
      }
      if (standby === 'Yes') {
        row.getCell(6).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: mixArgbTowardWhite('FF9333EA', 0.32) },
        };
      }
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cols.length },
    };
  }

  // ── Passages ───────────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('Passages');
    const cols = [
      'Departure',
      'Arrival',
      'Start (UTC)',
      'End (UTC)',
      'Duration (h)',
      'Distance (NM)',
      'Avg speed (kn)',
      'Max speed (kn)',
      'Engine hours',
      'Type',
      'Weather',
      'Sea state',
      'Dep lat',
      'Dep lon',
      'Arr lat',
      'Arr lon',
      'Track points',
      'Source',
      'Notes',
      'Vessel',
    ];
    cols.forEach((_, i) => {
      ws.getColumn(i + 1).width = i < 4 ? 18 : 12;
    });
    ws.getColumn(19).width = 36;
    styleHeaderRow(ws.addRow(cols), cols.length);

    for (const p of passageLogs) {
      const start = new Date(p.start_time);
      const end = new Date(p.end_time);
      const durationH =
        Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
          ? ((end.getTime() - start.getTime()) / 3_600_000).toFixed(1)
          : '';
      const track = (p.track_data || {}) as {
        avgSpeedKn?: number | null;
        maxSpeedKn?: number | null;
        pointCount?: number | null;
        coordinates?: [number, number][];
        distanceNm?: number | null;
      };
      const avgSpeed =
        p.avg_speed_knots ?? track.avgSpeedKn ?? null;
      const maxSpeed = track.maxSpeedKn ?? null;
      const pointCount =
        track.pointCount ??
        (Array.isArray(track.coordinates) ? track.coordinates.length : null);
      const dep =
        [p.departure_port, p.departure_country].filter(Boolean).join(', ') || '—';
      const arr =
        [p.arrival_port, p.arrival_country].filter(Boolean).join(', ') || '—';

      ws.addRow([
        dep,
        arr,
        Number.isFinite(start.getTime()) ? start.toISOString() : p.start_time,
        Number.isFinite(end.getTime()) ? end.toISOString() : p.end_time,
        durationH,
        p.distance_nm ?? track.distanceNm ?? '',
        avgSpeed ?? '',
        maxSpeed ?? '',
        p.engine_hours ?? '',
        p.passage_type || '',
        p.weather_summary || '',
        p.sea_state || '',
        p.departure_lat ?? '',
        p.departure_lon ?? '',
        p.arrival_lat ?? '',
        p.arrival_lon ?? '',
        pointCount ?? '',
        p.source || '',
        p.notes || '',
        vesselName,
      ]);
    }
    applyMasterTableBorders(ws, 1, Math.max(1, ws.rowCount), cols.length);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cols.length },
    };
  }

  // ── Track Points (derived course between fixes — AIS heading not stored on passages) ──
  {
    const ws = workbook.addWorksheet('Track Points');
    const cols = [
      'Passage #',
      'Departure → Arrival',
      'Point #',
      'Lon',
      'Lat',
      'Segment NM',
      'Course °',
      'Passage avg kn',
      'Passage max kn',
    ];
    cols.forEach((_, i) => {
      ws.getColumn(i + 1).width = i === 1 ? 28 : 12;
    });
    styleHeaderRow(ws.addRow(cols), cols.length);

    let passageIndex = 0;
    for (const p of passageLogs) {
      passageIndex++;
      const track = (p.track_data || {}) as {
        coordinates?: [number, number][];
        avgSpeedKn?: number | null;
        maxSpeedKn?: number | null;
      };
      const coords = Array.isArray(track.coordinates) ? track.coordinates : [];
      if (coords.length === 0) continue;
      const label =
        `${masterSafeText(p.departure_port, '?')} → ${masterSafeText(p.arrival_port, '?')}`;
      for (let i = 0; i < coords.length; i++) {
        const [lon, lat] = coords[i];
        let segNm = '';
        let course = '';
        if (i > 0) {
          const [plon, plat] = coords[i - 1];
          if (
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            Number.isFinite(plat) &&
            Number.isFinite(plon)
          ) {
            segNm = haversineNmSimple(plat, plon, lat, lon).toFixed(3);
            course = bearingDeg(plat, plon, lat, lon).toFixed(1);
          }
        }
        ws.addRow([
          passageIndex,
          label,
          i + 1,
          Number.isFinite(lon) ? lon : '',
          Number.isFinite(lat) ? lat : '',
          segNm,
          course,
          p.avg_speed_knots ?? track.avgSpeedKn ?? '',
          track.maxSpeedKn ?? '',
        ]);
      }
    }
    if (ws.rowCount === 1) {
      ws.addRow(['—', 'No AIS track coordinates stored on passages', '', '', '', '', '', '', '']);
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  const safeName = vesselName.replace(/[^\w\-]+/g, '_').slice(0, 40);
  link.setAttribute(
    'download',
    `seajourney-master-doc-${safeName}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
  );
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

