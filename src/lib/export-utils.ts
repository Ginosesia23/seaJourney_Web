/**
 * Export utilities for sea time data
 * Supports CSV, Excel XML, JSON, and PDF formats
 */

import type { SeaTimeReportData } from '@/app/actions';
import { format, parse, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { calculateStandbyDays } from './standby-calculation';

/**
 * Export sea time data to CSV format
 */
export function exportToCSV(data: SeaTimeReportData): void {
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

  const rows = data.serviceRecords.map(record => [
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
  rows.push([
    'TOTAL',
    '',
    '',
    data.totalDays.toString(),
    data.totalSeaDays.toString(),
    data.totalStandbyDays.toString(),
    '',
    '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

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
  
  const { standbyPeriods } = calculateStandbyDays(stateLogs, watchDates, partOfActivePassageDates);
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

  // Define color scheme for states
  const stateColors: Record<string, string> = {
    'underway': 'FF4A90E2',      // Blue
    'in-port': 'FF90EE90',       // Light Green
    'at-anchor': 'FFFFD700',     // Gold
    'on-leave': 'FFFF69B4',      // Hot Pink
    'in-yard': 'FFFFA500',       // Orange
  };

  // Define colors for Yes/No indicators
  const yesColor = 'FF90EE90';   // Light Green
  const noColor = 'FFFFF0F0';    // Very Light Red/Pink

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
    const headers = ['Date', 'Day', 'State', 'Part of Passage', 'On Watch', 'Standby', 'Vessel'];
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
        const vesselName = vesselNameMap.get(log.vesselId) || 'Unknown Vessel';
        
        const row = worksheet.addRow([
          format(day, 'yyyy-MM-dd'),
          format(day, 'EEE'),
          stateDisplay,
          partOfPassage,
          onWatch,
          isStandby,
          vesselName,
        ]);

        // Apply styling to each cell
        row.eachCell((cell, colNumber) => {
          // Default cell style with borders
          cell.style = {
            border: {
              top: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
              left: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
              bottom: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
              right: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
            },
            alignment: { vertical: 'middle' as const },
            font: { size: 10 },
          };

          // Color code State column (column 3)
          if (colNumber === 3) {
            const stateColor = stateColors[log.state] || 'FFFFFFFF';
            cell.fill = {
              type: 'pattern' as const,
              pattern: 'solid' as const,
              fgColor: { argb: stateColor },
            };
            cell.font = { ...cell.font, bold: true };
          }

          // Color code Part of Passage column (column 4)
          if (colNumber === 4) {
            const bgColor = partOfPassage === 'Yes' ? yesColor : noColor;
            cell.fill = {
              type: 'pattern' as const,
              pattern: 'solid' as const,
              fgColor: { argb: bgColor },
            };
            cell.alignment = { ...cell.alignment, horizontal: 'center' as const };
          }

          // Color code On Watch column (column 5)
          if (colNumber === 5) {
            const bgColor = onWatch === 'Yes' ? yesColor : noColor;
            cell.fill = {
              type: 'pattern' as const,
              pattern: 'solid' as const,
              fgColor: { argb: bgColor },
            };
            cell.alignment = { ...cell.alignment, horizontal: 'center' as const };
          }

          // Color code Standby column (column 6)
          if (colNumber === 6) {
            const bgColor = isStandby === 'Yes' ? yesColor : noColor;
            cell.fill = {
              type: 'pattern' as const,
              pattern: 'solid' as const,
              fgColor: { argb: bgColor },
            };
            cell.alignment = { ...cell.alignment, horizontal: 'center' as const };
          }
        });

        row.height = 18;
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
  const stateMap: Record<string, string> = {
    'underway': 'Underway',
    'in-port': 'In Port',
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

